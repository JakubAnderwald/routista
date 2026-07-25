import { describe, it, expect } from "vitest";
import { FeatureCollection } from "geojson";
import { buildWaterIndex } from "@/lib/waterGeometry";
import {
    buildBridgeIndex,
    chooseBridge,
    crossingWaypointsBetween,
    planCrossings,
    repairWaterLegs,
} from "@/lib/riverCrossing";
import { loadWaterFixture, loadWaterIndex } from "../utils/radarFixtures";

/**
 * A synthetic east-west river from latitude 51.500 to 51.502 (~222 m across),
 * with two crossings: a footbridge at longitude 0 and a road bridge at 0.01
 * (~700 m east). Everything north and south of the river is land.
 */
const BRIDGE_AT = (lng: number, highway: string, name: string) => ({
    type: "Feature" as const,
    properties: { kind: "bridge", highway, name },
    geometry: {
        type: "LineString" as const,
        coordinates: [
            [lng, 51.4995],
            [lng, 51.5025],
        ],
    },
});

const WORLD: FeatureCollection = {
    type: "FeatureCollection",
    features: [
        {
            type: "Feature",
            properties: { kind: "water", name: "River" },
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
        BRIDGE_AT(0, "footway", "Foot Bridge"),
        BRIDGE_AT(0.01, "primary", "Road Bridge"),
    ],
};

const water = buildWaterIndex(WORLD);
const bridges = buildBridgeIndex(WORLD, water);

describe("buildBridgeIndex", () => {
    it("keeps bridges that span the water", () => {
        expect(bridges.bridges.map(b => b.name).sort()).toEqual(["Foot Bridge", "Road Bridge"]);
    });

    it("drops structures that do not reach across", () => {
        // A jetty: both ends dry, but it barely touches the water.
        const jetty: FeatureCollection = {
            type: "FeatureCollection",
            features: [
                WORLD.features[0],
                {
                    type: "Feature",
                    properties: { kind: "bridge", highway: "footway", name: "Wharf" },
                    geometry: {
                        type: "LineString",
                        coordinates: [
                            [0.05, 51.4998],
                            [0.05, 51.50005],
                        ],
                    },
                },
            ],
        };

        expect(buildBridgeIndex(jetty, water).bridges).toHaveLength(0);
    });

    it("drops bridges that cross no water at all", () => {
        const flyover: FeatureCollection = {
            type: "FeatureCollection",
            features: [
                WORLD.features[0],
                BRIDGE_AT(0, "primary", "Flyover"),
            ],
        };
        // Move the flyover well north of the river.
        (flyover.features[1].geometry as { coordinates: number[][] }).coordinates = [
            [0, 51.51],
            [0, 51.512],
        ];

        expect(buildBridgeIndex(flyover, water).bridges).toHaveLength(0);
    });

    it("chains a bridge split into several ways", () => {
        const split: FeatureCollection = {
            type: "FeatureCollection",
            features: [
                WORLD.features[0],
                {
                    type: "Feature",
                    properties: { kind: "bridge", highway: "footway", name: "Split Bridge" },
                    geometry: {
                        type: "LineString",
                        coordinates: [
                            [0.05, 51.4995],
                            [0.05, 51.501],
                        ],
                    },
                },
                {
                    type: "Feature",
                    properties: { kind: "bridge", highway: "footway", name: "Split Bridge" },
                    geometry: {
                        type: "LineString",
                        coordinates: [
                            [0.05, 51.501],
                            [0.05, 51.5025],
                        ],
                    },
                },
            ],
        };

        const index = buildBridgeIndex(split, water);

        expect(index.bridges).toHaveLength(1);
        expect(index.bridges[0].path).toHaveLength(3);
    });

    it("ignores water polygons and missing input", () => {
        expect(buildBridgeIndex(null, water).bridges).toEqual([]);
        expect(buildBridgeIndex({ type: "FeatureCollection", features: [] }, water).bridges).toEqual([]);
    });
});

describe("chooseBridge", () => {
    it("picks the nearest crossing between opposite banks", () => {
        const chosen = chooseBridge([51.503, 0.0005], [51.499, 0.0005], [[51.501, 0.0005]], bridges, water);

        expect(chosen?.bridge.name).toBe("Foot Bridge");
        expect(chosen?.crossing).toHaveLength(2);
    });

    it("goes over and back when the shape returns to the same bank", () => {
        const chosen = chooseBridge([51.503, -0.001], [51.503, 0.001], [[51.501, 0]], bridges, water);

        expect(chosen?.crossing).toHaveLength(3);
        // Out and back over the same bridge head.
        expect(chosen!.crossing[0]).toEqual(chosen!.crossing[2]);
        // The turnaround is clear of the water, so the two legs are separate
        // crossings rather than one long run through the river.
        expect(chosen!.crossing[1][0]).toBeLessThan(51.5);
    });

    it("prefers a walkable bridge over a road bridge at similar cost", () => {
        // Equidistant from both crossings.
        const chosen = chooseBridge([51.503, 0.005], [51.499, 0.005], [[51.501, 0.005]], bridges, water);

        expect(chosen?.bridge.name).toBe("Foot Bridge");
    });

    it("refuses a diversion longer than the cap", () => {
        // Far east of both bridges, so any crossing is a huge detour.
        const far = chooseBridge([51.503, 0.15], [51.499, 0.15], [[51.501, 0.15]], bridges, water, 100);

        expect(far).toBeNull();
    });

    it("returns null for an empty run or when there are no bridges", () => {
        expect(chooseBridge([51.503, 0], [51.499, 0], [], bridges, water)).toBeNull();
        expect(
            chooseBridge([51.503, 0], [51.499, 0], [[51.501, 0]], { bridges: [] }, water)
        ).toBeNull();
    });
});

describe("planCrossings", () => {
    /** A closed shape that dips south across the river and back. */
    const dipping: [number, number][] = [
        [51.504, -0.004],
        [51.503, -0.002],
        [51.5015, -0.001], // in the river
        [51.5005, 0], // in the river
        [51.5015, 0.001], // in the river
        [51.503, 0.002],
        [51.504, 0.004],
        [51.504, -0.004],
    ];

    it("replaces the in-water run with a bridge crossing", () => {
        const plan = planCrossings(dipping, water, bridges);

        expect(plan.waypointsInWater).toBe(3);
        expect(plan.crossings).toHaveLength(1);
        expect(plan.crossings[0].bridgeName).toBe("Foot Bridge");
        expect(plan.unbridgedRuns).toBe(0);

        // No waypoint is left in the water.
        for (const point of plan.waypoints) {
            expect(point[0] < 51.5 || point[0] > 51.502).toBe(true);
        }
    });

    it("keeps the shape closed", () => {
        const plan = planCrossings(dipping, water, bridges);

        expect(plan.waypoints[0]).toEqual(plan.waypoints[plan.waypoints.length - 1]);
    });

    it("handles a run that straddles the start of a closed shape", () => {
        // Rotate the shape so the in-water run wraps around index 0 — which is
        // exactly where the reported heart over London breaks.
        const rotated: [number, number][] = [
            [51.5005, 0],
            [51.5015, 0.001],
            [51.503, 0.002],
            [51.504, 0.004],
            [51.504, -0.004],
            [51.503, -0.002],
            [51.5015, -0.001],
            [51.5005, 0],
        ];

        const plan = planCrossings(rotated, water, bridges);

        // One run, not two: the wrap is handled as a single crossing.
        expect(plan.crossings).toHaveLength(1);
        expect(plan.unbridgedRuns).toBe(0);
    });

    it("leaves shapes that never touch water alone", () => {
        const dry: [number, number][] = [
            [51.51, 0],
            [51.512, 0.001],
            [51.51, 0.002],
        ];

        const plan = planCrossings(dry, water, bridges);

        expect(plan.waypoints).toBe(dry);
        expect(plan.waypointsInWater).toBe(0);
        expect(plan.crossings).toEqual([]);
    });

    it("gives up when the whole shape is in the water", () => {
        const submerged: [number, number][] = [
            [51.501, -0.01],
            [51.501, 0],
            [51.501, 0.01],
        ];

        const plan = planCrossings(submerged, water, bridges);

        expect(plan.waypoints).toBe(submerged);
        expect(plan.waypointsInWater).toBe(3);
        expect(plan.crossings).toEqual([]);
    });

    it("records a run it could not bridge", () => {
        const farAway: [number, number][] = [
            [51.503, 0.15],
            [51.501, 0.15], // in the river, nowhere near a crossing
            [51.499, 0.15],
        ];

        const plan = planCrossings(farAway, water, bridges);

        expect(plan.unbridgedRuns).toBe(1);
        expect(plan.crossings).toEqual([]);
    });

    it("handles degenerate input", () => {
        expect(planCrossings([], water, bridges).waypoints).toEqual([]);
        expect(planCrossings([[51.501, 0]], water, bridges).crossings).toEqual([]);
    });
});

describe("crossingWaypointsBetween", () => {
    it("pins a point on land when nothing is in the way", () => {
        const pinned = crossingWaypointsBetween([51.505, -0.002], [51.505, 0.002], bridges, water);

        expect(pinned).toHaveLength(1);
        expect(pinned[0][0]).toBeCloseTo(51.505, 5);
    });

    it("pins a bridge when the line does cross water", () => {
        const pinned = crossingWaypointsBetween([51.503, 0.0005], [51.499, 0.0005], bridges, water);

        expect(pinned).toHaveLength(2);
    });

    it("returns nothing when there is no crossing to use", () => {
        expect(
            crossingWaypointsBetween([51.503, 0.15], [51.499, 0.15], { bridges: [] }, water)
        ).toEqual([]);
    });
});

describe("repairWaterLegs", () => {
    const waypoints: [number, number][] = [
        [51.503, -0.002],
        [51.503, 0.002],
    ];

    it("pins a crossing into a leg that travelled along the river", () => {
        // A leg that wandered south into the river and back.
        const ferried: [number, number][] = [
            [51.503, -0.002],
            [51.501, -0.002],
            [51.501, 0.002],
            [51.503, 0.002],
        ];

        const result = repairWaterLegs(waypoints, new Map([[0, ferried]]), water, bridges, 250);

        expect(result.repaired).toBe(1);
        expect(result.waypoints).toHaveLength(3);
    });

    it("leaves a leg that only crosses at a bridge alone", () => {
        // A real bridge crossing has dense geometry, so no single edge is long.
        const crossing: [number, number][] = Array.from({ length: 12 }, (_, i) => [
            51.503 - i * 0.00035,
            0,
        ]);

        const result = repairWaterLegs(
            [crossing[0], crossing[crossing.length - 1]],
            new Map([[0, crossing]]),
            water,
            bridges,
            250
        );

        expect(result.repaired).toBe(0);
    });

    it("flags a short leg containing one long edge over water", () => {
        // Total water is under the 500 m threshold, but a single 330 m hop
        // across the river is a ferry however short the leg is.
        const hop: [number, number][] = [
            [51.5025, 0.003],
            [51.4995, 0.003],
        ];

        const result = repairWaterLegs([hop[0], hop[1]], new Map([[0, hop]]), water, bridges, 250);

        expect(result.repaired).toBe(1);
    });

    it("ignores legs whose waypoints are missing", () => {
        const result = repairWaterLegs(waypoints, new Map([[9, [[51.501, 0]]]]), water, bridges, 250);

        expect(result.repaired).toBe(0);
        expect(result.waypoints).toBe(waypoints);
    });
});

describe("London bridge fixture", () => {
    it("finds the Thames crossings", () => {
        const index = buildBridgeIndex(loadWaterFixture("london"), loadWaterIndex("london"));
        const names = index.bridges.map(b => b.name);

        expect(names).toContain("London Bridge");
        expect(names).toContain("Southwark Bridge");
        expect(names).toContain("Blackfriars Bridge");
        expect(names).toContain("Tower Bridge");
        expect(names).toContain("Millennium Bridge");
    });

    it("leaves out short structures that are not river crossings", () => {
        const index = buildBridgeIndex(loadWaterFixture("london"), loadWaterIndex("london"));

        // An 8 m footway over the corner of a dock is tagged bridge=yes but
        // picking it strands the router mid-river.
        expect(index.bridges.map(b => b.name)).not.toContain("Fisherman's Hall Wharf");
    });
});
