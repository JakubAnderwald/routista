import { describe, it, expect } from "vitest";
import { FeatureCollection, Position } from "geojson";
import {
    boundingBoxOf,
    buildWaterIndex,
    isPointInWater,
    routeWaterStats,
    segmentWaterMeters,
} from "@/lib/waterGeometry";
import { loadWaterFixture, loadWaterIndex } from "../utils/radarFixtures";

/**
 * A synthetic east-west river: latitude 51.500 to 51.502 (~222 m wide),
 * spanning longitude -0.2 to 0.2. Everything north and south of it is land.
 */
const RIVER: FeatureCollection = {
    type: "FeatureCollection",
    features: [
        {
            type: "Feature",
            properties: { kind: "water" },
            geometry: {
                type: "Polygon",
                coordinates: [
                    [
                        [-0.2, 51.5],
                        [0.2, 51.5],
                        [0.2, 51.502],
                        [-0.2, 51.502],
                        [-0.2, 51.5],
                    ],
                ],
            },
        },
    ],
};

/** Builds a route FeatureCollection from `[lat, lng]` points. */
function routeOf(points: [number, number][]): FeatureCollection {
    return {
        type: "FeatureCollection",
        features: [
            {
                type: "Feature",
                properties: {},
                geometry: {
                    type: "LineString",
                    coordinates: points.map(([lat, lng]) => [lng, lat] as Position),
                },
            },
        ],
    };
}

describe("buildWaterIndex", () => {
    it("indexes polygons with bounding boxes", () => {
        const index = buildWaterIndex(RIVER);

        expect(index.polygons).toHaveLength(1);
        expect(index.polygons[0].bbox).toEqual([51.5, -0.2, 51.502, 0.2]);
        expect(index.bbox).toEqual([51.5, -0.2, 51.502, 0.2]);
    });

    it("expands MultiPolygons into one entry per polygon", () => {
        const index = buildWaterIndex({
            type: "FeatureCollection",
            features: [
                {
                    type: "Feature",
                    properties: {},
                    geometry: {
                        type: "MultiPolygon",
                        coordinates: [
                            [
                                [
                                    [0, 0],
                                    [1, 0],
                                    [1, 1],
                                    [0, 0],
                                ],
                            ],
                            [
                                [
                                    [5, 5],
                                    [6, 5],
                                    [6, 6],
                                    [5, 5],
                                ],
                            ],
                        ],
                    },
                },
            ],
        });

        expect(index.polygons).toHaveLength(2);
    });

    it("ignores bridge LineStrings and degenerate rings", () => {
        const index = buildWaterIndex({
            type: "FeatureCollection",
            features: [
                {
                    type: "Feature",
                    properties: { kind: "bridge" },
                    geometry: {
                        type: "LineString",
                        coordinates: [
                            [0, 0],
                            [1, 1],
                        ],
                    },
                },
                {
                    type: "Feature",
                    properties: {},
                    geometry: {
                        type: "Polygon",
                        coordinates: [
                            [
                                [0, 0],
                                [1, 1],
                            ],
                        ],
                    },
                },
            ],
        });

        expect(index.polygons).toHaveLength(0);
        expect(index.bbox).toBeNull();
    });

    it("handles missing input", () => {
        expect(buildWaterIndex(null).polygons).toEqual([]);
        expect(buildWaterIndex(undefined).bbox).toBeNull();
    });
});

describe("isPointInWater", () => {
    const index = buildWaterIndex(RIVER);

    it("finds points inside the river", () => {
        expect(isPointInWater([51.501, 0], index)).toBe(true);
        expect(isPointInWater([51.5005, -0.19], index)).toBe(true);
    });

    it("rejects points on either bank", () => {
        expect(isPointInWater([51.503, 0], index)).toBe(false);
        expect(isPointInWater([51.499, 0], index)).toBe(false);
    });

    it("rejects points outside the bounding box without testing the ring", () => {
        expect(isPointInWater([51.501, 5], index)).toBe(false);
        expect(isPointInWater([0, 0], index)).toBe(false);
    });

    it("counts points on the bank as water when a tolerance is given", () => {
        const onEdge: [number, number] = [51.502, 0];

        expect(isPointInWater(onEdge, index, { boundaryToleranceMeters: 5 })).toBe(true);
        // 20 m north of the bank, so still dry at a 5 m tolerance.
        expect(isPointInWater([51.50218, 0], index, { boundaryToleranceMeters: 5 })).toBe(false);
    });

    it("treats island holes as dry land", () => {
        const withIsland = buildWaterIndex({
            type: "FeatureCollection",
            features: [
                {
                    type: "Feature",
                    properties: {},
                    geometry: {
                        type: "Polygon",
                        coordinates: [
                            [
                                [-0.2, 51.5],
                                [0.2, 51.5],
                                [0.2, 51.502],
                                [-0.2, 51.502],
                                [-0.2, 51.5],
                            ],
                            [
                                [-0.001, 51.5005],
                                [0.001, 51.5005],
                                [0.001, 51.5015],
                                [-0.001, 51.5015],
                                [-0.001, 51.5005],
                            ],
                        ],
                    },
                },
            ],
        });

        expect(isPointInWater([51.501, 0], withIsland)).toBe(false);
        expect(isPointInWater([51.501, 0.01], withIsland)).toBe(true);
    });
});

