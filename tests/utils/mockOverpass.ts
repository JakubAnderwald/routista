/**
 * Serves committed OSM fixtures in place of live Overpass calls.
 *
 * `radarService` fetches water and bridge geometry while repairing river
 * crossings. Tests must not hit Overpass, and recording those responses
 * alongside the Radar ones would duplicate data already committed under
 * `tests/fixtures/water/`. So the service is mocked and answers from the
 * fixture for whichever city the current scenario is in.
 *
 * Usage — the `vi.mock` factory is hoisted above imports, so it must not
 * close over anything; it resolves the fixture when called instead:
 *
 * ```ts
 * vi.mock("@/lib/overpassService", () => ({
 *     getWaterAndBridges: async () =>
 *         (await import("../utils/mockOverpass")).currentWaterFixture(),
 * }));
 * // then, per scenario:
 * useWaterFixture(scenario.city);
 * ```
 */

import { FeatureCollection } from "geojson";
import { CityName } from "../fixtures/scenarios";
import { loadWaterFixture } from "./radarFixtures";

const EMPTY: FeatureCollection = { type: "FeatureCollection", features: [] };

let current: FeatureCollection = EMPTY;

/**
 * Points the mocked Overpass service at a city's committed fixture.
 *
 * @param city - City to serve, or null for a scenario with no water data.
 */
export function useWaterFixture(city: CityName | null): void {
    current = city ? loadWaterFixture(city) : EMPTY;
}

/**
 * The fixture `useWaterFixture` last selected.
 *
 * @returns Water and bridge geometry for the current scenario.
 */
export function currentWaterFixture(): FeatureCollection {
    return current;
}
