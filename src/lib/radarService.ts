import { simplifyPoints } from "./geoUtils";
import { FeatureCollection, Feature } from "geojson";
import { Redis } from "@upstash/redis";
import * as Sentry from "@sentry/nextjs";
import {
    SIMPLIFICATION_TOLERANCES,
    MODE_TO_RADAR,
    TransportMode,
    RIVER_CROSSING,
} from "@/config";
import { RADAR_API, CACHE } from "@/config";
import { calculateDistance } from "./geoUtils";

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
 * @internal Exported for testing purposes
 */
export function hashCoordinates(coordinates: [number, number][]): string {
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
 * Detects river/water crossings between consecutive waypoints by probing
 * with car-mode routing. When a crossing is found, inserts bridge waypoints
 * extracted from the car route so the foot/bike router is guided over a bridge.
 *
 * @internal Exported for testing purposes
 */
export async function preprocessRiverCrossings(
    waypoints: [number, number][],
    apiKey: string
): Promise<{ waypoints: [number, number][]; crossingsFound: number }> {
    if (waypoints.length < 2) {
        return { waypoints, crossingsFound: 0 };
    }

    // Find candidate segments: consecutive pairs with straight-line distance > threshold
    const candidates: { index: number; distance: number }[] = [];
    for (let i = 0; i < waypoints.length - 1; i++) {
        const dist = calculateDistance(waypoints[i], waypoints[i + 1]);
        if (dist > RIVER_CROSSING.minSegmentDistance) {
            candidates.push({ index: i, distance: dist });
        }
    }

    // Sort by distance descending, cap at maxProbes
    candidates.sort((a, b) => b.distance - a.distance);
    const probes = candidates.slice(0, RIVER_CROSSING.maxProbes);

    // Probe each candidate with car-mode routing
    const crossings: { index: number; bridgePoints: [number, number][] }[] = [];

    for (const probe of probes) {
        const w1 = waypoints[probe.index];
        const w2 = waypoints[probe.index + 1];

        try {
            const locationsParam = `${w1[0]},${w1[1]}|${w2[0]},${w2[1]}`;
            const url = new URL('https://api.radar.io/v1/route/directions');
            url.searchParams.append('locations', locationsParam);
            url.searchParams.append('mode', 'car');
            url.searchParams.append('geometry', 'linestring');
            url.searchParams.append('units', 'metric');

            const response = await fetch(url.toString(), {
                method: "GET",
                headers: { "Authorization": apiKey },
            });

            if (!response.ok) continue;

            const data = await response.json();
            if (!data.routes || data.routes.length === 0) continue;

            const route = data.routes[0];
            const carDist = route.distance?.value || 0;
            const ratio = carDist / probe.distance;

            if (ratio > RIVER_CROSSING.detourRatioThreshold) {
                // Extract bridge waypoints from middle 60% of car route geometry
                const coords: number[][] = route.geometry?.coordinates || [];
                if (coords.length >= 2) {
                    const startIdx = Math.floor(coords.length * 0.2);
                    const endIdx = Math.floor(coords.length * 0.8);
                    const bridgeSection = coords.slice(startIdx, endIdx + 1);

                    const bridgePoints: [number, number][] = [];
                    const count = RIVER_CROSSING.bridgePointCount;
                    for (let j = 0; j < count; j++) {
                        const t = bridgeSection.length <= 1 ? 0 : j / (count - 1);
                        const idx = Math.min(Math.floor(t * (bridgeSection.length - 1)), bridgeSection.length - 1);
                        // Radar returns [lng, lat], convert to [lat, lng]
                        bridgePoints.push([bridgeSection[idx][1], bridgeSection[idx][0]]);
                    }

                    crossings.push({ index: probe.index, bridgePoints });
                    console.log(`[RadarService] River crossing detected between waypoints ${probe.index}-${probe.index + 1} (ratio: ${ratio.toFixed(1)}, dist: ${probe.distance.toFixed(0)}m)`);
                }
            }

            // Small delay between probes
            await new Promise(resolve => setTimeout(resolve, 100));
        } catch {
            // Probe failed — skip this segment, keep original waypoints
            console.warn(`[RadarService] River crossing probe failed for segment ${probe.index}`);
        }
    }

    if (crossings.length === 0) {
        return { waypoints, crossingsFound: 0 };
    }

    // Insert bridge waypoints from end to start to avoid index shifts
    crossings.sort((a, b) => b.index - a.index);
    const result = [...waypoints];
    for (const crossing of crossings) {
        result.splice(crossing.index + 1, 0, ...crossing.bridgePoints);
    }

    console.log(`[RadarService] Preprocessed ${crossings.length} river crossing(s), waypoints: ${waypoints.length} → ${result.length}`);
    return { waypoints: result, crossingsFound: crossings.length };
}

export interface RouteMetadata {
    inputPoints: number;
    simplifiedPoints: number;
    waypointsAfterPreprocess: number;
    riverCrossingsDetected: number;
    routePoints: number;
    cacheStatus: 'hit' | 'miss' | 'disabled' | 'error';
    chunks: number;
    distanceKm: number;
    durationMin: number;
}

export interface RouteResult {
    geoJson: FeatureCollection;
    _metadata: RouteMetadata;
}

/**
 * Generates a route by calling the Radar API.
 * This function is designed to be used server-side to keep API keys secure.
 *
 * @param options - Configuration options including coordinates and mode.
 * @returns Route result with GeoJSON and metadata.
 */
export async function getRadarRoute(options: RouteGenerationOptions): Promise<RouteResult> {
    const { coordinates, mode } = options;

    if (!coordinates || !Array.isArray(coordinates) || coordinates.length < 2) {
        throw new Error("Invalid coordinates");
    }

    // Use mode-specific tolerance for Douglas-Peucker simplification from config
    const tolerance = SIMPLIFICATION_TOLERANCES[mode as TransportMode] || SIMPLIFICATION_TOLERANCES["cycling-regular"];

    const inputPointCount = coordinates.length;
    let simplifiedCoordinates = simplifyPoints(coordinates, tolerance);

    console.log(`[RadarService] Simplification: ${inputPointCount} → ${simplifiedCoordinates.length} points (tolerance: ${tolerance}, mode: ${mode})`);

    // Pre-process river crossings for foot/bike modes
    const RADAR_API_KEY_EARLY = process.env.NEXT_PUBLIC_RADAR_LIVE_PK || process.env.NEXT_PUBLIC_RADAR_TEST_PK;
    const radarModeEarly = MODE_TO_RADAR[mode as TransportMode] || "car";
    let riverCrossingsDetected = 0;

    if (RADAR_API_KEY_EARLY && (radarModeEarly === 'foot' || radarModeEarly === 'bike')) {
        const result = await preprocessRiverCrossings(
            simplifiedCoordinates as [number, number][],
            RADAR_API_KEY_EARLY
        );
        simplifiedCoordinates = result.waypoints;
        riverCrossingsDetected = result.crossingsFound;
    }

    const metadata: RouteMetadata = {
        inputPoints: inputPointCount,
        simplifiedPoints: simplifiedCoordinates.length,
        waypointsAfterPreprocess: simplifiedCoordinates.length,
        riverCrossingsDetected,
        routePoints: 0,
        cacheStatus: 'disabled',
        chunks: 0,
        distanceKm: 0,
        durationMin: 0,
    };

    // Generate cache key from simplified coordinates and mode
    const cacheKey = `${CACHE.routeKeyPrefix}${mode}:${hashCoordinates(simplifiedCoordinates as [number, number][])}`;

    // Get Redis client (may be null if not configured)
    const redis = getRedisClient();

    // Try to get cached result (only if Redis is configured)
    if (redis) {
        try {
            const cachedResult = await redis.get<RouteResult>(cacheKey);
            if (cachedResult) {
                console.log(`[RadarService] Cache HIT for key: ${cacheKey}`);
                cachedResult._metadata.cacheStatus = 'hit';
                return cachedResult;
            }
            console.log(`[RadarService] Cache MISS for key: ${cacheKey}`);
            metadata.cacheStatus = 'miss';
        } catch (cacheError) {
            // Redis error - continue without cache
            console.log(`[RadarService] Cache error, proceeding without cache: ${cacheError instanceof Error ? cacheError.message : 'unknown error'}`);
            metadata.cacheStatus = 'error';
        }
    } else {
        console.log(`[RadarService] Redis not configured, proceeding without cache`);
    }

    const RADAR_API_KEY = process.env.NEXT_PUBLIC_RADAR_LIVE_PK || process.env.NEXT_PUBLIC_RADAR_TEST_PK;

    // If no API key, return a mock response
    if (!RADAR_API_KEY) {
        console.warn("[RadarService] No Radar API key provided, using mock response");
        const mockCoordinates = simplifiedCoordinates.map((c: number[]) => [c[1], c[0]]); // Convert to [lng, lat] for GeoJSON
        metadata.routePoints = mockCoordinates.length;
        return {
            geoJson: {
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
            },
            _metadata: metadata,
        };
    }

    // Map transportation mode from app format to Radar format using config
    const radarMode = MODE_TO_RADAR[mode as TransportMode] || "car";

    // Batching logic - Radar supports up to 25 coordinates per request
    // Each chunk overlaps by 1 point so segments connect properly
    const chunkSize = RADAR_API.chunkSize;
    const chunks = [];
    let startIndex = 0;
    while (startIndex < simplifiedCoordinates.length) {
        const endIndex = Math.min(startIndex + chunkSize + 1, simplifiedCoordinates.length);
        const chunk = simplifiedCoordinates.slice(startIndex, endIndex);
        chunks.push(chunk);
        // Move forward by chunkSize - 1 to overlap last point with next chunk's first
        startIndex += chunkSize - 1;
        // Ensure we exit if we've processed all coordinates
        if (endIndex >= simplifiedCoordinates.length) break;
    }
    
    console.log(`[RadarService] Routing ${simplifiedCoordinates.length} waypoints in ${chunks.length} chunk(s)`);

    const features: Feature[] = [];
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
            await new Promise(resolve => setTimeout(resolve, RADAR_API.delayBetweenChunksMs));
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
            
            throw e; // Re-throw to indicate a failure in route generation
        }
    }

    // Stitch features into a single LineString
    const mergedCoordinates: number[][] = [];

    for (let i = 0; i < features.length; i++) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const coords = (features[i].geometry as any).coordinates as number[][];
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
        metadata.routePoints = simplifiedCoordinates.length;
        return {
            geoJson: {
                type: "FeatureCollection",
                features: [
                    {
                        type: "Feature",
                        properties: {
                            summary: {
                                distance: 0,
                                duration: 0
                            }
                        },
                        geometry: {
                            type: "LineString",
                            coordinates: simplifiedCoordinates.map(p => [p[1], p[0]]) // GeoJSON is [lng, lat]
                        }
                    }
                ]
            },
            _metadata: metadata,
        };
    }

    console.log(`[RadarService] Route generated: ${mergedCoordinates.length} route points, ${(totalDistance / 1000).toFixed(2)}km, ${Math.round(totalDuration / 60)}min`);

    metadata.routePoints = mergedCoordinates.length;
    metadata.chunks = chunks.length;
    metadata.distanceKm = Math.round(totalDistance / 10) / 100;
    metadata.durationMin = Math.round(totalDuration / 60);

    const result: RouteResult = {
        geoJson: {
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
        },
        _metadata: metadata,
    };

    // Cache the result for future requests (only if Redis is configured)
    if (redis) {
        try {
            await redis.set(cacheKey, result, { ex: CACHE.ttlSeconds });
            console.log(`[RadarService] Cached result with key: ${cacheKey} (TTL: ${CACHE.ttlSeconds}s)`);
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
