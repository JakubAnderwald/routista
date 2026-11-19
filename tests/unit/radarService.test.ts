import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { hashCoordinates, getRadarRoute, getRadarAutocomplete, chunkWaypoints } from '../../src/lib/radarService';
import { calculateRouteLength } from '../../src/lib/geoUtils';

// Mock the Redis module; set is shared so a test can check what was cached.
const mockRedisSet = vi.hoisted(() => vi.fn());
vi.mock('@upstash/redis', () => ({
    // A class, so `new Redis()` works; an arrow-function mock cannot be constructed.
    Redis: class {
        get = vi.fn();
        set = mockRedisSet;
    },
}));

// Mock Sentry
vi.mock('@sentry/nextjs', () => ({
    captureException: vi.fn(),
    captureMessage: vi.fn(),
}));

// Water data lookups succeed with nothing in them, so the river repair stays out of
// these tests unless one sets it up (see "river repair without water data").
const mockGetWaterAndBridges = vi.hoisted(() =>
    vi.fn(async () => ({ type: 'FeatureCollection' as const, features: [] }))
);
vi.mock('../../src/lib/overpassService', () => ({ getWaterAndBridges: mockGetWaterAndBridges }));

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('radarService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Reset env vars
        vi.stubEnv('KV_REST_API_URL', '');
        vi.stubEnv('KV_REST_API_TOKEN', '');
        vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
        vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');
        vi.stubEnv('NEXT_PUBLIC_RADAR_LIVE_PK', '');
        vi.stubEnv('NEXT_PUBLIC_RADAR_TEST_PK', '');
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('hashCoordinates', () => {
        it('should return consistent hash for same coordinates', () => {
            const coords: [number, number][] = [
                [51.505, -0.09],
                [51.506, -0.08],
            ];

            const hash1 = hashCoordinates(coords);
            const hash2 = hashCoordinates(coords);

            expect(hash1).toBe(hash2);
        });

        it('should return different hashes for different coordinates', () => {
            const coords1: [number, number][] = [[51.505, -0.09]];
            const coords2: [number, number][] = [[51.506, -0.09]];

            const hash1 = hashCoordinates(coords1);
            const hash2 = hashCoordinates(coords2);

            expect(hash1).not.toBe(hash2);
        });

        it('should return a base36 string', () => {
            const coords: [number, number][] = [[51.505, -0.09]];
            const hash = hashCoordinates(coords);

            // Base36 contains only 0-9 and a-z
            expect(hash).toMatch(/^[0-9a-z]+$/);
        });

        it('should handle empty array', () => {
            const hash = hashCoordinates([]);

            // Should return a valid hash (from empty string)
            expect(typeof hash).toBe('string');
            expect(hash.length).toBeGreaterThan(0);
        });

        it('should handle single coordinate', () => {
            const coords: [number, number][] = [[0, 0]];
            const hash = hashCoordinates(coords);

            expect(typeof hash).toBe('string');
            expect(hash.length).toBeGreaterThan(0);
        });

        it('should round coordinates to 5 decimal places', () => {
            // These should produce the same hash due to rounding
            const coords1: [number, number][] = [[51.5050001, -0.09000001]];
            const coords2: [number, number][] = [[51.5050002, -0.09000002]];

            const hash1 = hashCoordinates(coords1);
            const hash2 = hashCoordinates(coords2);

            // With 5 decimal place rounding, these tiny differences should be ignored
            expect(hash1).toBe(hash2);
        });

        it('should produce different hashes for coordinates differing at 5th decimal', () => {
            // These differ at the 5th decimal place
            const coords1: [number, number][] = [[51.50500, -0.09000]];
            const coords2: [number, number][] = [[51.50501, -0.09000]];

            const hash1 = hashCoordinates(coords1);
            const hash2 = hashCoordinates(coords2);

            // Should produce different hashes
            expect(hash1).not.toBe(hash2);
        });

        it('should handle negative coordinates', () => {
            const coords: [number, number][] = [
                [-33.8688, 151.2093], // Sydney
                [-34.6037, -58.3816], // Buenos Aires
            ];

            const hash = hashCoordinates(coords);

            expect(typeof hash).toBe('string');
            expect(hash.length).toBeGreaterThan(0);
        });

        it('should handle large coordinate arrays', () => {
            // Generate 100 coordinates
            const coords: [number, number][] = Array.from({ length: 100 }, (_, i) => [
                51.5 + i * 0.001,
                -0.09 + i * 0.001,
            ]);

            const hash = hashCoordinates(coords);

            expect(typeof hash).toBe('string');
            expect(hash.length).toBeGreaterThan(0);
        });

        it('should be order-sensitive', () => {
            const coords1: [number, number][] = [
                [51.505, -0.09],
                [51.506, -0.08],
            ];
            const coords2: [number, number][] = [
                [51.506, -0.08],
                [51.505, -0.09],
            ];

            const hash1 = hashCoordinates(coords1);
            const hash2 = hashCoordinates(coords2);

            // Different order should produce different hash
            expect(hash1).not.toBe(hash2);
        });
    });

    describe('chunkWaypoints', () => {
        const points = (count: number) =>
            Array.from({ length: count }, (_, i) => [51.5 + i * 0.001, -0.09]);

        it('has consecutive chunks share exactly one waypoint', () => {
            const chunks = chunkWaypoints(points(31));

            for (let i = 1; i < chunks.length; i++) {
                const previous = chunks[i - 1];
                const previousEnd = previous.start + previous.points.length - 1;

                // The boundary point is the one stitching drops. Sharing two
                // made the router travel that leg twice and left a jump
                // between the duplicates.
                expect(chunks[i].start).toBe(previousEnd);
            }
        });

        it('covers every waypoint exactly once across the chunks', () => {
            const chunks = chunkWaypoints(points(31));
            const covered = new Set<number>();

            for (const chunk of chunks) {
                chunk.points.forEach((_, offset) => covered.add(chunk.start + offset));
            }

            expect(covered.size).toBe(31);
        });

        it('never leaves a trailing chunk with a single point', () => {
            // 12 points would otherwise leave one point stranded after the
            // first chunk of 11, which Radar rejects as not a route.
            for (const count of [2, 11, 12, 21, 22, 100]) {
                for (const chunk of chunkWaypoints(points(count))) {
                    expect(chunk.points.length).toBeGreaterThanOrEqual(2);
                }
            }
        });

        it('keeps every chunk inside the Radar waypoint limit', () => {
            for (const chunk of chunkWaypoints(points(100))) {
                expect(chunk.points.length).toBeLessThanOrEqual(25);
            }
        });

        it('returns a single chunk for a short route', () => {
            expect(chunkWaypoints(points(2))).toHaveLength(1);
        });
    });

    describe('getRadarRoute', () => {
        it('should throw error for invalid coordinates - null', async () => {
            // @ts-expect-error - testing null input
            await expect(getRadarRoute({ coordinates: null, mode: 'foot-walking' }))
                .rejects.toThrow('Invalid coordinates');
        });

        it('should throw error for invalid coordinates - not array', async () => {
            // @ts-expect-error - testing invalid input
            await expect(getRadarRoute({ coordinates: 'not-an-array', mode: 'foot-walking' }))
                .rejects.toThrow('Invalid coordinates');
        });

        it('should throw error for too few coordinates', async () => {
            await expect(getRadarRoute({ coordinates: [[51.5, -0.1]], mode: 'foot-walking' }))
                .rejects.toThrow('Invalid coordinates');
        });

        it('should return mock response when no API key configured', async () => {
            const result = await getRadarRoute({
                coordinates: [[51.5, -0.1], [51.51, -0.09]],
                mode: 'foot-walking',
            });

            expect(result.type).toBe('FeatureCollection');
            expect(result.features).toHaveLength(1);
            expect(result.features[0].geometry.type).toBe('LineString');
        });

        it('should call Radar API when API key is configured', async () => {
            vi.stubEnv('NEXT_PUBLIC_RADAR_LIVE_PK', 'test-api-key');

            const mockRouteResponse = {
                routes: [{
                    distance: { value: 1000 },
                    duration: { value: 600 },
                    geometry: {
                        type: 'LineString',
                        coordinates: [[-0.1, 51.5], [-0.09, 51.51]],
                    },
                }],
            };

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockRouteResponse,
            });

            const result = await getRadarRoute({
                coordinates: [[51.5, -0.1], [51.51, -0.09]],
                mode: 'foot-walking',
            });

            expect(mockFetch).toHaveBeenCalled();
            expect(result.type).toBe('FeatureCollection');
            expect(result.features).toHaveLength(1);
            // The summary reports the geometry that is returned, so it can
            // differ from Radar's own total; that one is kept alongside it.
            expect(result.features[0].properties?.summary?.distance)
                .toBeCloseTo(calculateRouteLength(result), 6);
            expect(result.features[0].properties?.summary?.routedDistance).toBe(1000);
            expect(result.features[0].properties?.summary?.routedDuration).toBe(600);
        });

        it('splices out an out-and-back and reports what it removed', async () => {
            vi.stubEnv('NEXT_PUBLIC_RADAR_LIVE_PK', 'test-api-key');

            // A straight street with a 20 m detour into a side turning and
            // straight back out of it — what a waypoint snapped to a driveway
            // makes Radar do.
            const metre = 360 / (2 * Math.PI * 6371e3);
            const onStreet = (index: number): [number, number] => [-0.09, 51.5 + index * 30 * metre];
            const branch: [number, number] = [
                -0.09 + (20 * metre) / Math.cos((51.5 + 60 * metre) * Math.PI / 180),
                51.5 + 2 * 30 * metre,
            ];
            const geometry = [onStreet(0), onStreet(1), onStreet(2), branch, onStreet(2), onStreet(3)];

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    routes: [{
                        distance: { value: 130 },
                        duration: { value: 120 },
                        geometry: { type: 'LineString', coordinates: geometry },
                    }],
                }),
            });

            const result = await getRadarRoute({
                coordinates: [[51.5, -0.09], [51.5 + 90 * metre, -0.09]],
                mode: 'foot-walking',
            });

            const line = result.features[0].geometry as { coordinates: number[][] };
            expect(line.coordinates).toEqual([onStreet(0), onStreet(1), onStreet(2), onStreet(3)]);

            const cleanup = result.features[0].properties?.spurCleanup;
            expect(cleanup.spurs).toBe(1);
            expect(cleanup.removedMeters).toBeCloseTo(40, 0);
            expect(cleanup.longestMeters).toBeCloseTo(40, 0);

            // Radar's totals are kept, and the summary follows the geometry.
            expect(result.features[0].properties?.summary?.routedDistance).toBe(130);
            expect(result.features[0].properties?.summary?.distance)
                .toBeCloseTo(calculateRouteLength(result), 6);
        });

        it('leaves a spur-free route alone and attaches no cleanup diagnostics', async () => {
            vi.stubEnv('NEXT_PUBLIC_RADAR_LIVE_PK', 'test-api-key');

            const metre = 360 / (2 * Math.PI * 6371e3);
            const geometry = [0, 1, 2, 3].map(i => [-0.09, 51.5 + i * 30 * metre]);

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    routes: [{
                        distance: { value: 90 },
                        duration: { value: 80 },
                        geometry: { type: 'LineString', coordinates: geometry },
                    }],
                }),
            });

            const result = await getRadarRoute({
                coordinates: [[51.5, -0.09], [51.5 + 90 * metre, -0.09]],
                mode: 'foot-walking',
            });

            expect((result.features[0].geometry as { coordinates: number[][] }).coordinates)
                .toEqual(geometry);
            expect(result.features[0].properties?.spurCleanup).toBeUndefined();
        });

        it('should attach a per-leg summary for each waypoint pair', async () => {
            vi.stubEnv('NEXT_PUBLIC_RADAR_LIVE_PK', 'test-api-key');

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    routes: [{
                        distance: { value: 4000 },
                        duration: { value: 2400 },
                        geometry: {
                            type: 'LineString',
                            coordinates: [[-0.09, 51.5076], [-0.0946, 51.5088], [-0.0883, 51.5079]],
                        },
                        legs: [
                            {
                                distance: { value: 3305 },
                                // A ferry hop: two points 500 m apart.
                                geometry: {
                                    type: 'LineString',
                                    coordinates: [[-0.09, 51.5076], [-0.0946, 51.5088]],
                                },
                            },
                            {
                                distance: { value: 695 },
                                geometry: {
                                    type: 'LineString',
                                    coordinates: [[-0.0946, 51.5088], [-0.0930, 51.5084], [-0.0883, 51.5079]],
                                },
                            },
                        ],
                    }],
                }),
            });

            const result = await getRadarRoute({
                coordinates: [[51.5076, -0.09], [51.5088, -0.0946], [51.5079, -0.0883]],
                mode: 'foot-walking',
            });

            const legs = result.features[0].properties?.legs;
            expect(legs).toHaveLength(2);
            expect(legs[0]).toMatchObject({ index: 0, routedMeters: 3305, points: 2 });
            expect(legs[1]).toMatchObject({ index: 1, routedMeters: 695, points: 3 });

            // The first leg travels 3.3 km to cover a straight-line gap of
            // ~350 m, in a single edge no street could be.
            expect(legs[0].straightMeters).toBeGreaterThan(300);
            expect(legs[0].maxEdgeMeters).toBeGreaterThan(300);
            expect(legs[1].maxEdgeMeters).toBeLessThan(400);
        });

        describe('river repair without water data', () => {
            /** A Radar response whose legs follow the given [lng, lat] paths. */
            function radarResponse(legPaths: number[][][]) {
                return {
                    ok: true,
                    json: async () => ({
                        routes: [{
                            distance: { value: 1000 },
                            duration: { value: 600 },
                            geometry: { type: 'LineString', coordinates: legPaths.flat() },
                            legs: legPaths.map(coordinates => ({
                                distance: { value: 300 },
                                geometry: { type: 'LineString', coordinates },
                            })),
                        }],
                    }),
                };
            }

            // Zig-zag so simplification keeps every point. The middle leg is one
            // 570 m edge: the router took a ferry between w1 and w2.
            const waypoints: [number, number][] = [
                [51.5000, -0.1000],
                [51.5010, -0.0990],
                [51.5000, -0.0910],
                [51.5010, -0.0900],
            ];
            const ferryPass = radarResponse([
                [[-0.1000, 51.5000], [-0.0990, 51.5010]],
                [[-0.0990, 51.5010], [-0.0910, 51.5000]],
                [[-0.0910, 51.5000], [-0.0900, 51.5010]],
            ]);
            const overBridge = radarResponse([
                [[-0.1000, 51.5000], [-0.0975, 51.5002], [-0.0950, 51.5005], [-0.0925, 51.5007], [-0.0900, 51.5010]],
            ]);

            it('drops the waypoints beside the ferry edge and re-routes when the lookup fails', async () => {
                vi.stubEnv('NEXT_PUBLIC_RADAR_LIVE_PK', 'test-api-key');
                mockGetWaterAndBridges.mockResolvedValueOnce(null as never);
                mockFetch.mockResolvedValueOnce(ferryPass).mockResolvedValueOnce(overBridge);

                const result = await getRadarRoute({ coordinates: waypoints, mode: 'foot-walking' });

                expect(mockFetch).toHaveBeenCalledTimes(2);
                const rerouted = new URL(mockFetch.mock.calls[1][0]).searchParams.get('locations')!;
                expect(rerouted.split('|')).toHaveLength(2);
                expect(result.features[0].properties?.riverCrossing).toMatchObject({
                    fallback: 'no-osm-data',
                    waypointsDropped: 2,
                });
            });

            it("keeps Radar's route when dropping waypoints does not reduce ferry travel", async () => {
                vi.stubEnv('NEXT_PUBLIC_RADAR_LIVE_PK', 'test-api-key');
                mockGetWaterAndBridges.mockResolvedValueOnce(null as never);
                // The re-route still takes a 690 m ferry hop between the two waypoints left.
                mockFetch.mockResolvedValueOnce(ferryPass).mockResolvedValueOnce(
                    radarResponse([[[-0.1000, 51.5000], [-0.0900, 51.5010]]])
                );

                const result = await getRadarRoute({ coordinates: waypoints, mode: 'foot-walking' });

                expect(mockFetch).toHaveBeenCalledTimes(2);
                expect(result.features[0].properties?.riverCrossing).toBeUndefined();
                // The first pass's three legs, not the rejected re-route's one.
                expect(result.features[0].properties?.legs).toHaveLength(3);
            });

            it('keeps the first route when the fallback re-route comes back empty', async () => {
                vi.stubEnv('NEXT_PUBLIC_RADAR_LIVE_PK', 'test-api-key');
                mockGetWaterAndBridges.mockResolvedValueOnce(null as never);
                mockFetch.mockResolvedValueOnce(ferryPass).mockResolvedValueOnce({
                    ok: true,
                    json: async () => ({ routes: [] }),
                });

                const result = await getRadarRoute({ coordinates: waypoints, mode: 'foot-walking' });

                expect(result.features[0].properties?.riverCrossing).toBeUndefined();
                expect(result.features[0].properties?.legs).toHaveLength(3);
            });

            it('keeps the first route when the fallback re-route fails', async () => {
                vi.stubEnv('NEXT_PUBLIC_RADAR_LIVE_PK', 'test-api-key');
                mockGetWaterAndBridges.mockResolvedValueOnce(null as never);
                mockFetch.mockResolvedValueOnce(ferryPass).mockResolvedValueOnce({
                    ok: false,
                    status: 429,
                    statusText: 'Too Many Requests',
                    text: async () => 'slow down',
                });

                const result = await getRadarRoute({ coordinates: waypoints, mode: 'foot-walking' });

                expect(result.features[0].properties?.legs).toHaveLength(3);
            });

            it('does not cache a route built while the water lookup was failing', async () => {
                vi.stubEnv('NEXT_PUBLIC_RADAR_LIVE_PK', 'test-api-key');
                vi.stubEnv('KV_REST_API_URL', 'https://redis.example');
                vi.stubEnv('KV_REST_API_TOKEN', 'token');
                mockGetWaterAndBridges.mockResolvedValueOnce(null as never);
                mockFetch.mockResolvedValueOnce(ferryPass).mockResolvedValueOnce(overBridge);

                await getRadarRoute({ coordinates: waypoints, mode: 'foot-walking' });

                expect(mockRedisSet).not.toHaveBeenCalled();
            });

            it('still caches when the lookup succeeded', async () => {
                vi.stubEnv('NEXT_PUBLIC_RADAR_LIVE_PK', 'test-api-key');
                vi.stubEnv('KV_REST_API_URL', 'https://redis.example');
                vi.stubEnv('KV_REST_API_TOKEN', 'token');
                mockFetch.mockResolvedValueOnce(ferryPass);

                await getRadarRoute({ coordinates: waypoints, mode: 'foot-walking' });

                expect(mockRedisSet).toHaveBeenCalledTimes(1);
            });

            it('leaves the route alone when the lookup finds no water to bridge', async () => {
                vi.stubEnv('NEXT_PUBLIC_RADAR_LIVE_PK', 'test-api-key');
                mockFetch.mockResolvedValueOnce(ferryPass);

                const result = await getRadarRoute({ coordinates: waypoints, mode: 'foot-walking' });

                expect(mockFetch).toHaveBeenCalledTimes(1);
                expect(result.features[0].properties?.riverCrossing).toBeUndefined();
            });
        });

        it('should tolerate a Radar response with no legs', async () => {
            vi.stubEnv('NEXT_PUBLIC_RADAR_LIVE_PK', 'test-api-key');

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    routes: [{
                        distance: { value: 1000 },
                        duration: { value: 600 },
                        geometry: { type: 'LineString', coordinates: [[-0.1, 51.5], [-0.09, 51.51]] },
                    }],
                }),
            });

            const result = await getRadarRoute({
                coordinates: [[51.5, -0.1], [51.51, -0.09]],
                mode: 'foot-walking',
            });

            expect(result.features[0].properties?.legs).toEqual([]);
        });

        it('should throw error when Radar API returns error', async () => {
            vi.stubEnv('NEXT_PUBLIC_RADAR_LIVE_PK', 'test-api-key');

            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 401,
                statusText: 'Unauthorized',
                text: async () => 'Invalid API key',
            });

            await expect(getRadarRoute({
                coordinates: [[51.5, -0.1], [51.51, -0.09]],
                mode: 'cycling-regular',
            })).rejects.toThrow('Radar API Error: 401 Unauthorized');
        });

        it('should use correct mode mapping for foot-walking', async () => {
            vi.stubEnv('NEXT_PUBLIC_RADAR_LIVE_PK', 'test-api-key');

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    routes: [{
                        distance: { value: 1000 },
                        duration: { value: 600 },
                        geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] },
                    }],
                }),
            });

            await getRadarRoute({
                coordinates: [[51.5, -0.1], [51.51, -0.09]],
                mode: 'foot-walking',
            });

            // Check that the URL includes mode=foot
            const callUrl = mockFetch.mock.calls[0][0];
            expect(callUrl).toContain('mode=foot');
        });

        it('should use correct mode mapping for cycling-regular', async () => {
            vi.stubEnv('NEXT_PUBLIC_RADAR_LIVE_PK', 'test-api-key');

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    routes: [{
                        distance: { value: 1000 },
                        duration: { value: 300 },
                        geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] },
                    }],
                }),
            });

            await getRadarRoute({
                coordinates: [[51.5, -0.1], [51.51, -0.09]],
                mode: 'cycling-regular',
            });

            const callUrl = mockFetch.mock.calls[0][0];
            expect(callUrl).toContain('mode=bike');
        });

        it('should use correct mode mapping for driving-car', async () => {
            vi.stubEnv('NEXT_PUBLIC_RADAR_LIVE_PK', 'test-api-key');

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    routes: [{
                        distance: { value: 2000 },
                        duration: { value: 200 },
                        geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] },
                    }],
                }),
            });

            await getRadarRoute({
                coordinates: [[51.5, -0.1], [51.51, -0.09]],
                mode: 'driving-car',
            });

            const callUrl = mockFetch.mock.calls[0][0];
            expect(callUrl).toContain('mode=car');
        });

        it('should return fallback when no routes returned', async () => {
            vi.stubEnv('NEXT_PUBLIC_RADAR_LIVE_PK', 'test-api-key');

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ routes: [] }),
            });

            const result = await getRadarRoute({
                coordinates: [[51.5, -0.1], [51.51, -0.09]],
                mode: 'foot-walking',
            });

            // Should return fallback straight line
            expect(result.type).toBe('FeatureCollection');
            expect(result.features).toHaveLength(1);
        });
    });

    describe('getRadarAutocomplete', () => {
        it('should return empty addresses for empty query', async () => {
            const result = await getRadarAutocomplete('');
            expect(result.addresses).toEqual([]);
        });

        it('should return empty addresses for whitespace-only query', async () => {
            const result = await getRadarAutocomplete('   ');
            expect(result.addresses).toEqual([]);
        });

        it('should return empty addresses when no API key configured', async () => {
            const result = await getRadarAutocomplete('London');
            expect(result.addresses).toEqual([]);
        });

        it('should call Radar autocomplete API when key is configured', async () => {
            vi.stubEnv('NEXT_PUBLIC_RADAR_LIVE_PK', 'test-api-key');

            const mockAddresses = [
                { latitude: 51.5, longitude: -0.1, formattedAddress: 'London, UK' },
                { latitude: 51.51, longitude: -0.12, formattedAddress: 'London Bridge' },
            ];

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ addresses: mockAddresses }),
            });

            const result = await getRadarAutocomplete('London');

            expect(mockFetch).toHaveBeenCalled();
            expect(result.addresses).toEqual(mockAddresses);
        });

        it('should return empty addresses on API error', async () => {
            vi.stubEnv('NEXT_PUBLIC_RADAR_LIVE_PK', 'test-api-key');

            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 500,
                statusText: 'Internal Server Error',
                text: async () => 'Server error',
            });

            const result = await getRadarAutocomplete('London');

            expect(result.addresses).toEqual([]);
        });

        it('should return empty addresses on fetch error', async () => {
            vi.stubEnv('NEXT_PUBLIC_RADAR_LIVE_PK', 'test-api-key');

            mockFetch.mockRejectedValueOnce(new Error('Network error'));

            const result = await getRadarAutocomplete('London');

            expect(result.addresses).toEqual([]);
        });

        it('should handle null query', async () => {
            // @ts-expect-error - testing null input
            const result = await getRadarAutocomplete(null);
            expect(result.addresses).toEqual([]);
        });

        it('should handle undefined query', async () => {
            // @ts-expect-error - testing undefined input
            const result = await getRadarAutocomplete(undefined);
            expect(result.addresses).toEqual([]);
        });
    });
});
