/**
 * Whole-pipeline properties that the scenario metrics do not cover.
 *
 * The river crossing repair added a dependency on an external service, extra
 * routing passes, and new fields on the response. Each of those is a way the
 * feature could break something that has nothing to do with rivers, so each is
 * checked here: the route still generates when OSM data is unavailable, the
 * cost stays bounded, and everything downstream still consumes the response.
 *
 * Runs offline from recorded fixtures.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { FeatureCollection } from "geojson";
import { getRadarRoute, chunkWaypoints } from "@/lib/radarService";
import { calculateRouteAccuracy, calculateRouteLength } from "@/lib/geoUtils";
import { generateGPX } from "@/lib/gpxGenerator";
import { getRouteLegs, spurStats } from "@/lib/routeQuality";
import { RIVER_CROSSING, SPUR_CLEANUP } from "@/config";
import { scenarioById, scenarioWaypoints } from "../fixtures/scenarios";
import { loadRadarFixture, RadarFixture, replayFetch } from "../utils/radarFixtures";
import { useWaterFixture } from "../utils/mockOverpass";

vi.mock("@sentry/nextjs", () => ({
    captureException: vi.fn(),
    captureMessage: vi.fn(),
}));

vi.mock("@/lib/overpassService", () => ({
    getWaterAndBridges: async () => (await import("../utils/mockOverpass")).currentWaterFixture(),
    fetchWaterAndBridges: async () => (await import("../utils/mockOverpass")).currentWaterFixture(),
}));

/** The reported case: a heart over the Thames, which triggers the repair. */
const SCENARIO = scenarioById("london-heart-foot");

/** Wraps replay so requests can be counted. */
function countingReplay(fixture: RadarFixture) {
    const inner = replayFetch(fixture);
    const calls: string[] = [];

    const wrapped = (async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push(typeof input === "string" ? input : input.toString());
        return inner(input, init);
    }) as typeof fetch;

    return { fetch: wrapped, calls };
}

