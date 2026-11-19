import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateRoute, RouteGenerationOptions } from '../../src/lib/routeGenerator';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('routeGenerator', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('generateRoute', () => {
        it('should throw error when coordinates is null', async () => {
            await expect(generateRoute({
                // @ts-expect-error - testing null input
                coordinates: null,
                mode: 'foot-walking',
            })).rejects.toThrow('At least 2 coordinates are required');
        });

        it('should throw error when coordinates is undefined', async () => {
            await expect(generateRoute({
                // @ts-expect-error - testing undefined input
                coordinates: undefined,
                mode: 'foot-walking',
            })).rejects.toThrow('At least 2 coordinates are required');
        });

        it('should throw error when coordinates has fewer than 2 points', async () => {
            await expect(generateRoute({
                coordinates: [[51.5, -0.1]],
                mode: 'foot-walking',
            })).rejects.toThrow('At least 2 coordinates are required');
        });

        it('should throw error when coordinates is empty', async () => {
            await expect(generateRoute({
                coordinates: [],
                mode: 'foot-walking',
            })).rejects.toThrow('At least 2 coordinates are required');
        });

        it('should call fetch with correct endpoint and body', async () => {
            const mockGeoJson = {
                type: 'FeatureCollection',
                features: [{
                    type: 'Feature',
                    properties: { summary: { distance: 1000, duration: 600 } },
                    geometry: { type: 'LineString', coordinates: [[-0.1, 51.5], [-0.09, 51.51]] },
                }],
            };

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockGeoJson,
            });

            const options: RouteGenerationOptions = {
                coordinates: [[51.5, -0.1], [51.51, -0.09]],
                mode: 'foot-walking',
            };

            const result = await generateRoute(options);

            expect(mockFetch).toHaveBeenCalledWith('/api/radar/directions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/x-ndjson, application/json',
                },
                body: JSON.stringify({
                    coordinates: options.coordinates,
                    mode: options.mode,
                }),
            });

            expect(result).toEqual(mockGeoJson);
        });

        it('should return GeoJSON FeatureCollection on success', async () => {
            const mockGeoJson = {
                type: 'FeatureCollection',
                features: [{
                    type: 'Feature',
                    properties: { summary: { distance: 2500, duration: 900 } },
                    geometry: {
                        type: 'LineString',
                        coordinates: [[-0.1, 51.5], [-0.095, 51.505], [-0.09, 51.51]],
                    },
                }],
            };

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockGeoJson,
            });

            const result = await generateRoute({
                coordinates: [[51.5, -0.1], [51.51, -0.09]],
                mode: 'cycling-regular',
            });

            expect(result.type).toBe('FeatureCollection');
            expect(result.features).toHaveLength(1);
            expect(result.features[0].geometry.type).toBe('LineString');
        });

        it('should throw error with message from API error response', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                statusText: 'Bad Request',
                json: async () => ({ error: 'Invalid coordinates format' }),
            });

            await expect(generateRoute({
                coordinates: [[51.5, -0.1], [51.51, -0.09]],
                mode: 'foot-walking',
            })).rejects.toThrow('Invalid coordinates format');
        });

        it('should throw error with status text when no error message in response', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                statusText: 'Internal Server Error',
                json: async () => ({}),
            });

            await expect(generateRoute({
                coordinates: [[51.5, -0.1], [51.51, -0.09]],
                mode: 'foot-walking',
            })).rejects.toThrow('Failed to generate route: Internal Server Error');
        });

        it('should work with different transport modes', async () => {
            const mockGeoJson = {
                type: 'FeatureCollection',
                features: [{
                    type: 'Feature',
                    properties: {},
                    geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] },
                }],
            };

            // Test foot-walking
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockGeoJson,
            });

            await generateRoute({
                coordinates: [[51.5, -0.1], [51.51, -0.09]],
                mode: 'foot-walking',
            });

            let body = JSON.parse(mockFetch.mock.calls[0][1].body);
            expect(body.mode).toBe('foot-walking');

            // Test cycling-regular
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockGeoJson,
            });

            await generateRoute({
                coordinates: [[51.5, -0.1], [51.51, -0.09]],
                mode: 'cycling-regular',
            });

            body = JSON.parse(mockFetch.mock.calls[1][1].body);
            expect(body.mode).toBe('cycling-regular');

            // Test driving-car
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockGeoJson,
            });

            await generateRoute({
                coordinates: [[51.5, -0.1], [51.51, -0.09]],
                mode: 'driving-car',
            });

            body = JSON.parse(mockFetch.mock.calls[2][1].body);
            expect(body.mode).toBe('driving-car');
        });

        it('should handle many coordinates', async () => {
            const manyCoords: [number, number][] = Array.from({ length: 100 }, (_, i) => [
                51.5 + i * 0.001,
                -0.1 + i * 0.001,
            ]);

            const mockGeoJson = {
                type: 'FeatureCollection',
                features: [{
                    type: 'Feature',
                    properties: {},
                    geometry: { type: 'LineString', coordinates: manyCoords.map(([lat, lng]) => [lng, lat]) },
                }],
            };

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockGeoJson,
            });

            const result = await generateRoute({
                coordinates: manyCoords,
                mode: 'foot-walking',
            });

            expect(result.type).toBe('FeatureCollection');
            
            // Verify all coordinates were sent
            const body = JSON.parse(mockFetch.mock.calls[0][1].body);
            expect(body.coordinates).toHaveLength(100);
        });

        it('should propagate network errors', async () => {
            mockFetch.mockRejectedValueOnce(new Error('Network error'));

            await expect(generateRoute({
                coordinates: [[51.5, -0.1], [51.51, -0.09]],
                mode: 'foot-walking',
            })).rejects.toThrow('Network error');
        });
    });

    describe('generateRoute with a streamed response', () => {
        const route = {
            type: 'FeatureCollection',
            features: [{
                type: 'Feature',
                properties: {},
                geometry: { type: 'LineString', coordinates: [[-0.1, 51.5], [-0.09, 51.51]] },
            }],
        };
        const options: RouteGenerationOptions = {
            coordinates: [[51.5, -0.1], [51.51, -0.09]],
            mode: 'foot-walking',
        };

        /** A 200 NDJSON response whose body yields each string as a chunk. */
        function ndjsonResponse(chunks: string[]) {
            const encoder = new TextEncoder();
            return {
                ok: true,
                headers: new Headers({ 'Content-Type': 'application/x-ndjson; charset=utf-8' }),
                body: new ReadableStream({
                    start(controller) {
                        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
                        controller.close();
                    },
                }),
                json: async () => { throw new Error('json() must not be used for a stream'); },
            };
        }

        it('forwards progress and resolves with the result', async () => {
            const result = JSON.stringify({ type: 'result', data: route });
            mockFetch.mockResolvedValueOnce(ndjsonResponse([
                '{"type":"progress","stage":"river-check"}\n',
                '{"type":"progress","stage":"river-check-done"}\n',
                result.slice(0, 20),
                `${result.slice(20)}\n`,
            ]));
            const onProgress = vi.fn();

            await expect(generateRoute(options, onProgress)).resolves.toEqual(route);
            expect(onProgress.mock.calls).toEqual([['river-check'], ['river-check-done']]);
        });

        it('works without a progress callback', async () => {
            mockFetch.mockResolvedValueOnce(ndjsonResponse([
                '{"type":"progress","stage":"river-check"}\n',
                `${JSON.stringify({ type: 'result', data: route })}\n`,
            ]));

            await expect(generateRoute(options)).resolves.toEqual(route);
        });

        it('throws the message of an error line', async () => {
            mockFetch.mockResolvedValueOnce(ndjsonResponse([
                '{"type":"error","error":"Radar API Error: 400 Bad Request - Route not found"}\n',
            ]));

            await expect(generateRoute(options)).rejects.toThrow('Route not found');
        });

        it('falls back to a generic message for an empty error', async () => {
            mockFetch.mockResolvedValueOnce(ndjsonResponse(['{"type":"error","error":""}\n']));

            await expect(generateRoute(options)).rejects.toThrow('Failed to generate route');
        });

        it('throws when the stream ends without a result', async () => {
            mockFetch.mockResolvedValueOnce(ndjsonResponse(['{"type":"progress","stage":"river-check"}\n']));

            await expect(generateRoute(options)).rejects.toThrow('incomplete response');
        });
    });
});
