/**
 * OSM water and bridge fixture capture — run with `npm run fixtures:routes`.
 *
 * Pulls water polygons and bridges from Overpass for each city in the scenario
 * matrix. Kept apart from the Radar capture because that file mocks the
 * Overpass service, and this one needs the real thing.
 *
 * Skipped unless `CAPTURE_FIXTURES=1`.
 */

import { describe, it, expect } from "vitest";
import { fetchWaterAndBridges } from "@/lib/overpassService";
import { CITY_BBOXES, CityName } from "../fixtures/scenarios";
import { writeWaterFixture } from "../utils/radarFixtures";

describe.skipIf(process.env.CAPTURE_FIXTURES !== "1")("capture OSM fixtures", () => {
    it.each(Object.keys(CITY_BBOXES) as CityName[])(
        "captures water and bridges for %s",
        { timeout: 180_000 },
        async city => {
            const collection = await fetchWaterAndBridges(CITY_BBOXES[city]);

            const water = collection.features.filter(f => f.properties?.kind === "water");
            const bridges = collection.features.filter(f => f.properties?.kind === "bridge");

            expect(water.length).toBeGreaterThan(0);
            expect(bridges.length).toBeGreaterThan(0);

            writeWaterFixture(city, collection);
        }
    );
});
