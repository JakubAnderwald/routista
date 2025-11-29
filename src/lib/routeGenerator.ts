import { simplifyPoints } from "./geoUtils";



export interface RouteGenerationOptions {
    /** Array of [lat, lng] coordinates representing the shape to route. */
    coordinates: [number, number][];
    /** Transportation mode: "driving-car", "cycling-regular", "foot-walking". */
    mode: string;
}

/**
 * Generates a navigable route that follows the shape of the provided coordinates.
 * 
 * This function:
 * 1. Simplifies the input coordinates to reduce API load.
 * 2. Batches the coordinates into chunks to respect API limits.
 * 3. Calls the Radar Directions API for each chunk.
 * 4. Stitches the resulting route segments into a single continuous path.
 * 
 * @param options - Configuration options for route generation.
 * @returns A GeoJSON FeatureCollection containing the route LineString.
 * @throws Error if the API call fails or input is invalid.
 */
import { FeatureCollection } from "geojson";

export async function generateRoute(options: RouteGenerationOptions): Promise<FeatureCollection> {
    const { coordinates, mode } = options;

    if (!coordinates || coordinates.length < 2) {
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

    console.log(`Simplified from ${coordinates.length} to ${simplifiedCoordinates.length} points (mode: ${mode}, tolerance: ${tolerance})`);

    const RADAR_API_KEY = process.env.NEXT_PUBLIC_RADAR_LIVE_PK || process.env.NEXT_PUBLIC_RADAR_TEST_PK;

    // If no API key, return a mock response
    if (!RADAR_API_KEY) {
        console.warn("No Radar API key provided, using mock response");
        // Radar expects [lat, lng], keep as is for mock
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
    const MAX_POINTS_PER_REQUEST = 24; // Safe limit below 25
    const chunks = [];

    for (let i = 0; i < simplifiedCoordinates.length - 1; i += MAX_POINTS_PER_REQUEST - 1) {
        const chunk = simplifiedCoordinates.slice(i, i + MAX_POINTS_PER_REQUEST);
        chunks.push(chunk);
    }

    console.log(`Split route into ${chunks.length} chunks`);

    const features = [];
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

        const response = await fetch(url.toString(), {
            method: "GET",
            headers: {
                "Authorization": RADAR_API_KEY
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("Radar Error:", errorText);
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
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Stitch features into a single LineString
    const mergedCoordinates: number[][] = [];

    for (let i = 0; i < features.length; i++) {
        const coords = features[i].geometry.coordinates;
        // If not the first chunk, skip the first point as it overlaps with the last point of previous chunk
        if (i > 0) {
            mergedCoordinates.push(...coords.slice(1));
        } else {
            mergedCoordinates.push(...coords);
        }
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
        ]
    };
}
