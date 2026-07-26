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
import { ROUTE_QUALITY } from "@/config";
import { SCENARIOS } from "../fixtures/scenarios";
import { loadRadarFixture, replayFetch } from "../utils/radarFixtures";
import { KNOWN_BROKEN, measureScenario, ScenarioMetrics } from "../utils/routeMeasurement";

vi.mock("@sentry/nextjs", () => ({
    captureException: vi.fn(),
    captureMessage: vi.fn(),
}));

const BASELINE_PATH = path.resolve(__dirname, "../fixtures/baseline.json");
const UPDATING = process.env.UPDATE_BASELINE === "1";

type Baseline = Record<string, ScenarioMetrics>;

const HEALTHY = SCENARIOS.filter(s => !KNOWN_BROKEN.has(s.id));
const BROKEN = SCENARIOS.filter(s => KNOWN_BROKEN.has(s.id));

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

    it.each(HEALTHY)(
        "$id crosses water instead of travelling along it",
        { timeout: 120_000 },
        async scenario => {
            vi.stubGlobal("fetch", replayFetch(loadRadarFixture(scenario.id)));
            const metrics = await measureScenario(scenario);

            // The invariant issue #47 is about: every time this route touches
            // water it gets straight back out, which is what a bridge is.
            if (metrics.maxContiguousWaterMeters !== null) {
                expect(metrics.maxContiguousWaterMeters).toBeLessThan(
                    ROUTE_QUALITY.maxWaterCrossingMeters
                );
            }

            // No edge long enough to be a ferry hop. Bridge spans in this
            // matrix reach 323 m, so this only catches the real thing.
            if (scenario.mode !== "driving-car") {
                expect(metrics.maxEdgeMeters).toBeLessThan(400);
            }
        }
    );

    it.each(HEALTHY.filter(s => s.mode === "foot-walking"))(
        "$id follows the shape it was given",
        { timeout: 120_000 },
        async scenario => {
            vi.stubGlobal("fetch", replayFetch(loadRadarFixture(scenario.id)));
            const metrics = await measureScenario(scenario);

            // Loose bounds: dense waypoints on a street grid legitimately cost
            // ~3x the shape's length. The broken cases sit at 6.9-14.1x.
            expect(metrics.lengthRatio).toBeLessThan(3.5);
            expect(metrics.selfOverlapPercent).toBeLessThan(60);
        }
    );

    it.each(BROKEN)("$id is still broken by issue #47", { timeout: 120_000 }, async scenario => {
        vi.stubGlobal("fetch", replayFetch(loadRadarFixture(scenario.id)));
        const metrics = await measureScenario(scenario);

        // Remove the scenario from KNOWN_BROKEN when the fix lands; leaving it
        // there afterwards turns the suite red on purpose.
        expect(
            metrics.maxContiguousWaterMeters,
            `${scenario.id} no longer travels along the water — move it out of KNOWN_BROKEN`
        ).toBeGreaterThanOrEqual(ROUTE_QUALITY.maxWaterCrossingMeters);
    });
});
