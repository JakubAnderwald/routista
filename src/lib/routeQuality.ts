/**
 * Route quality metrics.
 *
 * Pure, dependency-free measurements used by the test harness for GitHub
 * issue #47 ("rivers break paths") and by runtime diagnostics in
 * `radarService`. Every function takes plain GeoJSON so it can be run against
 * recorded fixtures without touching the network.
 *
 * See `docs/technical/ISSUE_47_BASELINE.md` for what the numbers mean.
 */

import { FeatureCollection } from "geojson";
import { calculateDistance, distanceToSegmentMeters } from "./geoUtils";
import { removeSpurs, spurCleanupOptionsFor } from "./routeCleanup";
import { ROUTE_QUALITY, TransportMode } from "@/config";

/**
 * Per-leg summary attached to a generated route under
 * `features[0].properties.legs`. One entry per consecutive waypoint pair.
 *
 * These describe the route **as Radar returned it**, before the spur cleanup in
 * `routeCleanup.ts` runs. So `sum(routedMeters)` is greater than the length of
 * the geometry beside them, and a leg can describe geometry that is no longer
 * there at all. That is deliberate: the commonest spur goes out on one leg and
 * back on the next, so a per-leg cleanup could not see it, and the river
 * crossing repair and the detour ratios both want what the router actually did.
 * `properties.summary.distance` is the geometry's length; use that for totals.
 */
export interface RouteLegSummary {
    /** Index of the leg's start waypoint in the routed coordinate list. */
    index: number;
    /** Straight-line distance between the two waypoints, in meters. */
    straightMeters: number;
    /** Distance the router actually travelled for this leg, in meters. */
    routedMeters: number;
    /** Longest single edge inside this leg's geometry, in meters. */
    maxEdgeMeters: number;
    /** Number of geometry points the router returned for this leg. */
    points: number;
}

/** Count and total length of edges longer than a threshold. */
export interface LongEdgeStats {
    count: number;
    meters: number;
}

/** Everything `summarizeRoute` measures, in one object. */
export interface RouteQualitySummary {
    /** Number of points in the returned route geometry. */
    routePoints: number;
    /** Total length of the returned route, in meters. */
    routeMeters: number;
    /** Total length of the requested shape, in meters. */
    shapeMeters: number;
    /** routeMeters / shapeMeters. ~2 is healthy for walking, 8+ is broken. */
    lengthRatio: number;
    /** Longest single edge in the route geometry, in meters. */
    maxEdgeMeters: number;
    /** Edges longer than the mode's implausible-edge threshold. */
    longEdges: LongEdgeStats;
    /** Fraction of the route that retraces itself (out-and-back spurs). */
    selfOverlapFraction: number;
    /** Highest routed/straight ratio across all legs, or 0 without leg data. */
    worstLegRatio: number;
    /** Legs whose routed/straight ratio exceeds `ROUTE_QUALITY.badLegRatio`. */
    badLegCount: number;
    /** Out-and-back excursions still present in the route. Zero after cleanup. */
    spurs: SpurStats;
}

/** Out-and-back excursions found in a route. */
export interface SpurStats {
    /** How many separate excursions there are. */
    count: number;
    /** Their total length, in meters. */
    meters: number;
    /** The longest single one, in meters. */
    maxMeters: number;
    /** Their share of the route's length, between 0 and 1. */
    fraction: number;
}

/**
 * Flattens every LineString in a route FeatureCollection to `[lat, lng]` pairs.
 * GeoJSON stores coordinates as `[lng, lat]`, so this also flips them.
 *
 * @param route - Route GeoJSON, typically from `getRadarRoute`.
 * @returns Route points as `[lat, lng]`.
 */
export function routeToLatLngs(route: FeatureCollection | null | undefined): [number, number][] {
    if (!route?.features) return [];

    const points: [number, number][] = [];
    for (const feature of route.features) {
        if (feature.geometry?.type !== "LineString") continue;
        for (const coord of feature.geometry.coordinates) {
            points.push([coord[1], coord[0]]);
        }
    }
    return points;
}

/**
 * Distances between consecutive points, in meters.
 *
 * @param points - Points as `[lat, lng]`.
 * @returns One distance per edge; empty for fewer than two points.
 */
export function edgeLengths(points: [number, number][]): number[] {
    const lengths: number[] = [];
    for (let i = 0; i < points.length - 1; i++) {
        lengths.push(calculateDistance(points[i], points[i + 1]));
    }
    return lengths;
}

/**
 * Length of the longest single edge in a route.
 *
 * This is the cheapest reliable signal that a foot or bike route used a ferry
 * or waterway: real pedestrian networks have no 500 m edges.
 *
 * @param route - Route GeoJSON.
 * @returns Longest edge in meters, or 0 if the route has fewer than two points.
 */
