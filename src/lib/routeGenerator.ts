



export interface RouteGenerationOptions {
    /** Array of [lat, lng] coordinates representing the shape to route. */
    coordinates: [number, number][];
    /** Transportation mode: "driving-car", "cycling-regular", "foot-walking". */
    mode: string;
}

/**
 * Generates a navigable route that follows the shape of the provided coordinates.
 * 
 * Generates a route by calling our internal API endpoint.
 * This client-side function sends coordinates to /api/radar/directions
 * which then proxies to the Radar API on the server.
 * 
 * @param options - Route generation options
 * @returns GeoJSON FeatureCollection containing the route
 */
import { FeatureCollection } from "geojson";

export async function generateRoute(options: RouteGenerationOptions): Promise<FeatureCollection> {
    const { coordinates, mode } = options;

    if (!coordinates || coordinates.length < 2) {
        throw new Error("At least 2 coordinates are required");
    }

    // Call our internal API route which proxies to Radar
    // This avoids CORS issues and keeps the API key secure on the server
    const response = await fetch('/api/radar/directions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ coordinates, mode }),
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to generate route: ${response.statusText}`);
    }

    return await response.json();
}
