import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchWaterAndBridges, getWaterAndBridges } from "@/lib/overpassService";

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
