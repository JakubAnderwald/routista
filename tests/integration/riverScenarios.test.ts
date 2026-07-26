/**
 * Route quality across the scenario matrix — GitHub issue #47.
 *
 * Replays recorded Radar responses through the unmodified `getRadarRoute` and
 * measures the result, so the whole suite runs offline and deterministically.
 *
 * Two kinds of check run here:
 *
 * 1. Invariants that say what a good route is. The controls (Madrid, Paris,
 *    Budapest, north London, driving) satisfy them today. The London walking
 *    and cycling scenarios are listed in `KNOWN_BROKEN`, and the suite asserts
 *    they are *still* broken, so the fix cannot land without updating the list.
 * 2. A comparison against `tests/fixtures/baseline.json`, which catches drift
 *    in any metric, in either direction.
 *
 * Re-record fixtures:   npm run fixtures:routes
 * Refresh the baseline: npm run test:baseline
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import { SCENARIOS } from "../fixtures/scenarios";
import { loadRadarFixture, replayFetch } from "../utils/radarFixtures";
import { useWaterFixture } from "../utils/mockOverpass";
import { measureScenario, ScenarioMetrics } from "../utils/routeMeasurement";
import {
    checkFollowsShape,
    checkLongEdge,
    checkNoSpurs,
    checkWaterTravel,
} from "../utils/routeInvariants";

vi.mock("@sentry/nextjs", () => ({
    captureException: vi.fn(),
    captureMessage: vi.fn(),
}));

// The river crossing repair reads OSM data; serve the committed fixtures so
// replay sees exactly the geometry capture saw.
vi.mock("@/lib/overpassService", () => ({
    getWaterAndBridges: async () => (await import("../utils/mockOverpass")).currentWaterFixture(),
    fetchWaterAndBridges: async () => (await import("../utils/mockOverpass")).currentWaterFixture(),
}));

const BASELINE_PATH = path.resolve(__dirname, "../fixtures/baseline.json");
const UPDATING = process.env.UPDATE_BASELINE === "1";

type Baseline = Record<string, ScenarioMetrics>;

function readBaseline(): Baseline {

    if (!fs.existsSync(BASELINE_PATH)) return {};

    return JSON.parse(fs.readFileSync(BASELINE_PATH, "utf-8")) as Baseline;
}

describe("river scenarios", () => {
    const measured: Baseline = {};

    beforeEach(() => {
        // No Redis, and a key so the real Radar code path runs instead of the
        // mock response. Replay matches on URL, so the value is irrelevant.
        vi.stubEnv("KV_REST_API_URL", "");
        vi.stubEnv("KV_REST_API_TOKEN", "");
        vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
        vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
        vi.stubEnv("NEXT_PUBLIC_RADAR_LIVE_PK", "fixture-replay-key");
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.unstubAllEnvs();

        if (!UPDATING) return;
        const merged = { ...readBaseline(), ...measured };
        const ordered = Object.fromEntries(
            SCENARIOS.map(s => [s.id, merged[s.id]]).filter(([, value]) => value)
        );

        fs.writeFileSync(BASELINE_PATH, `${JSON.stringify(ordered, null, 2)}\n`);
    });

    it.each(SCENARIOS)(
        "matches the recorded baseline for $id",
        { timeout: 120_000 },
        async scenario => {
            useWaterFixture(scenario.city);
            vi.stubGlobal("fetch", replayFetch(loadRadarFixture(scenario.id)));
            const metrics = await measureScenario(scenario);
            measured[scenario.id] = metrics;

            if (UPDATING) return;

            const baseline = readBaseline()[scenario.id];
            expect(
                baseline,
                `No baseline for "${scenario.id}". Refresh it with: npm run test:baseline`
            ).toBeDefined();
            expect(metrics).toEqual(baseline);
        }
    );

    it.each(SCENARIOS)(
        "$id crosses water instead of travelling along it",
        { timeout: 120_000 },
        async scenario => {
            useWaterFixture(scenario.city);
            vi.stubGlobal("fetch", replayFetch(loadRadarFixture(scenario.id)));

            checkWaterTravel(scenario, await measureScenario(scenario));
        }
    );

    it.each(SCENARIOS)(
        "$id has no edge longer than a street",
        { timeout: 120_000 },
        async scenario => {
            useWaterFixture(scenario.city);
            vi.stubGlobal("fetch", replayFetch(loadRadarFixture(scenario.id)));

            checkLongEdge(scenario, await measureScenario(scenario));
        }
    );

    it.each(SCENARIOS)(
        "$id follows the shape it was given",
        { timeout: 120_000 },
        async scenario => {
            useWaterFixture(scenario.city);
            vi.stubGlobal("fetch", replayFetch(loadRadarFixture(scenario.id)));

            checkFollowsShape(scenario, await measureScenario(scenario));
        }
    );

    it.each(SCENARIOS)(
        "$id has no out-and-back spurs",
        { timeout: 120_000 },
        async scenario => {
            useWaterFixture(scenario.city);
            vi.stubGlobal("fetch", replayFetch(loadRadarFixture(scenario.id)));

            checkNoSpurs(scenario, await measureScenario(scenario));
        }
    );
});
