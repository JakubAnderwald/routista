/**
 * A/B check: does the river crossing repair actually change anything?
 *
 * Routes the same waypoints twice against live Radar — once with OSM data
 * available so the repair runs, once with none so it cannot — and compares.
 * Without this, a scenario passing its invariants proves nothing: it might
 * simply never have been broken.
 *
 * Costs API calls, so it is skipped unless `RUN_LIVE_ROUTE_TESTS=1`.
 */

import { describe, it, expect, beforeAll, vi } from "vitest";
import dotenv from "dotenv";
import { getRadarRoute } from "@/lib/radarService";
import { routeWaterStats } from "@/lib/waterGeometry";
import { summarizeRoute } from "@/lib/routeQuality";
import { ROUTE_QUALITY } from "@/config";
import { scenarioById, scenarioWaypoints } from "../fixtures/scenarios";
import { loadWaterIndex } from "../utils/radarFixtures";
import { useWaterFixture } from "../utils/mockOverpass";

vi.mock("@/lib/overpassService", () => ({
    getWaterAndBridges: async () => (await import("../utils/mockOverpass")).currentWaterFixture(),
    fetchWaterAndBridges: async () => (await import("../utils/mockOverpass")).currentWaterFixture(),
}));

dotenv.config({ path: ".env.local" });

describe.skipIf(process.env.RUN_LIVE_ROUTE_TESTS !== "1")("repair effect (live Radar)", () => {
    beforeAll(() => {
        const key = process.env.NEXT_PUBLIC_RADAR_LIVE_PK || process.env.NEXT_PUBLIC_RADAR_TEST_PK;
        if (!key) throw new Error("No Radar API key. Run: vercel env pull .env.local");

        delete process.env.KV_REST_API_URL;
        delete process.env.KV_REST_API_TOKEN;
        delete process.env.UPSTASH_REDIS_REST_URL;
        delete process.env.UPSTASH_REDIS_REST_TOKEN;
    });

    it.each(["london-heart-image", "london-heart-foot", "london-heart-bike"])(
        "%s is materially better with the repair than without",
        { timeout: 600_000 },
        async id => {
            const scenario = scenarioById(id);
            const waypoints = await scenarioWaypoints(scenario);
            const water = loadWaterIndex(scenario.city!);
            const threshold = ROUTE_QUALITY.longEdgeThresholdMeters[scenario.mode];

            // Repair off: no OSM data, so planCrossings cannot run.
            useWaterFixture(null);
            const before = await getRadarRoute({ coordinates: waypoints, mode: scenario.mode });

            // Repair on.
            useWaterFixture(scenario.city);
            const after = await getRadarRoute({ coordinates: waypoints, mode: scenario.mode });

            const waterBefore = routeWaterStats(before, water);
            const waterAfter = routeWaterStats(after, water);
            const qualityBefore = summarizeRoute(before, waypoints, threshold, scenario.mode);
            const qualityAfter = summarizeRoute(after, waypoints, threshold, scenario.mode);

            // Without the repair this shape travels kilometres along the Thames.
            expect(waterBefore.maxContiguousWaterMeters).toBeGreaterThan(
                ROUTE_QUALITY.maxWaterCrossingMeters
            );

            // With it, water is only ever crossed.
            expect(waterAfter.maxContiguousWaterMeters).toBeLessThan(
                ROUTE_QUALITY.maxWaterCrossingMeters
            );
            expect(waterAfter.totalWaterMeters).toBeLessThan(waterBefore.totalWaterMeters / 2);
            expect(qualityAfter.lengthRatio).toBeLessThan(qualityBefore.lengthRatio);
            expect(qualityAfter.maxEdgeMeters).toBeLessThan(qualityBefore.maxEdgeMeters);
        }
    );
});
