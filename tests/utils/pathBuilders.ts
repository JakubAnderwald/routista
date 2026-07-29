/**
 * Deterministic path fixtures for the geometry unit suites.
 *
 * Shared by `routeQuality` and `routeCleanup` so both measure against paths
 * with exactly known spacing, rather than each rolling its own conversion.
 */

import { FeatureCollection } from "geojson";
import { RouteLegSummary } from "@/lib/routeQuality";

/**
 * One metre of latitude in degrees, using the same mean Earth radius as
 * `calculateDistance`, so north-south spacing in these fixtures is exact.
 */
export const METRES = 360 / (2 * Math.PI * 6371e3);

/**
 * Builds a route FeatureCollection from `[lat, lng]` points.
 *
 * @param points - Route points as `[lat, lng]`.
 * @param legs - Optional per-leg summaries to attach under `properties.legs`.
 * @returns A single-LineString FeatureCollection.
 */
export function routeOf(points: [number, number][], legs?: RouteLegSummary[]): FeatureCollection {
    return {
        type: "FeatureCollection",
        features: [
            {
                type: "Feature",
                properties: legs ? { legs } : {},
                geometry: {
                    type: "LineString",
                    coordinates: points.map(([lat, lng]) => [lng, lat]),
                },
            },
        ],
    };
}

/**
 * A straight north-south line of `count` points spaced `spacingM` apart.
 *
 * @param count - Number of points.
 * @param spacingM - Gap between consecutive points, in meters.
 * @param startLat - Latitude of the first point.
 * @returns Points as `[lat, lng]`.
 */
export function straightLine(count: number, spacingM: number, startLat = 51.5): [number, number][] {
    return Array.from({ length: count }, (_, i) => [startLat + i * spacingM * METRES, -0.09]);
}

/**
 * Moves a point east by a distance in meters.
 *
 * Longitude degrees shrink with latitude, so this scales by the cosine at the
 * point's own latitude and stays exact for the short offsets used in fixtures.
 *
 * @param point - Point as `[lat, lng]`.
 * @param meters - Distance east; negative moves west.
 * @returns The offset point.
 */
export function offsetEast(point: [number, number], meters: number): [number, number] {
    return [point[0], point[1] + (meters * METRES) / Math.cos((point[0] * Math.PI) / 180)];
}

/**
 * Moves a point north by a distance in meters.
 *
 * @param point - Point as `[lat, lng]`.
 * @param meters - Distance north; negative moves south.
 * @returns The offset point.
 */
export function offsetNorth(point: [number, number], meters: number): [number, number] {
    return [point[0] + meters * METRES, point[1]];
}