describe("segmentWaterMeters", () => {
    const index = buildWaterIndex(RIVER);

    it("measures the part of a perpendicular crossing that is over water", () => {
        const meters = segmentWaterMeters([51.4995, 0], [51.5025, 0], index);

        // The river is 0.002 degrees of latitude across.
        expect(meters).toBeGreaterThan(200);
        expect(meters).toBeLessThan(240);
    });

    it("measures a segment that runs along the river as its full length", () => {
        const meters = segmentWaterMeters([51.501, -0.01], [51.501, 0.01], index);

        expect(meters).toBeGreaterThan(1350);
    });

    it("returns 0 for a segment that stays on land", () => {
        expect(segmentWaterMeters([51.51, 0], [51.52, 0], index)).toBe(0);
    });

    it("returns 0 for a zero-length segment", () => {
        expect(segmentWaterMeters([51.501, 0], [51.501, 0], index)).toBe(0);
    });
});

describe("routeWaterStats", () => {
    const index = buildWaterIndex(RIVER);

    it("reports a short contiguous run for a bridge-like crossing", () => {
        const stats = routeWaterStats(routeOf([
            [51.498, 0],
            [51.504, 0],
        ]), index);

        expect(stats.crossings).toBe(1);
        expect(stats.maxContiguousWaterMeters).toBeGreaterThan(200);
        expect(stats.maxContiguousWaterMeters).toBeLessThan(240);
        expect(stats.totalWaterMeters).toBeCloseTo(stats.maxContiguousWaterMeters, 0);
    });

    it("reports one run per crossing when the route crosses twice", () => {
        const stats = routeWaterStats(routeOf([
            [51.498, -0.01],
            [51.504, -0.01],
            [51.504, 0.01],
            [51.498, 0.01],
        ]), index);

        expect(stats.crossings).toBe(2);
        expect(stats.totalWaterMeters).toBeGreaterThan(400);
    });

    it("reports a long contiguous run for a route down the middle of the river", () => {
        const stats = routeWaterStats(routeOf([
            [51.501, -0.05],
            [51.501, 0.05],
        ]), index);

        expect(stats.crossings).toBe(1);
        // This is the signature the fix has to eliminate: kilometres of route
        // inside the water in a single unbroken run.
        expect(stats.maxContiguousWaterMeters).toBeGreaterThan(6000);
    });

    it("returns zeros for routes that never touch water", () => {
        expect(routeWaterStats(routeOf([
            [51.51, 0],
            [51.52, 0],
        ]), index)).toEqual({
            totalWaterMeters: 0,
            maxContiguousWaterMeters: 0,
            crossings: 0,
        });
    });

    it("returns zeros for empty input", () => {
        expect(routeWaterStats(null, index).crossings).toBe(0);
        expect(routeWaterStats({ type: "FeatureCollection", features: [] }, index).crossings).toBe(0);
    });
});

describe("boundingBoxOf", () => {
    it("bounds a set of points", () => {
        expect(boundingBoxOf([
            [51.5, -0.1],
            [51.6, 0.1],
        ])).toEqual([51.5, -0.1, 51.6, 0.1]);
    });

    it("pads the box by a margin in metres", () => {
        const [minLat, minLng, maxLat, maxLng] = boundingBoxOf([[51.5, -0.09]], 1000)!;

        expect(maxLat - minLat).toBeCloseTo(2000 / 111320, 4);
        expect(maxLng - minLng).toBeGreaterThan(2000 / 111320);
    });

    it("returns null when there are no points", () => {
        expect(boundingBoxOf([])).toBeNull();
    });
});

describe("London water fixture", () => {
    it("puts the Thames where it belongs", () => {
        const index = loadWaterIndex("london");

        // Mid-river, where the heart's cleft lands and Radar snaps waypoints
        // onto the ferry way.
        expect(isPointInWater([51.5076, -0.09], index)).toBe(true);
        expect(isPointInWater([51.509, -0.1], index)).toBe(true);

        // Both banks.
        expect(isPointInWater([51.514, -0.098], index)).toBe(false);
        expect(isPointInWater([51.503, -0.09], index)).toBe(false);
        expect(isPointInWater([51.5055, -0.093], index)).toBe(false);
    });

    it("includes the bridges over it", () => {
        const bridges = loadWaterFixture("london").features.filter(
            f => f.properties?.kind === "bridge"
        );

        expect(bridges.length).toBeGreaterThan(50);
        expect(bridges.map(b => b.properties?.name)).toContain("London Bridge");
        expect(bridges.map(b => b.properties?.name)).toContain("Southwark Bridge");
    });
});
