import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { hashCoordinates, getRadarRoute, getRadarAutocomplete } from '../../src/lib/radarService';

// Mock the Redis module
vi.mock('@upstash/redis', () => ({
    Redis: vi.fn().mockImplementation(() => ({
        get: vi.fn(),
        set: vi.fn(),
    })),
}));

// Mock Sentry
vi.mock('@sentry/nextjs', () => ({
    captureException: vi.fn(),
    captureMessage: vi.fn(),
}));

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
            expect(result.features[0].properties?.summary?.distance).toBe(1000);
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
