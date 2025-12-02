import { simplifyPoints } from "./geoUtils";
import { FeatureCollection, Feature } from "geojson";

export interface RouteGenerationOptions {
    coordinates: [number, number][];
    mode: string;
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

    // Use mode-specific tolerance - car routing is stricter, so we need fewer waypoints
    // Higher tolerance = fewer points = better chance all points are on roads
    const toleranceMap: Record<string, number> = {
        "driving-car": 0.002,    // 20x higher - car routing is very strict about roads
        "cycling-regular": 0.0005, // 5x higher - bike can use more paths
        "foot-walking": 0.0002     // 2x higher - foot is most flexible
    };
    const tolerance = toleranceMap[mode] || 0.0001;
    const simplifiedCoordinates = simplifyPoints(coordinates, tolerance);

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

    const features: Feature[] = []; // Explicitly type features as Feature[]
    let totalDistance = 0;
    let totalDuration = 0;

    for (const chunk of chunks) {
        // Format coordinates as pipe-delimited lat,lng pairs
        const locationsParam = chunk.map((c: number[]) => `${c[0]},${c[1]}`).join('|');

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

    return {
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
        ],
        properties: {
            summary: {
                distance: totalDistance,
                duration: totalDuration
            }
        }
    };
}
