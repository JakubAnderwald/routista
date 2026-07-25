/**
 * Route quality against the live Radar API — GitHub issue #47.
 *
 * The offline suite pins behaviour to recorded fixtures, which cannot notice
 * Radar changing its routing graph underneath us. This suite runs the same
 * scenarios against the real API and applies the same invariants, so upstream
 * drift shows up as a failure rather than a stale fixture.
 *
 * Costs API calls, so it is skipped unless `RUN_LIVE_ROUTE_TESTS=1`.
 *
 * Run with: npm run test:live
 */

import { describe, it, expect, beforeAll, vi } from "vitest";
import dotenv from "dotenv";
import { ROUTE_QUALITY } from "@/config";
import { SCENARIOS } from "../fixtures/scenarios";
import { KNOWN_BROKEN, measureScenario } from "../utils/routeMeasurement";
import { useWaterFixture } from "../utils/mockOverpass";

// Radar is the thing under test here, not Overpass: serve OSM from fixtures so
// a slow or unavailable Overpass cannot make this suite flap.
vi.mock("@/lib/overpassService", () => ({
    getWaterAndBridges: async () => (await import("../utils/mockOverpass")).currentWaterFixture(),
    fetchWaterAndBridges: async () => (await import("../utils/mockOverpass")).currentWaterFixture(),
}));

dotenv.config({ path: ".env.local" });

const LIVE = process.env.RUN_LIVE_ROUTE_TESTS === "1";

describe.skipIf(!LIVE)("river scenarios (live Radar)", () => {
    beforeAll(() => {
        const key = process.env.NEXT_PUBLIC_RADAR_LIVE_PK || process.env.NEXT_PUBLIC_RADAR_TEST_PK;
        if (!key) throw new Error("No Radar API key. Run: vercel env pull .env.local");

        // Never answer from a cached route: this suite exists to see what
        // Radar returns today.
        delete process.env.KV_REST_API_URL;
        delete process.env.KV_REST_API_TOKEN;
        delete process.env.UPSTASH_REDIS_REST_URL;
        delete process.env.UPSTASH_REDIS_REST_TOKEN;
    });

    it.each(SCENARIOS.filter(s => !KNOWN_BROKEN.has(s.id)))(
        "$id still crosses water instead of travelling along it",
        { timeout: 300_000 },
        async scenario => {
            useWaterFixture(scenario.city);
            const metrics = await measureScenario(scenario);

            if (metrics.maxContiguousWaterMeters !== null) {
                expect(metrics.maxContiguousWaterMeters).toBeLessThan(
                    ROUTE_QUALITY.maxWaterCrossingMeters
                );
            }
            if (scenario.mode !== "driving-car") {
                expect(metrics.maxEdgeMeters).toBeLessThan(400);
            }
        }
    );

    it.each(SCENARIOS.filter(s => KNOWN_BROKEN.has(s.id)))(
        "$id reproduces issue #47 against live Radar",
        { timeout: 300_000 },
        async scenario => {
            useWaterFixture(scenario.city);
            const metrics = await measureScenario(scenario);

            // If this starts failing, Radar changed something upstream: check
            // whether the ferry ways are still in its walking graph before
            // assuming our own fix regressed.
            expect(metrics.maxContiguousWaterMeters).toBeGreaterThanOrEqual(
                ROUTE_QUALITY.maxWaterCrossingMeters
            );
        }
    );
});
