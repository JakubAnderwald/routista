import { describe, it, expect } from "vitest";
import { FeatureCollection } from "geojson";
import { RouteLegSummary } from "@/lib/routeQuality";
import {
    edgeLengths,
    getRouteLegs,
    legDetours,
    longEdgeStats,
    maxEdgeMeters,
    pathLengthMeters,
    routeLengthRatio,
    routeToLatLngs,
    selfOverlapFraction,
    spurStats,
    summarizeRoute,
} from "@/lib/routeQuality";
import { METRES, offsetEast, routeOf, straightLine } from "../utils/pathBuilders";

describe("routeToLatLngs", () => {
    it("flips GeoJSON [lng, lat] into [lat, lng]", () => {
        const route = routeOf([
            [51.5, -0.09],
            [51.6, -0.08],
        ]);

        expect(routeToLatLngs(route)).toEqual([
            [51.5, -0.09],
            [51.6, -0.08],
        ]);
    });

    it("returns an empty array for null, undefined and empty routes", () => {
        expect(routeToLatLngs(null)).toEqual([]);
        expect(routeToLatLngs(undefined)).toEqual([]);
        expect(routeToLatLngs({ type: "FeatureCollection", features: [] })).toEqual([]);
    });

    it("ignores features that are not LineStrings", () => {
        const route: FeatureCollection = {
            type: "FeatureCollection",
            features: [
                {
                    type: "Feature",
                    properties: {},
                    geometry: { type: "Point", coordinates: [-0.09, 51.5] },
                },
            ],
        };

        expect(routeToLatLngs(route)).toEqual([]);
    });

    it("concatenates multiple LineString features", () => {
        const route: FeatureCollection = {
            type: "FeatureCollection",
            features: [
                ...routeOf([[51.5, -0.09]]).features,
                ...routeOf([[51.6, -0.08]]).features,
            ],
        };

        expect(routeToLatLngs(route)).toHaveLength(2);
    });
});

describe("edgeLengths and pathLengthMeters", () => {
    it("measures each edge in metres", () => {
        const lengths = edgeLengths(straightLine(3, 100));

        expect(lengths).toHaveLength(2);
        for (const length of lengths) expect(length).toBeCloseTo(100, 0);
    });

    it("returns nothing for fewer than two points", () => {
        expect(edgeLengths([])).toEqual([]);
        expect(edgeLengths([[51.5, -0.09]])).toEqual([]);
        expect(pathLengthMeters([[51.5, -0.09]])).toBe(0);
    });

    it("treats repeated points as zero-length edges", () => {
        expect(
            pathLengthMeters([
                [51.5, -0.09],
                [51.5, -0.09],
            ])
        ).toBeCloseTo(0, 5);
    });
});

describe("maxEdgeMeters", () => {
    it("returns the longest single edge", () => {
        const points: [number, number][] = [
            [51.5, -0.09],
            [51.5 + 50 * METRES, -0.09],
            [51.5 + 850 * METRES, -0.09],
        ];

        expect(maxEdgeMeters(routeOf(points))).toBeCloseTo(800, 0);
    });

    it("returns 0 for routes with fewer than two points", () => {
        expect(maxEdgeMeters(routeOf([]))).toBe(0);
        expect(maxEdgeMeters(routeOf([[51.5, -0.09]]))).toBe(0);
        expect(maxEdgeMeters(null)).toBe(0);
    });
});

describe("longEdgeStats", () => {
    it("counts and totals only edges over the threshold", () => {
        const points: [number, number][] = [
            [51.5, -0.09],
            [51.5 + 100 * METRES, -0.09],
            [51.5 + 400 * METRES, -0.09],
            [51.5 + 900 * METRES, -0.09],
        ];

        const stats = longEdgeStats(routeOf(points), 150);

        expect(stats.count).toBe(2);
        expect(stats.meters).toBeCloseTo(800, 0);
    });

    it("reports nothing when every edge is plausible", () => {
        expect(longEdgeStats(routeOf(straightLine(10, 30)), 150)).toEqual({ count: 0, meters: 0 });
    });
});

describe("routeLengthRatio", () => {
    it("compares routed length against the requested shape", () => {
        const shape = straightLine(2, 500);
        const route = routeOf(straightLine(3, 500));

        expect(routeLengthRatio(route, shape)).toBeCloseTo(2, 1);
    });

    it("returns 0 when the shape has no length", () => {
        expect(routeLengthRatio(routeOf(straightLine(2, 100)), [])).toBe(0);
        expect(routeLengthRatio(routeOf(straightLine(2, 100)), [[51.5, -0.09]])).toBe(0);
    });
});

describe("legDetours and getRouteLegs", () => {
    const legs: RouteLegSummary[] = [
        { index: 0, straightMeters: 100, routedMeters: 150, maxEdgeMeters: 20, points: 8 },
        { index: 1, straightMeters: 80, routedMeters: 3300, maxEdgeMeters: 563, points: 12 },
    ];

    it("reads the ratios attached to the route", () => {
        const ratios = legDetours(routeOf(straightLine(2, 100), legs));

        expect(ratios[0]).toBeCloseTo(1.5, 5);
        expect(ratios[1]).toBeCloseTo(41.25, 2);
    });

    it("skips legs with no straight-line distance", () => {
        const degenerate: RouteLegSummary[] = [
            { index: 0, straightMeters: 0, routedMeters: 40, maxEdgeMeters: 40, points: 2 },
        ];

        expect(legDetours(routeOf(straightLine(2, 100), degenerate))).toEqual([]);
    });

    it("returns nothing when the route carries no leg data", () => {
        expect(getRouteLegs(routeOf(straightLine(2, 100)))).toEqual([]);
        expect(legDetours(routeOf(straightLine(2, 100)))).toEqual([]);
        expect(getRouteLegs(null)).toEqual([]);
    });
});

