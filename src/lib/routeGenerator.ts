



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

    // Call our internal API route which proxies to Radar
    // This avoids CORS issues and keeps the API key secure on the server
    const response = await fetch('/api/radar/directions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            coordinates,
            mode
        })
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Route generation failed: ${response.statusText}`);
    }

    return await response.json();
}