describe("route pipeline", () => {
    beforeEach(() => {
        vi.stubEnv("KV_REST_API_URL", "");
        vi.stubEnv("KV_REST_API_TOKEN", "");
        vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
        vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
        vi.stubEnv("NEXT_PUBLIC_RADAR_LIVE_PK", "fixture-replay-key");
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.unstubAllEnvs();
    });

    describe("when OSM data is unavailable", () => {
        it("still returns a usable route rather than failing", async () => {
            // Overpass down, timed out, or rate limited: getWaterAndBridges
            // returns nothing and the repair cannot run.
            useWaterFixture(null);
            vi.stubGlobal("fetch", replayFetch(loadRadarFixture(SCENARIO.id)));

            const waypoints = await scenarioWaypoints(SCENARIO);
            const route = await getRadarRoute({ coordinates: waypoints, mode: SCENARIO.mode });

            expect(route.type).toBe("FeatureCollection");
            expect(route.features[0].geometry.type).toBe("LineString");
            expect(calculateRouteLength(route)).toBeGreaterThan(0);

            // Degraded, not broken: the route is the one Radar gave us, with
            // no river crossing diagnostics attached.
            expect(route.features[0].properties?.riverCrossing).toBeUndefined();
        });
    });

    describe("cost", () => {
        it("bounds Radar requests even when the repair runs", async () => {
            useWaterFixture(SCENARIO.city);
            const recorder = countingReplay(loadRadarFixture(SCENARIO.id));
            vi.stubGlobal("fetch", recorder.fetch);

            const waypoints = await scenarioWaypoints(SCENARIO);
            await getRadarRoute({ coordinates: waypoints, mode: SCENARIO.mode });

            // One detection pass, one after moving waypoints onto bridges, and
            // at most maxRepairPasses more for legs still on the water.
            // Chunks of the unsimplified waypoints is an upper bound on the
            // chunks of any pass, since simplification only removes points and
            // the repair replaces in-water runs with two-point crossings.
            const maxPasses = 2 + RIVER_CROSSING.maxRepairPasses;
            const perPass = chunkWaypoints(waypoints).length;

            expect(recorder.calls.length).toBeLessThanOrEqual(maxPasses * perPass);
            expect(recorder.calls.every(url => url.includes("api.radar.io"))).toBe(true);
        });

        it("makes no extra request when there is nothing to repair", async () => {
            const madrid = scenarioById("madrid-square-foot");
            useWaterFixture(madrid.city);
            const fixture = loadRadarFixture(madrid.id);
            const recorder = countingReplay(fixture);
            vi.stubGlobal("fetch", recorder.fetch);

            const waypoints = await scenarioWaypoints(madrid);
            const route = await getRadarRoute({ coordinates: waypoints, mode: madrid.mode });

            expect(route.features[0].properties?.riverCrossing).toBeUndefined();
            // A single pass: every recorded request made exactly once, and
            // nothing repeated for a second routing of moved waypoints.
            expect(recorder.calls.length).toBe(Object.keys(fixture.requests).length);
            expect(new Set(recorder.calls).size).toBe(recorder.calls.length);
        });
    });

    describe("response contract", () => {
        let route: FeatureCollection;
        let waypoints: [number, number][];

        beforeEach(async () => {
            useWaterFixture(SCENARIO.city);
            vi.stubGlobal("fetch", replayFetch(loadRadarFixture(SCENARIO.id)));
            waypoints = await scenarioWaypoints(SCENARIO);
            route = await getRadarRoute({ coordinates: waypoints, mode: SCENARIO.mode });
        });

        it("is still a plain FeatureCollection with a summary", () => {
            expect(route.type).toBe("FeatureCollection");
            expect(route.features).toHaveLength(1);
            expect(route.features[0].properties?.summary).toMatchObject({
                distance: expect.any(Number),
                duration: expect.any(Number),
            });
        });

        it("exports to GPX", () => {
            const gpx = generateGPX(route);

            expect(gpx).toContain("<gpx");
            // One trackpoint per route point, so nothing was lost in export.
            const trackpoints = gpx.match(/<trkpt/g)?.length ?? 0;
            expect(trackpoints).toBe(
                (route.features[0].geometry as { coordinates: number[][] }).coordinates.length
            );
        });

        it("scores against the requested shape", () => {
            const accuracy = calculateRouteAccuracy(waypoints, route, SCENARIO.radius);

            expect(accuracy).toBeGreaterThan(0);
            expect(accuracy).toBeLessThanOrEqual(100);
        });

        it("carries per-leg diagnostics aligned with the routed waypoints", () => {
            const legs = getRouteLegs(route);

            expect(legs.length).toBeGreaterThan(0);
            expect(legs.map(l => l.index)).toEqual([...legs.map(l => l.index)].sort((a, b) => a - b));
            // Indices are unique: chunk overlap must not double-count a leg.
            expect(new Set(legs.map(l => l.index)).size).toBe(legs.length);
            for (const leg of legs) {
                expect(leg.routedMeters).toBeGreaterThanOrEqual(0);
                // Legs describe the route before the spur cleanup, so a leg's
                // longest edge is bounded by the pre-cleanup route, not by the
                // geometry that is finally returned.
                expect(leg.maxEdgeMeters).toBeLessThanOrEqual(
                    route.features[0].properties?.summary.routedDistance
                );
            }
        });

        it("returns geometry with no out-and-back spurs left in it", () => {
            expect(spurStats(route, SCENARIO.mode).count).toBe(0);
        });

        it("reports what the cleanup removed", () => {
            const diagnostics = route.features[0].properties?.spurCleanup;

            expect(diagnostics).toMatchObject({
                spurs: expect.any(Number),
                removedMeters: expect.any(Number),
                longestMeters: expect.any(Number),
            });
            expect(diagnostics.spurs).toBeGreaterThan(0);
            expect(diagnostics.longestMeters).toBeLessThanOrEqual(
                SPUR_CLEANUP.maxSpurMeters[SCENARIO.mode]
            );
        });

        it("reports the length of the route it actually returns", () => {
            const summary = route.features[0].properties?.summary;

            // The displayed km comes from the geometry, so the summary has to
            // agree with it — Radar's own total describes the uncleaned route.
            expect(summary.distance).toBeCloseTo(calculateRouteLength(route), 0);
            expect(summary.routedDistance).toBeGreaterThan(summary.distance);
            expect(summary.duration).toBeLessThan(summary.routedDuration);
        });

        it("keeps the legs Radar reported, uncleaned and larger than the geometry", () => {
            const legTotal = getRouteLegs(route).reduce((sum, leg) => sum + leg.routedMeters, 0);

            expect(legTotal).toBeGreaterThan(calculateRouteLength(route));
        });

        it("reports what the repair did", () => {
            const diagnostics = route.features[0].properties?.riverCrossing;

            expect(diagnostics).toMatchObject({
                waypointsInWater: expect.any(Number),
                crossings: expect.any(Number),
                unbridgedRuns: expect.any(Number),
                repairedLegs: expect.any(Number),
            });
            expect(diagnostics.waypointsInWater).toBeGreaterThan(0);
            expect(diagnostics.bridges.length).toBe(diagnostics.crossings);
        });
    });
});
