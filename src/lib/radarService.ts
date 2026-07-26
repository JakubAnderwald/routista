import { simplifyPoints, calculateDistance } from "./geoUtils";
import { edgeLengths, pathLengthMeters, RouteLegSummary } from "./routeQuality";
import { removeSpurs, spurCleanupOptionsFor } from "./routeCleanup";
import {
    BoundingBox,
    boundingBoxAreaSqKm,
    boundingBoxOf,
    buildWaterIndex,
    WaterIndex,
} from "./waterGeometry";
import { BridgeIndex, buildBridgeIndex, planCrossings, repairWaterLegs } from "./riverCrossing";
import { getWaterAndBridges } from "./overpassService";
import { getRedisClient } from "./redisClient";
import { FeatureCollection, Feature } from "geojson";
import * as Sentry from "@sentry/nextjs";
import {
    SIMPLIFICATION_TOLERANCES,
    MODE_TO_RADAR,
    TransportMode
} from "@/config";
import { RADAR_API, CACHE, RIVER_CROSSING, ROUTE_QUALITY } from "@/config";

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
 * Radar returns a `legs` array with one entry per consecutive waypoint pair.
 * This turns those into the compact per-leg summaries attached to the route
 * under `features[0].properties.legs`, used for route quality diagnostics.
 *
 * Chunks overlap by design, so the same leg can arrive twice; the first
 * summary for a given index wins.
 *
 * @param legs - Raw `legs` array from a Radar directions response.
 * @param chunkStart - Index in `waypoints` of the chunk's first point.
 * @param waypoints - The full waypoint list the route was requested for.
 * @param into - Map to accumulate summaries into, keyed by leg start index.
 * @param paths - Map to accumulate leg geometry into, keyed the same way.
 */
function collectLegSummaries(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    legs: any[] | undefined,
    chunkStart: number,
    waypoints: [number, number][],
    into: Map<number, RouteLegSummary>,
    paths?: Map<number, [number, number][]>
): void {
    if (!Array.isArray(legs)) return;

    legs.forEach((leg, offset) => {
        const index = chunkStart + offset;
        if (into.has(index)) return;

        const from = waypoints[index];
        const to = waypoints[index + 1];
        if (!from || !to) return;

        const points: [number, number][] = (leg?.geometry?.coordinates ?? []).map(
            ([lng, lat]: [number, number]) => [lat, lng] as [number, number]
        );
        const edges = edgeLengths(points);
        paths?.set(index, points);

        into.set(index, {
            index,
            straightMeters: calculateDistance(from, to),
            routedMeters: leg?.distance?.value ?? 0,
            maxEdgeMeters: edges.length === 0 ? 0 : Math.max(...edges),
            points: points.length,
        });
    });
}

/**
 * Splits waypoints into chunks small enough for one Radar request.
 *
 * Consecutive chunks share exactly one waypoint, which is the point stitching
 * later drops. Sharing two — as this did before — made the router travel the
 * boundary leg twice and left a jump between the duplicates, adding a spurious
 * out-and-back at every chunk boundary.
 *
 * @param waypoints - Waypoints to route, as `[lat, lng]`.
 * @returns Chunks with their start index in `waypoints`.
 * @internal Exported for testing purposes
 */
export function chunkWaypoints(waypoints: number[][]): { start: number; points: number[][] }[] {
    const chunkSize = RADAR_API.chunkSize;
    const chunks: { start: number; points: number[][] }[] = [];

    for (let start = 0; start < waypoints.length - 1; start += chunkSize) {
        const end = Math.min(start + chunkSize + 1, waypoints.length);
        chunks.push({ start, points: waypoints.slice(start, end) });
    }

    // A trailing chunk of one point is not a route; fold it into its
    // predecessor, which stays well inside Radar's 25-waypoint limit.
    const last = chunks[chunks.length - 1];
    if (chunks.length > 1 && last.points.length < 2) {
        chunks.pop();
        chunks[chunks.length - 1].points.push(...last.points);
    }

    return chunks;
}

/** One routing pass: the stitched route plus the per-leg detail behind it. */
interface RoutedWaypoints {
    features: Feature[];
    /** Stitched geometry as GeoJSON `[lng, lat]`. */
    coordinates: number[][];
    legs: RouteLegSummary[];
    /** Routed geometry per leg as `[lat, lng]`, keyed by leg start index. */
    legPaths: Map<number, [number, number][]>;
    distance: number;
    duration: number;
}

/**
 * Routes a waypoint list through the Radar directions API, in chunks.
 *
 * @param waypoints - Waypoints as `[lat, lng]`.
 * @param radarMode - Radar's mode name (`foot`, `bike`, `car`).
 * @param apiKey - Radar API key.
 * @returns The stitched route and its per-leg detail.
 */