describe("selfOverlapFraction", () => {
    it("reports almost the whole route for an out-and-back spur", () => {
        const out = straightLine(21, 50);
        const route = routeOf([...out, ...[...out].reverse().slice(1)]);

        // Everything except the geometry either side of the turnaround, which
        // is inside the minimum along-route gap.
        expect(selfOverlapFraction(route)).toBeGreaterThan(0.7);
    });

    it("reports nothing for a route that never doubles back", () => {
        expect(selfOverlapFraction(routeOf(straightLine(40, 50)))).toBe(0);
    });

    it("ignores a loop that returns to its start", () => {
        // A square kilometre loop: the ends meet, but nothing retraces.
        const loop: [number, number][] = [
            [51.5, -0.09],
            [51.5 + 500 * METRES, -0.09],
            [51.5 + 500 * METRES, -0.082],
            [51.5, -0.082],
            [51.5, -0.09],
        ];

        expect(selfOverlapFraction(routeOf(loop))).toBeLessThan(0.05);
    });

    it("returns 0 for degenerate input", () => {
        expect(selfOverlapFraction(routeOf([]))).toBe(0);
        expect(selfOverlapFraction(routeOf([[51.5, -0.09]]))).toBe(0);
        expect(selfOverlapFraction(routeOf(straightLine(5, 50)), 0)).toBe(0);
        expect(
            selfOverlapFraction(
                routeOf([
                    [51.5, -0.09],
                    [51.5, -0.09],
                ])
            )
        ).toBe(0);
    });
});

describe("spurStats", () => {
    /** A north-south line with an out-and-back planted at `atIndex`. */
    function lineWithSpur(atIndex: number, eastMeters: number): [number, number][] {
        const line = straightLine(12, 25);
        const join = line[atIndex];
        return [
            ...line.slice(0, atIndex + 1),
            offsetEast(join, eastMeters),
            join,
            ...line.slice(atIndex + 1),
        ];
    }

    it("counts and measures a planted spur", () => {
        const stats = spurStats(routeOf(lineWithSpur(5, 14)), "foot-walking");

        expect(stats.count).toBe(1);
        expect(stats.meters).toBeCloseTo(28, 0);
        expect(stats.maxMeters).toBeCloseTo(28, 0);
        expect(stats.fraction).toBeGreaterThan(0);
        expect(stats.fraction).toBeLessThan(1);
    });

    it("sees short spurs that selfOverlapFraction cannot", () => {
        const route = routeOf(lineWithSpur(5, 14));

        // 14 m out and back is well inside the 150 m minimum along-route gap.
        expect(selfOverlapFraction(route)).toBe(0);
        expect(spurStats(route, "foot-walking").count).toBe(1);
    });

    it("reports nothing for a clean route", () => {
        expect(spurStats(routeOf(straightLine(40, 50)), "foot-walking")).toEqual({
            count: 0,
            meters: 0,
            maxMeters: 0,
            fraction: 0,
        });
    });

    it("returns zeros for degenerate input", () => {
        expect(spurStats(null, "foot-walking").count).toBe(0);
        expect(spurStats(routeOf([]), "foot-walking").fraction).toBe(0);
        expect(spurStats(routeOf([[51.5, -0.09]]), "foot-walking").fraction).toBe(0);
    });
});

describe("summarizeRoute", () => {
    it("collects every metric for a healthy route", () => {
        const shape = straightLine(11, 100);
        const legs: RouteLegSummary[] = [
            { index: 0, straightMeters: 100, routedMeters: 140, maxEdgeMeters: 30, points: 6 },
        ];

        const summary = summarizeRoute(routeOf(straightLine(21, 60), legs), shape, 150, "foot-walking");

        expect(summary.routePoints).toBe(21);
        expect(summary.routeMeters).toBeCloseTo(1200, 0);
        expect(summary.shapeMeters).toBeCloseTo(1000, 0);
        expect(summary.lengthRatio).toBeCloseTo(1.2, 2);
        expect(summary.maxEdgeMeters).toBeCloseTo(60, 0);
        expect(summary.longEdges).toEqual({ count: 0, meters: 0 });
        expect(summary.worstLegRatio).toBeCloseTo(1.4, 5);
        expect(summary.badLegCount).toBe(0);
    });

    it("flags the water signature: long edges and runaway legs", () => {
        const points: [number, number][] = [
            [51.5076, -0.09],
            [51.5088, -0.0946],
            [51.5079, -0.0883],
            [51.5062, -0.0753],
        ];
        const legs: RouteLegSummary[] = [
            { index: 0, straightMeters: 79, routedMeters: 3305, maxEdgeMeters: 563, points: 12 },
        ];

        const summary = summarizeRoute(routeOf(points, legs), straightLine(2, 79), 150, "foot-walking");

        expect(summary.maxEdgeMeters).toBeGreaterThan(500);
        expect(summary.longEdges.count).toBe(3);
        expect(summary.badLegCount).toBe(1);
        expect(summary.worstLegRatio).toBeGreaterThan(40);
    });

    it("handles an empty route without throwing", () => {
        const summary = summarizeRoute(routeOf([]), [], 150, "foot-walking");

        expect(summary).toMatchObject({
            routePoints: 0,
            routeMeters: 0,
            shapeMeters: 0,
            lengthRatio: 0,
            maxEdgeMeters: 0,
            selfOverlapFraction: 0,
            worstLegRatio: 0,
            badLegCount: 0,
        });
    });
});
