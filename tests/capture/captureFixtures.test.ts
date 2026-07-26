/**
 * Radar fixture capture — run with `npm run fixtures:routes`.
 *
 * Not a test: it drives the real `getRadarRoute` against the live Radar API
 * and records every request it makes. The committed output is what the offline
 * suites read. Skipped unless `CAPTURE_FIXTURES=1`, so `npm test` never makes
 * a network call.
 *
 * OSM data comes from the committed water fixtures rather than Overpass, so
 * capture and replay see identical water and bridge geometry. Refresh those
 * first with `tests/capture/captureWater.test.ts`.
 *
 * Requires `NEXT_PUBLIC_RADAR_LIVE_PK` (or the test key) in `.env.local`.
 */

import { describe, it, expect, beforeAll, vi } from "vitest";
import dotenv from "dotenv";
import { getRadarRoute } from "@/lib/radarService";
import { SCENARIOS, scenarioWaypoints } from "../fixtures/scenarios";
import { recordingFetch, writeRadarFixture } from "../utils/radarFixtures";
import { useWaterFixture } from "../utils/mockOverpass";

vi.mock("@/lib/overpassService", () => ({
    getWaterAndBridges: async () => (await import("../utils/mockOverpass")).currentWaterFixture(),
    fetchWaterAndBridges: async () => (await import("../utils/mockOverpass")).currentWaterFixture(),
}));

dotenv.config({ path: ".env.local" });

describe.skipIf(process.env.CAPTURE_FIXTURES !== "1")("capture Radar fixtures", () => {
    beforeAll(() => {
        const key = process.env.NEXT_PUBLIC_RADAR_LIVE_PK || process.env.NEXT_PUBLIC_RADAR_TEST_PK;
        if (!key) throw new Error("No Radar API key. Run: vercel env pull .env.local");

        // Recording must go straight to Radar, never to a cached result.
        delete process.env.KV_REST_API_URL;
        delete process.env.KV_REST_API_TOKEN;
        delete process.env.UPSTASH_REDIS_REST_URL;
        delete process.env.UPSTASH_REDIS_REST_TOKEN;
    });

    // Sequential: Radar rate-limits, and getRadarRoute already paces its chunks.
    it.each(SCENARIOS)(
        "captures Radar responses for $id",
        { timeout: 300_000, concurrent: false },
        async scenario => {
            useWaterFixture(scenario.city);

            const waypoints = await scenarioWaypoints(scenario);
            const realFetch = global.fetch;
            const recorder = recordingFetch(realFetch);
            global.fetch = recorder.fetch;

            try {
                const route = await getRadarRoute({ coordinates: waypoints, mode: scenario.mode });
                expect(route.features.length).toBeGreaterThan(0);
            } finally {
                global.fetch = realFetch;
            }

            expect(Object.keys(recorder.requests).length).toBeGreaterThan(0);
            writeRadarFixture(scenario.id, recorder.requests);
        }
    );
});
