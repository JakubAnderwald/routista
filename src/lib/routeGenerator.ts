import { FeatureCollection } from "geojson";
import {
    readRouteStream,
    ROUTE_STREAM_CONTENT_TYPE,
    RouteProgressCallback,
} from "./routeProgress";





export interface RouteGenerationOptions {
    /** Array of [lat, lng] coordinates representing the shape to route. */
    coordinates: [number, number][];
    /** Transportation mode: "driving-car", "cycling-regular", "foot-walking". */
    mode: string;
}

/**
 * Generates a navigable route that follows the shape of the provided coordinates.
 *
 * Calls our internal API endpoint, /api/radar/directions, which proxies to the
 * Radar API on the server. It asks for the streamed NDJSON protocol so slow
 * server stages can be reported through `onProgress`; a plain JSON answer is
 * accepted too.
 *
 * @param options - Route generation options
 * @param onProgress - Optional; called for each progress stage the server reports.
 * @returns GeoJSON FeatureCollection containing the route
 */
export async function generateRoute(
    options: RouteGenerationOptions,
    onProgress?: RouteProgressCallback
): Promise<FeatureCollection> {
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
            Accept: `${ROUTE_STREAM_CONTENT_TYPE}, application/json`,
        },
        body: JSON.stringify({ coordinates, mode }),
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to generate route: ${response.statusText}`);
    }

    const contentType = response.headers?.get("content-type") ?? "";
    if (!contentType.includes(ROUTE_STREAM_CONTENT_TYPE) || !response.body) {
        return await response.json();
    }

    let result: FeatureCollection | undefined;
    let failure: string | undefined;
    await readRouteStream(response.body, message => {
        if (message.type === "progress") onProgress?.(message.stage);
        else if (message.type === "result") result = message.data;
        else failure = message.error;
    });

    if (failure !== undefined) throw new Error(failure || "Failed to generate route");
    if (!result) throw new Error("Failed to generate route: incomplete response");
    return result;
}