async function routeWaypoints(
    waypoints: [number, number][],
    radarMode: string,
    apiKey: string
): Promise<RoutedWaypoints> {
    const chunks = chunkWaypoints(waypoints);
    console.log(`[RadarService] Routing ${waypoints.length} waypoints in ${chunks.length} chunk(s)`);

    const features: Feature[] = [];
    const legSummaries = new Map<number, RouteLegSummary>();
    const legPaths = new Map<number, [number, number][]>();
    let distance = 0;
    let duration = 0;

    for (let chunkIdx = 0; chunkIdx < chunks.length; chunkIdx++) {
        const chunk = chunks[chunkIdx].points;
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
                    "Authorization": apiKey
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

                    distance += route.distance?.value || 0;
                    duration += route.duration?.value || 0;
                }

                collectLegSummaries(
                    route.legs,
                    chunks[chunkIdx].start,
                    waypoints,
                    legSummaries,
                    legPaths
                );
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
    const coordinates: number[][] = [];
    for (let i = 0; i < features.length; i++) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const coords = (features[i].geometry as any).coordinates as number[][];
        // Chunks share their boundary waypoint, so drop the repeated first point
        coordinates.push(...(i > 0 ? coords.slice(1) : coords));
    }

    return {
        features,
        coordinates,
        legs: Array.from(legSummaries.values()).sort((a, b) => a.index - b.index),
        legPaths,
        distance,
        duration,
    };
}

/** What the river crossing repair changed, reported under `properties`. */
interface RiverCrossingDiagnostics {
    waypointsInWater: number;
    crossings: number;
    unbridgedRuns: number;
    repairedLegs: number;
    bridges: string[];
}

/**
 * The area to ask OSM about: where the route actually went wrong, not the
 * whole shape.
 *
 * Every implausibly long edge is somewhere the router left the pedestrian
 * network, so a box around those covers the water that needs bridging while
 * staying far smaller than the shape for large routes. Returns null when even
 * that is too big to fetch, in which case the repair is skipped and the route
 * is returned as Radar produced it.
 *
 * @param routed - The detection pass's result.
 * @param thresholdMeters - Longest plausible edge for the mode.
 * @returns Bounding box to fetch, or null if it is not worth asking.
 */
function repairBoundingBox(
    routed: RoutedWaypoints,
    thresholdMeters: number
): BoundingBox | null {
    const suspect: [number, number][] = [];

    for (const path of routed.legPaths.values()) {
        for (let i = 0; i < path.length - 1; i++) {
            if (calculateDistance(path[i], path[i + 1]) <= thresholdMeters) continue;
            suspect.push(path[i], path[i + 1]);
        }
    }

    const bbox = boundingBoxOf(suspect, RIVER_CROSSING.dataPaddingMeters);
    if (!bbox) return null;

    const areaSqKm = boundingBoxAreaSqKm(bbox);
    if (areaSqKm > RIVER_CROSSING.maxDataAreaSqKm) {
        console.warn(
            `[RadarService] Skipping river repair: ${Math.round(areaSqKm)} km² exceeds the ` +
            `${RIVER_CROSSING.maxDataAreaSqKm} km² OSM fetch limit`
        );
        return null;
    }

    return bbox;
}

/**
 * Moves waypoints that landed in water onto bridges, when a first routing pass
 * shows signs of having used one of Radar's ferry ways.
 *
 * The detector is free: an edge longer than any real street means the router
 * travelled over water. Only then is OSM data fetched, so routes in cities
 * without this problem never pay for it, and Overpass being unavailable simply
 * leaves the route as it was.
 *
 * @param waypoints - Waypoints as routed in the first pass.
 * @param routed - The first pass's result.
 * @param mode - Transport mode.
 * @returns Repaired waypoints with the geometry needed for a second pass, or
 *   null when no repair is needed or possible.
 */