export function maxEdgeMeters(route: FeatureCollection | null | undefined): number {
    const lengths = edgeLengths(routeToLatLngs(route));
    return lengths.length === 0 ? 0 : Math.max(...lengths);
}

/**
 * Counts edges longer than `thresholdMeters` and totals their length.
 *
 * @param route - Route GeoJSON.
 * @param thresholdMeters - Longest plausible edge for the mode.
 * @returns Count and summed length of the offending edges.
 */
export function longEdgeStats(
    route: FeatureCollection | null | undefined,
    thresholdMeters: number
): LongEdgeStats {
    let count = 0;
    let meters = 0;
    for (const length of edgeLengths(routeToLatLngs(route))) {
        if (length > thresholdMeters) {
            count++;
            meters += length;
        }
    }
    return { count, meters };
}

/**
 * Total length of a path of `[lat, lng]` points, in meters.
 *
 * @param points - Points as `[lat, lng]`.
 * @returns Summed edge length.
 */
export function pathLengthMeters(points: [number, number][]): number {
    return edgeLengths(points).reduce((sum, length) => sum + length, 0);
}

/**
 * How much longer the routed path is than the shape it was asked to follow.
 *
 * @param route - Route GeoJSON.
 * @param waypoints - The requested shape as `[lat, lng]`.
 * @returns Ratio, or 0 when the shape has no length.
 */
export function routeLengthRatio(
    route: FeatureCollection | null | undefined,
    waypoints: [number, number][]
): number {
    const shapeMeters = pathLengthMeters(waypoints);
    if (shapeMeters === 0) return 0;
    return pathLengthMeters(routeToLatLngs(route)) / shapeMeters;
}

/**
 * Reads the per-leg summaries a route carries and returns their
 * routed/straight ratios.
 *
 * @param route - Route GeoJSON produced by `getRadarRoute`.
 * @returns One ratio per leg; empty when the route carries no leg data.
 */
export function legDetours(route: FeatureCollection | null | undefined): number[] {
    const legs = getRouteLegs(route);
    return legs
        .filter(leg => leg.straightMeters > 0)
        .map(leg => leg.routedMeters / leg.straightMeters);
}

/**
 * Extracts the per-leg summaries attached to a route, if present.
 *
 * @param route - Route GeoJSON produced by `getRadarRoute`.
 * @returns Leg summaries, or an empty array.
 */
export function getRouteLegs(route: FeatureCollection | null | undefined): RouteLegSummary[] {
    const legs = route?.features?.[0]?.properties?.legs;
    return Array.isArray(legs) ? (legs as RouteLegSummary[]) : [];
}

/**
 * Fraction of the route's length that retraces another part of the same route.
 *
 * This is the "walks along the embankment to a bridge and back again" metric:
 * an out-and-back spur has both legs within a few meters of each other, so it
 * counts twice, while a clean loop counts zero.
 *
 * Only pairs separated by more than `minGapMeters` along the route count, so
 * neighbouring geometry is not reported as an overlap.
 *
 * @param route - Route GeoJSON.
 * @param toleranceMeters - How close two parts must be to count as retracing.
 * @param minGapMeters - Minimum along-route separation before a pair counts.
 * @returns Fraction between 0 and 1.
 */
export function selfOverlapFraction(
    route: FeatureCollection | null | undefined,
    toleranceMeters: number = ROUTE_QUALITY.selfOverlapToleranceMeters,
    minGapMeters: number = ROUTE_QUALITY.selfOverlapMinGapMeters
): number {
    const points = routeToLatLngs(route);
    if (points.length < 2 || toleranceMeters <= 0) return 0;

    const lengths = edgeLengths(points);
    const total = lengths.reduce((sum, length) => sum + length, 0);
    if (total === 0) return 0;

    // Cumulative distance along the route for each point, so we can require a
    // minimum separation between the two parts being compared.
    const along: number[] = [0];
    for (const length of lengths) {
        along.push(along[along.length - 1] + length);
    }

    const midpoints: [number, number][] = [];
    const midAlong: number[] = [];
    for (let i = 0; i < lengths.length; i++) {
        midpoints.push([
            (points[i][0] + points[i + 1][0]) / 2,
            (points[i][1] + points[i + 1][1]) / 2,
        ]);
        midAlong.push((along[i] + along[i + 1]) / 2);
    }

    // Cells have to be wide enough that a segment lying within `tolerance` of
    // the query point always has its midpoint in the 3x3 neighbourhood.
    const cellMeters = toleranceMeters + Math.max(...lengths) / 2;
    const grid = buildPointGrid(midpoints, cellMeters);

    let overlapping = 0;
    for (let i = 0; i < lengths.length; i++) {
        for (const j of grid.neighbours(midpoints[i])) {
            if (Math.abs(midAlong[j] - midAlong[i]) < minGapMeters) continue;
            if (distanceToSegmentMeters(midpoints[i], points[j], points[j + 1]) <= toleranceMeters) {
                overlapping += lengths[i];
                break;
            }
        }
    }

    return overlapping / total;
}

