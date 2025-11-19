import { simplifyPoints } from "./geoUtils";

const ORS_API_KEY = process.env.NEXT_PUBLIC_ORS_API_KEY;

export interface RouteGenerationOptions {
    coordinates: [number, number][];
    mode: string;
}

export async function generateRoute(options: RouteGenerationOptions) {
    const { coordinates, mode } = options;

    if (!coordinates || coordinates.length < 2) {
        throw new Error("Invalid coordinates");
    }

    // Simplify coordinates to reduce noise and waypoint count for ORS
    // ORS has a limit of 70 waypoints, so we need to be more aggressive
    let tolerance = 0.00015;
    let simplifiedCoordinates = simplifyPoints(coordinates, tolerance);

    // If still too many points, increase tolerance progressively
    while (simplifiedCoordinates.length > 50 && tolerance < 0.01) {
        tolerance *= 1.5;
        simplifiedCoordinates = simplifyPoints(coordinates, tolerance);
    }

    // Ensure we don't have too few points (but respect the 50 limit)
    if (simplifiedCoordinates.length < 5 && coordinates.length > 10) {
        // Try with stricter tolerance, but still cap at 50
        const stricter = simplifyPoints(coordinates, 0.00005);
        if (stricter.length <= 50) {
            simplifiedCoordinates = stricter;
        }
    }

    console.log(`Simplified from ${coordinates.length} to ${simplifiedCoordinates.length} points (tolerance: ${tolerance.toFixed(6)})`);

    // If no API key, return a mock response that just connects the dots
    if (!ORS_API_KEY) {
        console.warn("No ORS_API_KEY provided, using mock response");
        // Mock response: just return the input coordinates as a LineString
        // In reality, we would want to snap them to roads, but without API we can't.
        // We'll just return a GeoJSON LineString.

        // ORS expects [lng, lat], we received [lat, lng] from our utils?
        // Let's ensure we send [lng, lat] to ORS.
        // Our geoUtils returns [lat, lng].
        // Let's swap them for the response.

        const swapped = simplifiedCoordinates.map((c: number[]) => [c[1], c[0]]);

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
                        coordinates: swapped
                    }
                }
            ]
        };
    }

    // Call OpenRouteService
    // We use the "directions" endpoint with "continue_straight" or just standard routing.
    // Since we have many points, we might need to batch or use a different profile.
    // For MVP, let's try standard directions.

    // ORS expects [lng, lat]
    const orsCoordinates = simplifiedCoordinates.map((c: number[]) => [c[1], c[0]]);

    const response = await fetch(`https://api.openrouteservice.org/v2/directions/${mode}/geojson`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": ORS_API_KEY
        },
        body: JSON.stringify({
            coordinates: orsCoordinates,
            elevation: false,
            instructions: false,
            preference: "shortest"
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error("ORS Error:", errorText);
        throw new Error(`Failed to generate route: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data;
}