async function repairRiverCrossings(
    waypoints: [number, number][],
    routed: RoutedWaypoints,
    mode: TransportMode
): Promise<{
    waypoints: [number, number][];
    water: WaterIndex;
    bridges: BridgeIndex;
    diagnostics: RiverCrossingDiagnostics;
} | null> {
    if (!RIVER_CROSSING.affectedModes.includes(mode)) return null;

    const threshold = ROUTE_QUALITY.longEdgeThresholdMeters[mode];
    const longest = Math.max(0, ...routed.legs.map(leg => leg.maxEdgeMeters));
    if (longest <= threshold) return null;

    console.log(
        `[RadarService] Longest edge ${Math.round(longest)}m exceeds ${threshold}m for ${mode}; checking for water`
    );

    const bbox = repairBoundingBox(routed, threshold);
    if (!bbox) return null;

    const osm = await getWaterAndBridges(bbox);
    if (!osm) return null;

    const water = buildWaterIndex(osm);
    const bridges = buildBridgeIndex(osm, water);
    const plan = planCrossings(waypoints, water, bridges);

    if (plan.crossings.length === 0 && plan.unbridgedRuns === 0) return null;

    return {
        waypoints: plan.waypoints,
        water,
        bridges,
        diagnostics: {
            waypointsInWater: plan.waypointsInWater,
            crossings: plan.crossings.length,
            unbridgedRuns: plan.unbridgedRuns,
            repairedLegs: 0,
            bridges: plan.crossings.map(crossing => crossing.bridgeName ?? "unnamed"),
        },
    };
}

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

    // Use mode-specific tolerance for Douglas-Peucker simplification from config
    const tolerance = SIMPLIFICATION_TOLERANCES[mode as TransportMode] || SIMPLIFICATION_TOLERANCES["cycling-regular"];
    
    const inputPointCount = coordinates.length;
    const simplifiedCoordinates = simplifyPoints(coordinates, tolerance);
    
    console.log(`[RadarService] Simplification: ${inputPointCount} → ${simplifiedCoordinates.length} points (tolerance: ${tolerance}, mode: ${mode})`);

    // Generate cache key from simplified coordinates and mode
    const cacheKey = `${CACHE.routeKeyPrefix}${mode}:${hashCoordinates(simplifiedCoordinates as [number, number][])}`;
    
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

    // Map transportation mode from app format to Radar format using config
    const radarMode = MODE_TO_RADAR[mode as TransportMode] || "car";

    let waypoints = simplifiedCoordinates as [number, number][];
    let routed = await routeWaypoints(waypoints, radarMode, RADAR_API_KEY);

    const repair = await repairRiverCrossings(waypoints, routed, mode as TransportMode);
    if (repair) {
        waypoints = repair.waypoints;
        routed = await routeWaypoints(waypoints, radarMode, RADAR_API_KEY);

        // Radar can still divert to a pier and back between two dry waypoints,
        // so pin a bridge into any leg that is still travelling on water.
        // Pinning one leg can expose another, so repeat until nothing changes.
        for (let pass = 0; pass < RIVER_CROSSING.maxRepairPasses; pass++) {
            const pinned = repairWaterLegs(
                waypoints,
                routed.legPaths,
                repair.water,
                repair.bridges,
                ROUTE_QUALITY.longEdgeThresholdMeters[mode as TransportMode]
            );
            if (pinned.repaired === 0) break;

            waypoints = pinned.waypoints;
            routed = await routeWaypoints(waypoints, radarMode, RADAR_API_KEY);
            repair.diagnostics.repairedLegs += pinned.repaired;
        }

        console.log(
            `[RadarService] River repair: ${repair.diagnostics.waypointsInWater} waypoints in water, ` +
            `${repair.diagnostics.crossings} bridge crossing(s), ` +
            `${repair.diagnostics.unbridgedRuns} unbridged, ${repair.diagnostics.repairedLegs} leg(s) pinned`
        );
    }

    // If no features were generated (e.g. API errors for all chunks), fallback to straight line
    if (routed.features.length === 0) {
        console.warn('[RadarService] No features generated, falling back to straight line');
        return {
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
                        coordinates: waypoints.map(p => [p[1], p[0]]) // GeoJSON is [lng, lat]
                    }
                }
            ]
        };
    }

    console.log(`[RadarService] Route generated: ${routed.coordinates.length} route points, ${(routed.distance / 1000).toFixed(2)}km, ${Math.round(routed.duration / 60)}min`);

    // Every waypoint is a forced via-point, so any that snapped to a driveway
    // or a side street made the router go in and come straight back out. Splice
    // those out-and-backs away. This runs last: the river crossing repair's
    // detector needs to see the geometry Radar actually returned.
    const cleanup = removeSpurs(
        routed.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]),
        spurCleanupOptionsFor(mode as TransportMode)
    );
    const cleanedMeters = pathLengthMeters(cleanup.points);

    if (cleanup.spurs.length > 0) {
        console.log(
            `[RadarService] Spur cleanup: removed ${cleanup.spurs.length} out-and-back(s), ` +
            `${Math.round(cleanup.removedMeters)}m, leaving ${cleanup.points.length} route points ` +
            `and ${(cleanedMeters / 1000).toFixed(2)}km`
        );
    }

    // Radar's own totals describe the route it drove, which is no longer the
    // route being returned. Report the geometry, and keep the raw numbers for
    // diagnostics. Duration is scaled rather than recomputed: nothing reads it,
    // and an unscaled one would contradict the distance beside it.
    const cleanedDuration =
        routed.distance > 0 ? (routed.duration * cleanedMeters) / routed.distance : routed.duration;

    const result: FeatureCollection = {
        type: "FeatureCollection",
        features: [
            {
                type: "Feature",
                properties: {
                    summary: {
                        distance: cleanedMeters,
                        duration: cleanedDuration,
                        /** What Radar returned, before the spur cleanup. */
                        routedDistance: routed.distance,
                        routedDuration: routed.duration
                    },
                    legs: routed.legs,
                    ...(repair ? { riverCrossing: repair.diagnostics } : {}),
                    ...(cleanup.spurs.length > 0
                        ? {
                              spurCleanup: {
                                  spurs: cleanup.spurs.length,
                                  removedMeters: cleanup.removedMeters,
                                  longestMeters: Math.max(
                                      ...cleanup.spurs.map(spur => spur.meters)
                                  ),
                              },
                          }
                        : {})
                },
                geometry: {
                    type: "LineString",
                    coordinates: cleanup.points.map(([lat, lng]) => [lng, lat])
                }
            }
        ]
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
