import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
    classifyOverpassFailure,
    fetchWaterAndBridges,
    getWaterAndBridges,
    overpassEndpoints,
    OverpassQueryError,
    queryWithFallback,
} from "@/lib/overpassService";
import * as Sentry from "@sentry/nextjs";
import { RIVER_CROSSING } from "@/config";

// Hoisted so the mock factory, which runs before imports, can see them.
const { redisGet, redisSet } = vi.hoisted(() => ({ redisGet: vi.fn(), redisSet: vi.fn() }));

vi.mock("@upstash/redis", () => ({
    Redis: class {
        get = redisGet;
        set = redisSet;
    },
}));

vi.mock("@sentry/nextjs", () => ({
    captureException: vi.fn(),
    captureMessage: vi.fn(),
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

const BBOX: [number, number, number, number] = [51.5, -0.1, 51.51, -0.09];

/** An Overpass payload with one river way and one bridge. */
const OVERPASS_RESPONSE = {
    elements: [
        {
            type: "way",
            id: 1,
            tags: { natural: "water", name: "River" },
            // OSM area ways are closed: the last node repeats the first.
            geometry: [
                { lat: 51.5, lon: -0.1 },
                { lat: 51.5, lon: -0.09 },
                { lat: 51.502, lon: -0.09 },
                { lat: 51.502, lon: -0.1 },
                { lat: 51.5, lon: -0.1 },
            ],
        },
        {
            type: "way",
            id: 2,
            tags: { bridge: "yes", highway: "footway", name: "Foot Bridge" },
            geometry: [
                { lat: 51.4995, lon: -0.095 },
                { lat: 51.5025, lon: -0.095 },
            ],
        },
    ],
};

function okResponse(body: unknown) {
    return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
}

function errorResponse(status: number, body: string) {
    return { ok: false, status, text: async () => body };
}

/** A request that never answers, and rejects like fetch does once it is aborted. */
function hang(signal: AbortSignal): Promise<never> {
    return new Promise((_, reject) => {
        signal.addEventListener("abort", () =>
            reject(new DOMException("This operation was aborted", "AbortError"))
        );
    });
}

/** Answers each request by the host it was sent to. */
function routeFetch(byHost: Record<string, (signal: AbortSignal) => Promise<unknown>>) {
    mockFetch.mockImplementation((url: string, init: RequestInit) => {
        const reply = byHost[new URL(url).host];
        if (!reply) throw new Error(`unexpected request to ${url}`);
        return reply(init.signal as AbortSignal);
    });
}

/** Hosts mockFetch was called with, in order. */
function requestedHosts(): string[] {
    return mockFetch.mock.calls.map(([url]) => new URL(url as string).host);
}

describe("fetchWaterAndBridges", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("normalizes water ways into closed polygons", async () => {
        mockFetch.mockResolvedValueOnce(okResponse(OVERPASS_RESPONSE));

        const collection = await fetchWaterAndBridges(BBOX);
        const water = collection.features.filter(f => f.properties?.kind === "water");

        expect(water).toHaveLength(1);
        const ring = (water[0].geometry as { coordinates: number[][][] }).coordinates[0];
        // GeoJSON order is [lng, lat], and the ring is closed.
        expect(ring[0]).toEqual([-0.1, 51.5]);
        expect(ring[ring.length - 1]).toEqual(ring[0]);
    });

    it("keeps bridges as LineStrings with their tags", async () => {
        mockFetch.mockResolvedValueOnce(okResponse(OVERPASS_RESPONSE));

        const bridges = (await fetchWaterAndBridges(BBOX)).features.filter(
            f => f.properties?.kind === "bridge"
        );

        expect(bridges).toHaveLength(1);
        expect(bridges[0].properties).toMatchObject({ highway: "footway", name: "Foot Bridge" });
        expect(bridges[0].geometry.type).toBe("LineString");
    });

    it("assembles multipolygon relations from their members", async () => {
        mockFetch.mockResolvedValueOnce(
            okResponse({
                elements: [
                    {
                        type: "relation",
                        id: 3,
                        tags: { natural: "water", name: "Big River" },
                        members: [
                            {
                                type: "way",
                                role: "outer",
                                geometry: [
                                    { lat: 51.5, lon: -0.1 },
                                    { lat: 51.5, lon: -0.09 },
                                ],
                            },
                            {
                                type: "way",
                                role: "outer",
                                geometry: [
                                    { lat: 51.5, lon: -0.09 },
                                    { lat: 51.502, lon: -0.09 },
                                    { lat: 51.5, lon: -0.1 },
                                ],
                            },
                        ],
                    },
                ],
            })
        );

        const water = (await fetchWaterAndBridges(BBOX)).features.filter(
            f => f.properties?.kind === "water"
        );

        expect(water).toHaveLength(1);
        // The two members chained into one closed ring.
        expect((water[0].geometry as { coordinates: number[][][] }).coordinates[0]).toHaveLength(4);
    });

    it("keeps island holes as inner rings", async () => {
        mockFetch.mockResolvedValueOnce(
            okResponse({
                elements: [
                    {
                        type: "relation",
                        id: 6,
                        tags: { natural: "water" },
                        members: [
                            {
                                type: "way",
                                role: "outer",
                                geometry: [
                                    { lat: 51.5, lon: -0.1 },
                                    { lat: 51.5, lon: -0.09 },
                                    { lat: 51.502, lon: -0.09 },
                                    { lat: 51.502, lon: -0.1 },
                                    { lat: 51.5, lon: -0.1 },
                                ],
                            },
                            {
                                type: "way",
                                role: "inner",
                                geometry: [
                                    { lat: 51.5005, lon: -0.096 },
                                    { lat: 51.5005, lon: -0.094 },
                                    { lat: 51.5015, lon: -0.094 },
                                    { lat: 51.5005, lon: -0.096 },
                                ],
                            },
                        ],
                    },
                ],
            })
        );

        const water = (await fetchWaterAndBridges(BBOX)).features.filter(
            f => f.properties?.kind === "water"
        );

        expect((water[0].geometry as { coordinates: number[][][] }).coordinates).toHaveLength(2);
    });

    it("treats the older riverbank tagging as water", async () => {
        mockFetch.mockResolvedValueOnce(
            okResponse({
                elements: [
                    {
                        type: "way",
                        id: 7,
                        tags: { waterway: "riverbank" },
                        geometry: [
                            { lat: 51.5, lon: -0.1 },
                            { lat: 51.5, lon: -0.09 },
                            { lat: 51.502, lon: -0.09 },
                            { lat: 51.5, lon: -0.1 },
                        ],
                    },
                ],
            })
        );

        expect((await fetchWaterAndBridges(BBOX)).features[0].properties?.kind).toBe("water");
    });

    it("ignores a bridge tag without a highway, and degenerate geometry", async () => {
        mockFetch.mockResolvedValueOnce(
            okResponse({
                elements: [
                    { type: "way", id: 8, tags: { bridge: "yes" }, geometry: [{ lat: 51.5, lon: -0.1 }] },
                    {
                        type: "way",
                        id: 9,
                        tags: { bridge: "yes", highway: "footway" },
                        geometry: [{ lat: 51.5, lon: -0.1 }],
                    },
                    { type: "way", id: 10, tags: { natural: "water" }, geometry: [{ lat: 51.5, lon: -0.1 }] },
                ],
            })
        );

        expect((await fetchWaterAndBridges(BBOX)).features).toEqual([]);
    });

    it("drops water outlines that are not closed", async () => {
        // Forcing a closing edge onto an incomplete outline would mark land as
        // water and corrupt every water measurement downstream.
        mockFetch.mockResolvedValueOnce(
            okResponse({
                elements: [
                    {
                        type: "way",
                        id: 11,
                        tags: { natural: "water" },
                        geometry: [
                            { lat: 51.5, lon: -0.1 },
                            { lat: 51.5, lon: -0.09 },
                            { lat: 51.502, lon: -0.09 },
                        ],
                    },
                    {
                        type: "relation",
                        id: 12,
                        tags: { natural: "water" },
                        members: [
                            {
                                type: "way",
                                role: "outer",
                                geometry: [
                                    { lat: 51.5, lon: -0.1 },
                                    { lat: 51.5, lon: -0.09 },
                                ],
                            },
                        ],
                    },
                ],
            })
        );

        expect((await fetchWaterAndBridges(BBOX)).features).toEqual([]);
    });

    it("ignores elements that are neither water nor bridges", async () => {
        mockFetch.mockResolvedValueOnce(
            okResponse({
                elements: [
                    { type: "way", id: 4, tags: { highway: "residential" }, geometry: [] },
                    { type: "way", id: 5, geometry: [] },
                ],
            })
        );

        expect((await fetchWaterAndBridges(BBOX)).features).toEqual([]);
    });

    it("retries when Overpass is busy", async () => {
        vi.useFakeTimers();
        mockFetch
            .mockResolvedValueOnce({ ok: false, status: 429, text: async () => "too many" })
            .mockResolvedValueOnce(okResponse(OVERPASS_RESPONSE));

        const pending = fetchWaterAndBridges(BBOX);
        await vi.runAllTimersAsync();
        const collection = await pending;

        expect(mockFetch).toHaveBeenCalledTimes(2);
        expect(collection.features.length).toBeGreaterThan(0);
        vi.useRealTimers();
    });

    it("gives up on an error that will not clear", async () => {
        vi.useFakeTimers();
        mockFetch.mockResolvedValue({ ok: false, status: 400, text: async () => "bad query" });

        const pending = fetchWaterAndBridges(BBOX).catch(error => error);
        await vi.runAllTimersAsync();

        expect((await pending).message).toContain("400");
        expect(mockFetch).toHaveBeenCalledTimes(1);
        vi.useRealTimers();
    });
});

describe("getWaterAndBridges", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubEnv("KV_REST_API_URL", "https://redis.example");
        vi.stubEnv("KV_REST_API_TOKEN", "token");
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
    });

    it("serves a cached result without calling Overpass", async () => {
        redisGet.mockResolvedValueOnce({ type: "FeatureCollection", features: [] });

        const result = await getWaterAndBridges([1.5, 1.5, 1.51, 1.51]);

        expect(result).toEqual({ type: "FeatureCollection", features: [] });
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it("fetches and caches on a miss", async () => {
        redisGet.mockResolvedValueOnce(null);
        mockFetch.mockResolvedValueOnce(okResponse(OVERPASS_RESPONSE));

        const result = await getWaterAndBridges([2.5, 2.5, 2.51, 2.51]);

        expect(result?.features.length).toBeGreaterThan(0);
        expect(redisSet).toHaveBeenCalledWith(
            expect.stringContaining("osm:water:"),
            expect.anything(),
            expect.objectContaining({ ex: expect.any(Number) })
        );
    });

    it("still fetches when the cache read fails", async () => {
        redisGet.mockRejectedValueOnce(new Error("redis down"));
        mockFetch.mockResolvedValueOnce(okResponse(OVERPASS_RESPONSE));

        expect((await getWaterAndBridges([3.5, 3.5, 3.51, 3.51]))?.features.length).toBeGreaterThan(0);
    });

    it("tries once on the request path rather than working through a retry ladder", async () => {
        // A retry ladder here would block route generation for ~110 s on every
        // uncached request while Overpass is down.
        redisGet.mockResolvedValueOnce(null);
        mockFetch.mockResolvedValue({ ok: false, status: 429, text: async () => "busy" });

        expect(await getWaterAndBridges([6.5, 6.5, 6.51, 6.51])).toBeNull();
        // Each endpoint asked once, none of them twice.
        expect(mockFetch).toHaveBeenCalledTimes(RIVER_CROSSING.overpassEndpoints.length);
    });

    it("serves from a fallback without reporting to Sentry when the primary is at capacity", async () => {
        redisGet.mockResolvedValueOnce(null);
        routeFetch({
            "overpass-api.de": async () => errorResponse(502, "server is currently at capacity"),
            "overpass.private.coffee": async () => okResponse(OVERPASS_RESPONSE),
        });

        const result = await getWaterAndBridges([12.5, 12.5, 12.51, 12.51]);

        expect(result?.features.length).toBeGreaterThan(0);
        expect(Sentry.captureMessage).not.toHaveBeenCalled();
        expect(redisSet).toHaveBeenCalled();
    });

    it("tags an all-endpoint failure by the primary's cause and lists every endpoint", async () => {
        redisGet.mockResolvedValueOnce(null);
        routeFetch({
            "overpass-api.de": async () => errorResponse(502, "at capacity"),
            "overpass.private.coffee": async () => { throw new Error("fetch failed"); },
            "overpass.openstreetmap.fr": async () => errorResponse(429, "busy"),
        });

        expect(await getWaterAndBridges([13.5, 13.5, 13.51, 13.51])).toBeNull();
        expect(Sentry.captureMessage).toHaveBeenCalledTimes(1);
        expect(Sentry.captureMessage).toHaveBeenCalledWith(
            "Overpass fetch failed",
            expect.objectContaining({
                tags: { "overpass.failure": "http-502" },
                extra: expect.objectContaining({
                    failures: [
                        expect.objectContaining({ endpoint: expect.stringContaining("overpass-api.de"), status: 502 }),
                        expect.objectContaining({ reason: "fetch failed" }),
                        expect.objectContaining({ status: 429 }),
                    ],
                }),
            })
        );
    });

    it("does not cache a 200 whose query hit Overpass's own timeout", async () => {
        vi.stubEnv("OVERPASS_URL", "https://only.example/api/interpreter");
        redisGet.mockResolvedValueOnce(null);
        mockFetch.mockResolvedValue(
            okResponse({ elements: [], remark: 'runtime error: Query timed out in "query" at line 3 after 16 seconds.' })
        );

        expect(await getWaterAndBridges([14.5, 14.5, 14.51, 14.51])).toBeNull();
        expect(redisSet).not.toHaveBeenCalled();
        expect(Sentry.captureMessage).toHaveBeenCalledWith(
            "Overpass fetch failed",
            expect.objectContaining({ tags: { "overpass.failure": "bad-response" } })
        );
    });

    it("remembers a failure briefly instead of paying the timeout again", async () => {
        redisGet.mockResolvedValue(null);
        mockFetch.mockResolvedValue({ ok: false, status: 504, text: async () => "timeout" });

        const bbox: [number, number, number, number] = [7.5, 7.5, 7.51, 7.51];
        expect(await getWaterAndBridges(bbox)).toBeNull();
        const afterFirst = mockFetch.mock.calls.length;

        expect(await getWaterAndBridges(bbox)).toBeNull();
        expect(mockFetch).toHaveBeenCalledTimes(afterFirst);
    });

    it("tells Sentry why Overpass failed", async () => {
        redisGet.mockResolvedValueOnce(null);
        mockFetch.mockResolvedValue({ ok: false, status: 429, text: async () => "rate limited" });

        expect(await getWaterAndBridges([8.5, 8.5, 8.51, 8.51])).toBeNull();
        expect(Sentry.captureMessage).toHaveBeenCalledWith(
            "Overpass fetch failed",
            expect.objectContaining({
                tags: { "overpass.failure": "http-429" },
                extra: expect.objectContaining({
                    bbox: [8.5, 8.5, 8.51, 8.51],
                    reason: expect.stringContaining("429: rate limited"),
                }),
            })
        );
    });

    it("tags a well-formed JSON body with malformed elements as a bad response", async () => {
        redisGet.mockResolvedValueOnce(null);
        mockFetch.mockResolvedValue(okResponse({ elements: [null] }));

        expect(await getWaterAndBridges([11.5, 11.5, 11.51, 11.51])).toBeNull();
        expect(Sentry.captureMessage).toHaveBeenCalledWith(
            "Overpass fetch failed",
            expect.objectContaining({ tags: { "overpass.failure": "bad-response" } })
        );
    });

    it("keeps the HTTP status when the error body cannot be read", async () => {
        redisGet.mockResolvedValueOnce(null);
        mockFetch.mockResolvedValue({ ok: false, status: 504, text: async () => { throw new Error("socket hang up"); } });

        expect(await getWaterAndBridges([9.5, 9.5, 9.51, 9.51])).toBeNull();
        expect(Sentry.captureMessage).toHaveBeenCalledWith(
            "Overpass fetch failed",
            expect.objectContaining({ tags: { "overpass.failure": "http-504" } })
        );
    });

    it("bounds the in-process cache", async () => {
        redisGet.mockResolvedValue(null);
        mockFetch.mockResolvedValue(okResponse(OVERPASS_RESPONSE));

        // Fill well past the limit, then come back to the first one.
        const first: [number, number, number, number] = [10, 10, 10.01, 10.01];
        await getWaterAndBridges(first);
        for (let i = 1; i <= RIVER_CROSSING.maxMemoryCacheEntries + 2; i++) {
            await getWaterAndBridges([10 + i, 10 + i, 10 + i + 0.01, 10 + i + 0.01]);
        }

        const before = mockFetch.mock.calls.length;
        await getWaterAndBridges(first);

        // Evicted, so it had to be fetched again rather than growing forever.
        expect(mockFetch.mock.calls.length).toBeGreaterThan(before);
    });

    it("returns null rather than throwing when Overpass is unavailable", async () => {
        vi.useFakeTimers();
        redisGet.mockResolvedValueOnce(null);
        mockFetch.mockRejectedValue(new Error("network down"));

        const pending = getWaterAndBridges([4.5, 4.5, 4.51, 4.51]);
        await vi.runAllTimersAsync();

        expect(await pending).toBeNull();
        vi.useRealTimers();
    });
});

describe("queryWithFallback", () => {
    const ENDPOINTS = [
        "https://a.example/api/interpreter",
        "https://b.example/api/interpreter",
        "https://c.example/api/interpreter",
    ];
    const BUDGET_MS = 15_000;
    const HEDGE_MS = 4_000;

    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it("asks only the primary when it answers", async () => {
        routeFetch({ "a.example": async () => okResponse(OVERPASS_RESPONSE) });

        const data = await queryWithFallback("q", ENDPOINTS, BUDGET_MS, HEDGE_MS);

        expect(data.elements).toHaveLength(2);
        expect(requestedHosts()).toEqual(["a.example"]);
    });

    it("hands over at once when the primary fails outright", async () => {
        const log = vi.spyOn(console, "log").mockImplementation(() => {});
        routeFetch({
            "a.example": async () => errorResponse(502, "at capacity"),
            "b.example": async () => okResponse(OVERPASS_RESPONSE),
        });

        const data = await queryWithFallback("q", ENDPOINTS, BUDGET_MS, HEDGE_MS);

        expect(data.elements).toHaveLength(2);
        // No hedge delay was waited out: the 502 started the next endpoint.
        expect(vi.getTimerCount()).toBe(0);
        expect(requestedHosts()).toEqual(["a.example", "b.example"]);
        expect(log).toHaveBeenCalledWith(expect.stringContaining("Served by b.example (primary: 502: at capacity)"));
    });

    it("asks the next endpoint too when the primary stays silent, and cancels the primary", async () => {
        let primarySignal: AbortSignal | undefined;
        vi.spyOn(console, "log").mockImplementation(() => {});
        routeFetch({
            "a.example": signal => {
                primarySignal = signal;
                return hang(signal);
            },
            "b.example": async () => okResponse(OVERPASS_RESPONSE),
        });

        const pending = queryWithFallback("q", ENDPOINTS, BUDGET_MS, HEDGE_MS);
        await vi.advanceTimersByTimeAsync(HEDGE_MS - 1);
        expect(requestedHosts()).toEqual(["a.example"]);

        await vi.advanceTimersByTimeAsync(1);
        const data = await pending;

        expect(data.elements).toHaveLength(2);
        expect(requestedHosts()).toEqual(["a.example", "b.example"]);
        expect(primarySignal?.aborted).toBe(true);
    });

    it("moves on from a 200 whose body is not a usable answer", async () => {
        routeFetch({
            "a.example": async () => okResponse({ elements: [], remark: "runtime error: Query run out of memory" }),
            "b.example": async () => okResponse({ remark: "no elements here" }),
            "c.example": async () => okResponse(OVERPASS_RESPONSE),
        });
        vi.spyOn(console, "log").mockImplementation(() => {});

        const data = await queryWithFallback("q", ENDPOINTS, BUDGET_MS, HEDGE_MS);

        expect(data.elements).toHaveLength(2);
        expect(requestedHosts()).toEqual(["a.example", "b.example", "c.example"]);
    });

    it("reports every endpoint's failure, in configured order, when all fail", async () => {
        routeFetch({
            "a.example": async () => errorResponse(400, "bad query"),
            "b.example": async () => errorResponse(400, "bad query"),
            "c.example": async () => { throw new Error("fetch failed"); },
        });

        const error = await queryWithFallback("q", ENDPOINTS, BUDGET_MS, HEDGE_MS).catch(e => e);

        expect(error).toBeInstanceOf(OverpassQueryError);
        expect(error.failures).toEqual([
            { endpoint: ENDPOINTS[0], reason: "400: bad query", status: 400 },
            { endpoint: ENDPOINTS[1], reason: "400: bad query", status: 400 },
            { endpoint: ENDPOINTS[2], reason: "fetch failed", status: undefined },
        ]);
        expect(error.message).toBe(
            "Overpass failed on 3 endpoint(s) — a.example: 400: bad query; b.example: 400: bad query; c.example: fetch failed"
        );
        // The network failure could clear on a later attempt.
        expect(error.retryable).toBe(true);
    });

    it("is not worth retrying when every endpoint rejected the query", async () => {
        mockFetch.mockResolvedValue(errorResponse(400, "bad query"));

        const error = await queryWithFallback("q", ENDPOINTS, BUDGET_MS, HEDGE_MS).catch(e => e);

        expect(error.retryable).toBe(false);
    });

    it("gives up on everything when the budget runs out", async () => {
        const signals: AbortSignal[] = [];
        mockFetch.mockImplementation((_url: string, init: RequestInit) => {
            signals.push(init.signal as AbortSignal);
            return hang(init.signal as AbortSignal);
        });

        // Short enough that the third endpoint is never reached.
        const pending = queryWithFallback("q", ENDPOINTS, 6_000, HEDGE_MS).catch(e => e);
        await vi.advanceTimersByTimeAsync(6_000);
        const error = await pending;

        expect(error.failures.map((f: { reason: string }) => f.reason)).toEqual([
            "timeout after 6000ms",
            "timeout after 6000ms",
            "not tried",
        ]);
        expect(classifyOverpassFailure(error.failures[0].reason)).toBe("timeout");
        expect(signals).toHaveLength(2);
        expect(signals.every(signal => signal.aborted)).toBe(true);
        expect(vi.getTimerCount()).toBe(0);
    });
});

describe("overpassEndpoints", () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it("defaults to the configured list, primary first", () => {
        vi.stubEnv("OVERPASS_URLS", "");
        vi.stubEnv("OVERPASS_URL", "");

        expect(overpassEndpoints()).toEqual([...RIVER_CROSSING.overpassEndpoints]);
        expect(overpassEndpoints()[0]).toContain("overpass-api.de");
    });

    it("takes a comma-separated OVERPASS_URLS list", () => {
        vi.stubEnv("OVERPASS_URLS", " https://a.example/api/interpreter, ,https://b.example/api/interpreter ");
        vi.stubEnv("OVERPASS_URL", "https://ignored.example/api/interpreter");

        expect(overpassEndpoints()).toEqual([
            "https://a.example/api/interpreter",
            "https://b.example/api/interpreter",
        ]);
    });

    it("pins a single endpoint with the older OVERPASS_URL", () => {
        vi.stubEnv("OVERPASS_URLS", "");
        vi.stubEnv("OVERPASS_URL", "https://only.example/api/interpreter");

        expect(overpassEndpoints()).toEqual(["https://only.example/api/interpreter"]);
    });

    it("keeps fixture capture on the primary alone", async () => {
        vi.stubEnv("OVERPASS_URLS", "");
        vi.stubEnv("OVERPASS_URL", "");
        mockFetch.mockReset();
        mockFetch.mockResolvedValue(errorResponse(400, "bad query"));

        await expect(fetchWaterAndBridges(BBOX)).rejects.toThrow("400");
        expect(requestedHosts()).toEqual(["overpass-api.de"]);
    });
});

describe("classifyOverpassFailure", () => {
    it.each([
        ["502: # 502 Gateway Timeout", "http-502"],
        ["timeout after 15000ms", "timeout"],
        ["bad response — runtime error: Query timed out", "bad-response"],
        ["Overpass error after 1 attempts — 429: busy", "http-429"],
        ["Overpass error after 1 attempts — 504: gateway timeout", "http-504"],
        ["Overpass error after 1 attempts — This operation was aborted", "timeout"],
        ["Overpass error after 1 attempts — fetch failed", "network"],
        ["Overpass error after 1 attempts — Unexpected token '<', \"<html>\" is not valid JSON", "bad-response"],
    ])("buckets %s as %s", (reason, expected) => {
        expect(classifyOverpassFailure(reason)).toBe(expected);
    });
});
