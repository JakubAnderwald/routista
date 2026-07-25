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

import { describe, it, beforeAll, vi } from "vitest";
import dotenv from "dotenv";
import { SCENARIOS } from "../fixtures/scenarios";
import { measureScenario } from "../utils/routeMeasurement";
import { checkAllInvariants } from "../utils/routeInvariants";
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

    it.each(SCENARIOS)(
        "$id still satisfies its route quality invariants",
        { timeout: 300_000 },
        async scenario => {
            useWaterFixture(scenario.city);

            // The same checks the offline suite runs, but against whatever
            // Radar returns today. A failure here means either our own
            // regression or Radar changing its graph — check which before
            // assuming the former.
            checkAllInvariants(scenario, await measureScenario(scenario));
        }
    );
});