/**
 * Counts the out-and-back excursions a route still contains.
 *
 * Measured with the same function `radarService` cleans with, so a route that
 * has been through the cleanup reports zero here by construction — which makes
 * this an exact assertion rather than a threshold.
 *
 * Unlike `selfOverlapFraction`, which needs the two halves to be 150 m apart
 * along the route before it counts them, this sees the short spurs too: a
 * 30 m detour into a driveway and back.
 *
 * @param route - Route GeoJSON.
 * @param mode - Transport mode, which sets the length and deviation bounds.
 * @returns Count, total length, longest, and share of the route.
 */
export function spurStats(
    route: FeatureCollection | null | undefined,
    mode: TransportMode
): SpurStats {
    const points = routeToLatLngs(route);
    const routeMeters = pathLengthMeters(points);
    const { spurs, removedMeters } = removeSpurs(points, spurCleanupOptionsFor(mode));

    return {
        count: spurs.length,
        meters: removedMeters,
        maxMeters: spurs.length === 0 ? 0 : Math.max(...spurs.map(spur => spur.meters)),
        fraction: routeMeters === 0 ? 0 : removedMeters / routeMeters,
    };
}

/**
 * Measures a route against the shape it was asked to follow.
 *
 * @param route - Route GeoJSON.
 * @param waypoints - The requested shape as `[lat, lng]`.
 * @param longEdgeThresholdMeters - Longest plausible edge for the mode.
 * @param mode - Transport mode, for the spur bounds.
 * @returns All route quality metrics.
 */
export function summarizeRoute(
    route: FeatureCollection | null | undefined,
    waypoints: [number, number][],
    longEdgeThresholdMeters: number,
    mode: TransportMode
): RouteQualitySummary {
    const points = routeToLatLngs(route);
    const routeMeters = pathLengthMeters(points);
    const shapeMeters = pathLengthMeters(waypoints);
    const ratios = legDetours(route);

    return {
        routePoints: points.length,
        routeMeters,
        shapeMeters,
        lengthRatio: shapeMeters === 0 ? 0 : routeMeters / shapeMeters,
        maxEdgeMeters: maxEdgeMeters(route),
        longEdges: longEdgeStats(route, longEdgeThresholdMeters),
        selfOverlapFraction: selfOverlapFraction(route),
        worstLegRatio: ratios.length === 0 ? 0 : Math.max(...ratios),
        badLegCount: ratios.filter(ratio => ratio > ROUTE_QUALITY.badLegRatio).length,
        spurs: spurStats(route, mode),
    };
}

/**
 * Uniform grid over route points, so `selfOverlapFraction` stays linear
 * instead of comparing every point against every other point.
 */
function buildPointGrid(points: [number, number][], cellMeters: number) {
    const latDegreesPerCell = cellMeters / 111320;
    // Longitude degrees shrink towards the poles; size the cells at the
    // route's own latitude so they stay roughly square.
    const midLat = points[Math.floor(points.length / 2)][0];
    const lngDegreesPerCell = cellMeters / (111320 * Math.max(Math.cos((midLat * Math.PI) / 180), 0.01));

    const cells = new Map<string, number[]>();
    const key = (row: number, col: number) => `${row}:${col}`;
    const cellOf = (p: [number, number]): [number, number] => [
        Math.floor(p[0] / latDegreesPerCell),
        Math.floor(p[1] / lngDegreesPerCell),
    ];

    points.forEach((point, index) => {
        const [row, col] = cellOf(point);
        const id = key(row, col);
        const bucket = cells.get(id);
        if (bucket) {
            bucket.push(index);
        } else {
            cells.set(id, [index]);
        }
    });

    return {
        /** Indices of points in the 3x3 cell neighbourhood around `p`. */
        neighbours(p: [number, number]): number[] {
            const [row, col] = cellOf(p);
            const found: number[] = [];
            for (let dRow = -1; dRow <= 1; dRow++) {
                for (let dCol = -1; dCol <= 1; dCol++) {
                    const bucket = cells.get(key(row + dRow, col + dCol));
                    if (bucket) found.push(...bucket);
                }
            }
            return found;
        },
    };
}
