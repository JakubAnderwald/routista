/**
 * Fixture capture — run with `npm run fixtures:routes`.
 *
 * Not a test: it drives the real `getRadarRoute` against the live Radar API,
 * records every request it makes, and pulls OSM water polygons from Overpass.
 * The committed output is what the offline suites read. Skipped unless
 * `CAPTURE_FIXTURES=1`, so `npm test` never hits the network.
 *
 * Requires `NEXT_PUBLIC_RADAR_LIVE_PK` (or the test key) in `.env.local`.
 */

import { describe, it, expect, beforeAll } from "vitest";
import dotenv from "dotenv";
import { getRadarRoute } from "@/lib/radarService";
import { CITY_BBOXES, CityName, SCENARIOS, scenarioWaypoints } from "../fixtures/scenarios";
import { fetchWaterAndBridges } from "../utils/overpassCapture";
import { recordingFetch, writeRadarFixture, writeWaterFixture } from "../utils/radarFixtures";

dotenv.config({ path: ".env.local" });

const CAPTURING = process.env.CAPTURE_FIXTURES === "1";

describe.skipIf(!CAPTURING)("capture route fixtures", () => {
    beforeAll(() => {
        const key = process.env.NEXT_PUBLIC_RADAR_LIVE_PK || process.env.NEXT_PUBLIC_RADAR_TEST_PK;
        if (!key) throw new Error("No Radar API key. Run: vercel env pull .env.local");

        // Recording must go straight to Radar, never to a cached result.
        delete process.env.KV_REST_API_URL;
        delete process.env.KV_REST_API_TOKEN;
        delete process.env.UPSTASH_REDIS_REST_URL;
        delete process.env.UPSTASH_REDIS_REST_TOKEN;
    });

    it.each(Object.keys(CITY_BBOXES) as CityName[])(
        "captures OSM water and bridges for %s",
        { timeout: 180_000 },
        async city => {
            const collection = await fetchWaterAndBridges(CITY_BBOXES[city]);

            const water = collection.features.filter(f => f.properties?.kind === "water");
            const bridges = collection.features.filter(f => f.properties?.kind === "bridge");
            console.log(`[capture] ${city}: ${water.length} water polygons, ${bridges.length} bridges`);

            expect(water.length).toBeGreaterThan(0);
            expect(bridges.length).toBeGreaterThan(0);

            writeWaterFixture(city, collection);
        }
    );

    // Sequential: Radar rate-limits, and getRadarRoute already paces its chunks.
    it.each(SCENARIOS)(
        "captures Radar responses for $id",
        { timeout: 300_000, concurrent: false },
        async scenario => {
            const waypoints = scenarioWaypoints(scenario);
            const realFetch = global.fetch;
            const recorder = recordingFetch(realFetch);
            global.fetch = recorder.fetch;

            try {
                const route = await getRadarRoute({ coordinates: waypoints, mode: scenario.mode });
                expect(route.features.length).toBeGreaterThan(0);
            } finally {
                global.fetch = realFetch;
            }

            const count = Object.keys(recorder.requests).length;
            console.log(`[capture] ${scenario.id}: ${count} Radar requests`);
            expect(count).toBeGreaterThan(0);

            writeRadarFixture(scenario.id, recorder.requests);
        }
    );
});
