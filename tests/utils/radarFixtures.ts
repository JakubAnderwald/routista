/**
 * Recording and replaying of Radar API responses.
 *
 * The route quality suite needs real routing data but must run offline in CI,
 * so `scripts/capture-route-fixtures` records every Radar request a scenario
 * makes, keyed by request URL, and the integration suite replays them through
 * the unmodified `getRadarRoute`.
 */

import fs from "fs";
import path from "path";
import { FeatureCollection } from "geojson";
import { buildWaterIndex, WaterIndex } from "@/lib/waterGeometry";
import { CityName } from "../fixtures/scenarios";

const FIXTURE_ROOT = path.resolve(__dirname, "../fixtures");
const RADAR_DIR = path.join(FIXTURE_ROOT, "radar");
const WATER_DIR = path.join(FIXTURE_ROOT, "water");

export interface RecordedResponse {
    status: number;
    body: unknown;
}

export interface RadarFixture {
    scenario: string;
    capturedAt: string;
    /** Radar request URL -> recorded response. */
    requests: Record<string, RecordedResponse>;
}

/**
 * Path of a scenario's recorded Radar responses.
 *
 * @param scenarioId - Scenario id.
 * @returns Absolute path to the fixture file.
 */
export function radarFixturePath(scenarioId: string): string {
    return path.join(RADAR_DIR, `${scenarioId}.json`);
}

/**
 * Path of a city's OSM water and bridge fixture.
 *
 * @param city - City name.
 * @returns Absolute path to the fixture file.
 */
export function waterFixturePath(city: CityName): string {
    return path.join(WATER_DIR, `${city}.geo.json`);
}

/**
 * Whether a scenario has recorded Radar responses on disk.
 *
 * @param scenarioId - Scenario id.
 * @returns True if the fixture exists.
 */
export function hasRadarFixture(scenarioId: string): boolean {
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    return fs.existsSync(radarFixturePath(scenarioId));
}

/**
 * Reads a scenario's recorded Radar responses.
 *
 * @param scenarioId - Scenario id.
 * @returns The fixture.
 * @throws If the fixture has not been captured.
 */
export function loadRadarFixture(scenarioId: string): RadarFixture {
    const file = radarFixturePath(scenarioId);
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    if (!fs.existsSync(file)) {
        throw new Error(
            `Missing Radar fixture for "${scenarioId}". Run: npm run fixtures:routes`
        );
    }
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    return JSON.parse(fs.readFileSync(file, "utf-8")) as RadarFixture;
}

/**
 * Reads a city's water polygons and builds a query index.
 *
 * @param city - City name.
 * @returns Water index for `isPointInWater` and `routeWaterStats`.
 * @throws If the fixture has not been captured.
 */
export function loadWaterIndex(city: CityName): WaterIndex {
    return buildWaterIndex(loadWaterFixture(city));
}

/**
 * Reads a city's raw OSM water and bridge GeoJSON.
 *
 * @param city - City name.
 * @returns FeatureCollection with water polygons and bridge LineStrings.
 * @throws If the fixture has not been captured.
 */
export function loadWaterFixture(city: CityName): FeatureCollection {
    const file = waterFixturePath(city);
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    if (!fs.existsSync(file)) {
        throw new Error(`Missing water fixture for "${city}". Run: npm run fixtures:routes`);
    }
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    return JSON.parse(fs.readFileSync(file, "utf-8")) as FeatureCollection;
}

/**
 * Builds a `fetch` replacement that answers from a recorded fixture.
 *
 * Requests that were not recorded throw, so a scenario silently drifting into
 * different waypoints fails loudly instead of hitting the network.
 *
 * @param fixture - Recorded responses.
 * @returns A fetch implementation for `vi.stubGlobal('fetch', ...)`.
 */
export function replayFetch(fixture: RadarFixture): typeof fetch {
    return (async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        const recorded = fixture.requests[url];

        if (!recorded) {
            throw new Error(
                `No recorded response for ${url} in fixture "${fixture.scenario}". ` +
                    `Re-record with: npm run fixtures:routes`
            );
        }

        return {
            ok: recorded.status >= 200 && recorded.status < 300,
            status: recorded.status,
            statusText: String(recorded.status),
            json: async () => recorded.body,
            text: async () => JSON.stringify(recorded.body),
        } as Response;
    }) as typeof fetch;
}

/**
 * Wraps the real `fetch` so every request and response is captured.
 *
 * @param realFetch - The fetch implementation to delegate to.
 * @returns The recording fetch and the map it fills.
 */
export function recordingFetch(realFetch: typeof fetch): {
    fetch: typeof fetch;
    requests: Record<string, RecordedResponse>;
} {
    const requests: Record<string, RecordedResponse> = {};

    const wrapped = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        const response = await realFetch(input, init);
        const body = await response.clone().json();

        requests[url] = { status: response.status, body: pruneRadarResponse(body) };
        return response;
    }) as typeof fetch;

    return { fetch: wrapped, requests };
}

/**
 * Strips the parts of a Radar directions response nothing reads.
 *
 * Turn-by-turn `steps` carry banner and voice instructions and account for
 * most of the payload; keeping them would put tens of megabytes of fixtures in
 * the repository. Everything `radarService` consumes — route distance and
 * geometry, and per-leg distance and geometry — is preserved.
 *
 * @param body - Raw Radar response body.
 * @returns The same shape with `steps` removed.
 */
export function pruneRadarResponse(body: unknown): unknown {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = body as any;
    if (!response?.routes) return body;

    return {
        ...response,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        routes: response.routes.map((route: any) => ({
            ...route,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            legs: route.legs?.map((leg: any) => {
                const pruned = { ...leg };
                delete pruned.steps;
                return pruned;
            }),
        })),
    };
}

/**
 * Writes a scenario's recorded responses to disk.
 *
 * @param scenarioId - Scenario id.
 * @param requests - Recorded responses keyed by request URL.
 */
export function writeRadarFixture(
    scenarioId: string,
    requests: Record<string, RecordedResponse>
): void {
    fs.mkdirSync(RADAR_DIR, { recursive: true });

    const fixture: RadarFixture = {
        scenario: scenarioId,
        capturedAt: new Date().toISOString(),
        requests,
    };

    // Compact: these files are large and only ever read by machines.
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    fs.writeFileSync(radarFixturePath(scenarioId), `${JSON.stringify(fixture)}\n`);
}

/**
 * Writes a city's OSM water and bridge GeoJSON to disk.
 *
 * @param city - City name.
 * @param collection - FeatureCollection to write.
 */
export function writeWaterFixture(city: CityName, collection: FeatureCollection): void {

    fs.mkdirSync(WATER_DIR, { recursive: true });
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    fs.writeFileSync(waterFixturePath(city), `${JSON.stringify(collection)}\n`);
}
