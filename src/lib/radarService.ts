import { simplifyPoints } from "./geoUtils";
import { FeatureCollection, Feature } from "geojson";
import { Redis } from "@upstash/redis";
import * as Sentry from "@sentry/nextjs";

/**
 * Create Redis client from environment variables.
 * Checks both Vercel KV and Upstash naming conventions.
 * Returns null if not configured.
 */
function getRedisClient(): Redis | null {
    // Check Vercel KV naming convention first, then Upstash native naming
    const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
    
    if (!url || !token) {
        return null;
    }
    
    return new Redis({ url, token });
}

export interface RouteGenerationOptions {
    coordinates: [number, number][];
    mode: string;
}

export interface RadarAddress {
    latitude: number;
    longitude: number;
    formattedAddress: string;
}

export interface AutocompleteResponse {
    addresses: RadarAddress[];
}

/**
 * Creates a hash string from coordinates array for cache key generation.
 * Uses a simple but effective hash that captures coordinate precision.
 */
function hashCoordinates(coordinates: [number, number][]): string {
    // Round to 5 decimal places (~1m precision) and create a stable string representation
    const coordString = coordinates
        .map(([lat, lng]) => `${lat.toFixed(5)},${lng.toFixed(5)}`)
        .join('|');
    
    // Simple hash function (djb2 algorithm)
    let hash = 5381;
    for (let i = 0; i < coordString.length; i++) {
        hash = ((hash << 5) + hash) + coordString.charCodeAt(i);
        hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
}

/**
 * Cache TTL in seconds (24 hours)
 */
const CACHE_TTL_SECONDS = 24 * 60 * 60;

/**
 * Generates a route by calling the Radar API.
 * This function is designed to be used server-side to keep API keys secure.
 * 
 * @param options - Configuration options including coordinates and mode.
 * @returns A GeoJSON FeatureCollection containing the route.
 */
export async function getRadarRoute(options: RouteGenerationOptions): Promise<FeatureCollection> {
    const { coordinates, mode } = options;

    if (!coordinates || !Array.isArray(coordinates) || coordinates.length < 2) {
        throw new Error("Invalid coordinates");
    }

    // Use mode-specific tolerance for Douglas-Peucker simplification
    // Lower tolerance = more points preserved = better shape fidelity
    // Values are in degrees (~0.0001° ≈ 11m at equator, ~7m at 50° latitude)
    // 
    // IMPORTANT: Previously tolerances were 5-10x higher causing severe over-simplification
    // for open shapes (non-closed loops). See GitHub issue #5.
    const toleranceMap: Record<string, number> = {
        "driving-car": 0.0004,     // ~30-45m - car needs roads, can't follow every detail
        "cycling-regular": 0.0001, // ~7-11m - bikes can use more paths, preserve more detail
        "foot-walking": 0.00005    // ~4-6m - foot is most flexible, preserve fine detail
    };
    const tolerance = toleranceMap[mode] || 0.0001;
    
    const inputPointCount = coordinates.length;
    const simplifiedCoordinates = simplifyPoints(coordinates, tolerance);
    
    console.log(`[RadarService] Simplification: ${inputPointCount} → ${simplifiedCoordinates.length} points (tolerance: ${tolerance}, mode: ${mode})`);

    // Generate cache key from simplified coordinates and mode
    const cacheKey = `route:${mode}:${hashCoordinates(simplifiedCoordinates as [number, number][])}`;
    
    // Get Redis client (may be null if not configured)
    const redis = getRedisClient();
    
    // Try to get cached result (only if Redis is configured)
    if (redis) {
        try {
            const cachedResult = await redis.get<FeatureCollection>(cacheKey);
            if (cachedResult) {
                console.log(`[RadarService] Cache HIT for key: ${cacheKey}`);
                return cachedResult;
            }
            console.log(`[RadarService] Cache MISS for key: ${cacheKey}`);
        } catch (cacheError) {
            // Redis error - continue without cache
            console.log(`[RadarService] Cache error, proceeding without cache: ${cacheError instanceof Error ? cacheError.message : 'unknown error'}`);
        }
    } else {
        console.log(`[RadarService] Redis not configured, proceeding without cache`);
    }

    const RADAR_API_KEY = process.env.NEXT_PUBLIC_RADAR_LIVE_PK || process.env.NEXT_PUBLIC_RADAR_TEST_PK;

    // If no API key, return a mock response
    if (!RADAR_API_KEY) {
        console.warn("[RadarService] No Radar API key provided, using mock response");
        const mockCoordinates = simplifiedCoordinates.map((c: number[]) => [c[1], c[0]]); // Convert to [lng, lat] for GeoJSON
        return {
            type: "FeatureCollection",
            features: [
                {
                    type: "Feature",
                    properties: {
                        summary: {
                            distance: 1234,
                            duration: 567
                        }
                    },
                    geometry: {
                        type: "LineString",
                        coordinates: mockCoordinates
                    }
                }
            ]
        };
    }

    // Map transportation modes from app format to Radar format
    const modeMap: Record<string, string> = {
        "driving-car": "car",
        "cycling-regular": "bike",
        "foot-walking": "foot"
    };
    const radarMode = modeMap[mode] || "car";

    // Batching logic - Radar supports up to 25 coordinates per request
    const chunkSize = 10;
    const chunks = [];
    for (let i = 0; i < simplifiedCoordinates.length; i += chunkSize) {
        // Ensure overlap so segments connect
        const chunk = simplifiedCoordinates.slice(i, i + chunkSize + 1);
        chunks.push(chunk);
        // Adjust index to overlap the last point of this chunk with first of next
        if (i + chunkSize < simplifiedCoordinates.length) {
            i--;
        }
    }
    
    console.log(`[RadarService] Routing ${simplifiedCoordinates.length} waypoints in ${chunks.length} chunk(s)`);

    const features: Feature[] = []; // Explicitly type features as Feature[]
    let totalDistance = 0;
    let totalDuration = 0;

    for (let chunkIdx = 0; chunkIdx < chunks.length; chunkIdx++) {
        const chunk = chunks[chunkIdx];
        // Format coordinates as pipe-delimited lat,lng pairs
        const locationsParam = chunk.map((c: number[]) => `${c[0]},${c[1]}`).join('|');
        
        console.log(`[RadarService] Processing chunk ${chunkIdx + 1}/${chunks.length} with ${chunk.length} points`);

        const url = new URL('https://api.radar.io/v1/route/directions');
        url.searchParams.append('locations', locationsParam);
        url.searchParams.append('mode', radarMode);
        url.searchParams.append('geometry', 'linestring'); // Get GeoJSON LineString
        url.searchParams.append('units', 'metric');

        try {
            const response = await fetch(url.toString(), {
                method: "GET",
                headers: {
                    "Authorization": RADAR_API_KEY
                }
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`[RadarService] Radar API Error: ${response.status} ${response.statusText} - ${errorText}`);
                // Continue to next chunk or handle as a full failure
                // For now, we'll throw, but a more robust solution might try to recover or skip
                throw new Error(`Radar API Error: ${response.status} ${response.statusText} - ${errorText}`);
            }

            const data = await response.json();

            if (data.routes && data.routes.length > 0) {
                const route = data.routes[0];

                // Extract geometry - Radar returns GeoJSON LineString in geometry.coordinates
                if (route.geometry && route.geometry.coordinates) {
                    features.push({
                        type: "Feature",
                        properties: {
                            summary: {
                                distance: route.distance?.value || 0,
                                duration: route.duration?.value || 0
                            }
                        },
                        geometry: route.geometry
                    });

                    totalDistance += route.distance?.value || 0;
                    totalDuration += route.duration?.value || 0;
                }
            }

            // Add a small delay to avoid rate limits
            await new Promise(resolve => setTimeout(resolve, 200));
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (e: any) {
            console.error(`[RadarService] Fetch error for chunk: ${e.message || e}`);
            
            // Capture error in Sentry with context
            Sentry.captureException(e, {
                extra: {
                    service: "RadarService",
                    operation: "getRadarRoute",
                    chunkIndex: chunkIdx,
                    totalChunks: chunks.length,
                    mode: radarMode,
                }
            });
            
            // Depending on desired behavior, you might want to re-throw or push a "failed chunk" feature
            throw e; // Re-throw to indicate a failure in route generation
        }
    }

    // Stitch features into a single LineString
    const mergedCoordinates: number[][] = [];

    for (let i = 0; i < features.length; i++) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const coords = (features[i].geometry as any).coordinates as number[][]; // Cast to any then number[][]
        // If not the first chunk, skip the first point as it overlaps with the last point of previous chunk
        if (i > 0) {
            mergedCoordinates.push(...coords.slice(1));
        } else {
            mergedCoordinates.push(...coords);
        }
    }

    // If no features were generated (e.g. API errors for all chunks), fallback to straight line
    if (features.length === 0) {
        console.warn('[RadarService] No features generated, falling back to straight line');
        return {
            type: "FeatureCollection",
            features: [
                {
                    type: "Feature",
                    properties: {
                        summary: {
                            distance: 0, // Cannot calculate without route
                            duration: 0  // Cannot calculate without route
                        }
                    },
                    geometry: {
                        type: "LineString",
                        coordinates: simplifiedCoordinates.map(p => [p[1], p[0]]) // GeoJSON is [lng, lat]
                    }
                }
            ]
        };
    }

    console.log(`[RadarService] Route generated: ${mergedCoordinates.length} route points, ${(totalDistance / 1000).toFixed(2)}km, ${Math.round(totalDuration / 60)}min`);
    
    const result: FeatureCollection = {
        type: "FeatureCollection",
        features: [
            {
                type: "Feature",
                properties: {
                    summary: {
                        distance: totalDistance,
                        duration: totalDuration
                    }
                },
                geometry: {
                    type: "LineString",
                    coordinates: mergedCoordinates
                }
            }
        ]
    };

    // Cache the result for future requests (only if Redis is configured)
    if (redis) {
        try {
            await redis.set(cacheKey, result, { ex: CACHE_TTL_SECONDS });
            console.log(`[RadarService] Cached result with key: ${cacheKey} (TTL: ${CACHE_TTL_SECONDS}s)`);
        } catch (cacheError) {
            // Redis error - continue without caching
            console.log(`[RadarService] Failed to cache result: ${cacheError instanceof Error ? cacheError.message : 'unknown error'}`);
        }
    }

    return result;
}

/**
 * Searches for location autocomplete suggestions using Radar API.
 * This function is designed to be used server-side to keep API keys secure.
 * 
 * @param query - Search query string.
 * @returns Autocomplete response with address suggestions.
 */
export async function getRadarAutocomplete(query: string): Promise<AutocompleteResponse> {
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
        return { addresses: [] };
    }

    const RADAR_API_KEY = process.env.NEXT_PUBLIC_RADAR_LIVE_PK || process.env.NEXT_PUBLIC_RADAR_TEST_PK;

    if (!RADAR_API_KEY) {
        console.warn("[RadarService] No Radar API key provided for autocomplete");
        return { addresses: [] };
    }

    const url = new URL('https://api.radar.io/v1/search/autocomplete');
    url.searchParams.append('query', query);
    url.searchParams.append('limit', '5');

    try {
        const response = await fetch(url.toString(), {
            method: "GET",
            headers: {
                "Authorization": RADAR_API_KEY
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[RadarService] Autocomplete API Error: ${response.status} ${response.statusText} - ${errorText}`);
            
            // Capture API errors in Sentry
            Sentry.captureMessage(`Autocomplete API Error: ${response.status}`, {
                level: "error",
                extra: {
                    service: "RadarService",
                    operation: "getRadarAutocomplete",
                    status: response.status,
                    statusText: response.statusText,
                    errorText,
                }
            });
            
            return { addresses: [] };
        }

        const data = await response.json();
        return { addresses: data.addresses || [] };
    } catch (error: unknown) {
        console.error("[RadarService] Autocomplete fetch error:", error);
        
        // Capture error in Sentry
        Sentry.captureException(error, {
            extra: {
                service: "RadarService",
                operation: "getRadarAutocomplete",
            }
        });
        
        return { addresses: [] };
    }
}
