import { simplifyPoints } from "./geoUtils";

const ORS_API_KEY = process.env.NEXT_PUBLIC_ORS_API_KEY;

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
 * 3. Calls the OpenRouteService (ORS) API for each chunk.
 * 4. Stitches the resulting route segments into a single continuous path.
 * 
 * @param options - Configuration options for route generation.
 * @returns A GeoJSON FeatureCollection containing the route LineString.
 * @throws Error if the API call fails or input is invalid.
 */
export async function generateRoute(options: RouteGenerationOptions) {
    const { coordinates, mode } = options;

    if (!coordinates || coordinates.length < 2) {
        throw new Error("Invalid coordinates");
    }

    // Use a fixed, low tolerance to preserve shape details
    // We no longer need to aggressively simplify to < 50 points
    const tolerance = 0.0001;
    const simplifiedCoordinates = simplifyPoints(coordinates, tolerance);

    console.log(`Simplified from ${coordinates.length} to ${simplifiedCoordinates.length} points (tolerance: ${tolerance})`);

    // ORS expects [lng, lat]
    const orsCoordinates = simplifiedCoordinates.map((c: number[]) => [c[1], c[0]]);

    // If no API key, return a mock response
    if (!ORS_API_KEY) {
        console.warn("No ORS_API_KEY provided, using mock response");
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
                        coordinates: orsCoordinates
                    }
                }
            ]
        };
    }

    // Batching logic
    const MAX_POINTS_PER_REQUEST = 40; // Safe limit below 50
    const chunks = [];

    for (let i = 0; i < orsCoordinates.length - 1; i += MAX_POINTS_PER_REQUEST - 1) {
        const chunk = orsCoordinates.slice(i, i + MAX_POINTS_PER_REQUEST);
        chunks.push(chunk);
    }

    console.log(`Split route into ${chunks.length} chunks`);

    const features = [];
    let totalDistance = 0;
    let totalDuration = 0;

    for (const chunk of chunks) {
        const response = await fetch(`https://api.openrouteservice.org/v2/directions/${mode}/geojson`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": ORS_API_KEY
            },
            body: JSON.stringify({
                coordinates: chunk,
                elevation: false,
                instructions: false,
                preference: "shortest"
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("ORS Error:", errorText);
            throw new Error(`Failed to generate route chunk: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();

        if (data.features && data.features.length > 0) {
            const feature = data.features[0];
            features.push(feature);

            if (feature.properties && feature.properties.summary) {
                totalDistance += feature.properties.summary.distance;
                totalDuration += feature.properties.summary.duration;
            }
        }
    }

    // Stitch features into a single LineString if possible, or return MultiLineString
    // For simplicity, we'll merge the coordinates into a single LineString
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
