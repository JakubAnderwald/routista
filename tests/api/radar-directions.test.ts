import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { POST } from '../../src/app/api/radar/directions/route';
import { NextRequest } from 'next/server';

// Mock the radar service
vi.mock('../../src/lib/radarService', () => ({
    getRadarRoute: vi.fn(),
}));

// Rate limiting has its own tests (tests/unit/apiRateLimit.test.ts); keep these off Redis.
const mockWithRateLimit = vi.hoisted(() =>
    vi.fn((_request: Request, handler: () => Promise<Response>) => handler())
);

vi.mock('../../src/lib/apiRateLimit', () => ({
    withRateLimit: mockWithRateLimit,
}));

// Mock Sentry
vi.mock('@sentry/nextjs', () => ({
    captureException: vi.fn(),
}));

import { getRadarRoute } from '../../src/lib/radarService';
import * as Sentry from '@sentry/nextjs';

describe('/api/radar/directions', () => {
    const mockGetRadarRoute = vi.mocked(getRadarRoute);

    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    /**
     * Helper to create a NextRequest with JSON body
     */
    function createRequest(body: object): NextRequest {
        return new NextRequest('http://localhost/api/radar/directions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });
    }

    describe('Success cases', () => {
        it('should return 200 with valid route data', async () => {
            const mockRoute = {
                type: 'FeatureCollection' as const,
                features: [
                    {
                        type: 'Feature' as const,
                        properties: {
                            summary: {
                                distance: 1000,
                                duration: 600,
                            },
                        },
                        geometry: {
                            type: 'LineString' as const,
                            coordinates: [[-0.1, 51.5], [-0.09, 51.51]],
                        },
                    },
                ],
            };

            mockGetRadarRoute.mockResolvedValueOnce(mockRoute);

            const request = createRequest({
                coordinates: [[51.5, -0.1], [51.51, -0.09]],
                mode: 'foot-walking',
            });

            const response = await POST(request);

            expect(mockWithRateLimit).toHaveBeenCalledWith(request, expect.any(Function));

            expect(response.status).toBe(200);
            const data = await response.json();
            expect(data.type).toBe('FeatureCollection');
            expect(data.features).toHaveLength(1);
            expect(data.features[0].properties.summary.distance).toBe(1000);
        });

        it('should pass coordinates and mode to getRadarRoute', async () => {
            const mockRoute = {
                type: 'FeatureCollection' as const,
                features: [],
            };

            mockGetRadarRoute.mockResolvedValueOnce(mockRoute);

            const request = createRequest({
                coordinates: [[51.5, -0.1], [51.51, -0.09], [51.52, -0.08]],
                mode: 'cycling-regular',
            });

            await POST(request);

            expect(mockGetRadarRoute).toHaveBeenCalledWith({
                coordinates: [[51.5, -0.1], [51.51, -0.09], [51.52, -0.08]],
                mode: 'cycling-regular',
            });
        });

        it('should handle driving-car mode', async () => {
            const mockRoute = {
                type: 'FeatureCollection' as const,
                features: [],
            };

            mockGetRadarRoute.mockResolvedValueOnce(mockRoute);

            const request = createRequest({
                coordinates: [[51.5, -0.1], [51.51, -0.09]],
                mode: 'driving-car',
            });

            const response = await POST(request);

            expect(response.status).toBe(200);
            expect(mockGetRadarRoute).toHaveBeenCalledWith({
                coordinates: [[51.5, -0.1], [51.51, -0.09]],
                mode: 'driving-car',
            });
        });
    });

    describe('Error handling', () => {
        it('should return 500 when getRadarRoute throws an error', async () => {
            mockGetRadarRoute.mockRejectedValueOnce(new Error('Radar API Error: 401 Unauthorized'));

            const request = createRequest({
                coordinates: [[51.5, -0.1], [51.51, -0.09]],
                mode: 'foot-walking',
            });

            const response = await POST(request);

            expect(response.status).toBe(500);
            const data = await response.json();
            expect(data.error).toBe('Radar API Error: 401 Unauthorized');
        });

        it('should return 500 with generic message for non-Error exceptions', async () => {
            mockGetRadarRoute.mockRejectedValueOnce('string error');

            const request = createRequest({
                coordinates: [[51.5, -0.1], [51.51, -0.09]],
                mode: 'foot-walking',
            });

            const response = await POST(request);

            expect(response.status).toBe(500);
            const data = await response.json();
            expect(data.error).toBe('Internal Server Error');
        });

        it('should capture exception in Sentry on error', async () => {
            const error = new Error('Test error');
            mockGetRadarRoute.mockRejectedValueOnce(error);

            const request = createRequest({
                coordinates: [[51.5, -0.1], [51.51, -0.09]],
                mode: 'foot-walking',
            });

            await POST(request);

            expect(Sentry.captureException).toHaveBeenCalledWith(
                error,
                expect.objectContaining({
                    extra: expect.objectContaining({
                        endpoint: '/api/radar/directions',
                        coordinatesCount: 2,
                    }),
                })
            );
        });

    });

    // Malformed requests are the client's mistake: 400, no Radar call, nothing in Sentry.
    describe('Bad requests (400)', () => {
        function rawRequest(body: string): NextRequest {
            return new NextRequest('http://localhost/api/radar/directions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body,
            });
        }

        it('should return 400 when the body is not valid JSON', async () => {
            const response = await POST(rawRequest('not valid json'));

            expect(response.status).toBe(400);
            expect(await response.json()).toEqual({ error: 'Request body must be valid JSON' });
            expect(mockGetRadarRoute).not.toHaveBeenCalled();
            expect(Sentry.captureException).not.toHaveBeenCalled();
        });

        it.each(['null', '[]', '"text"', '42'])('should return 400 when the body is JSON %s', async (body) => {
            const response = await POST(rawRequest(body));

            expect(response.status).toBe(400);
            expect(await response.json()).toEqual({ error: 'Request body must be a JSON object' });
            expect(mockGetRadarRoute).not.toHaveBeenCalled();
            expect(Sentry.captureException).not.toHaveBeenCalled();
        });

        it.each([
            ['missing', undefined],
            ['empty', []],
            ['a single point', [[51.5, -0.1]]],
            ['not an array', 'Berlin'],
            ['points that are not arrays', [{ lat: 51.5 }, { lat: 51.51 }]],
            ['non-numeric points', [['51.5', '-0.1'], ['51.51', '-0.09']]],
            ['points with one number', [[51.5], [51.51]]],
        ])('should return 400 when coordinates are %s', async (_label, coordinates) => {
            const response = await POST(createRequest({ coordinates, mode: 'foot-walking' }));

            expect(response.status).toBe(400);
            expect((await response.json()).error).toMatch(/coordinates/);
            expect(mockGetRadarRoute).not.toHaveBeenCalled();
            expect(Sentry.captureException).not.toHaveBeenCalled();
        });
    });

    describe('Edge cases', () => {
        it('should handle request with extra fields in body', async () => {
            const mockRoute = {
                type: 'FeatureCollection' as const,
                features: [],
            };

            mockGetRadarRoute.mockResolvedValueOnce(mockRoute);

            const request = createRequest({
                coordinates: [[51.5, -0.1], [51.51, -0.09]],
                mode: 'foot-walking',
                extraField: 'should be ignored',
            });

            const response = await POST(request);

            expect(response.status).toBe(200);
            expect(mockGetRadarRoute).toHaveBeenCalledWith({
                coordinates: [[51.5, -0.1], [51.51, -0.09]],
                mode: 'foot-walking',
            });
        });

        it('should handle large coordinate arrays', async () => {
            // Generate 100 coordinates
            const coordinates = Array.from({ length: 100 }, (_, i) => [
                51.5 + i * 0.001,
                -0.1 + i * 0.001,
            ]);

            const mockRoute = {
                type: 'FeatureCollection' as const,
                features: [
                    {
                        type: 'Feature' as const,
                        properties: { summary: { distance: 5000, duration: 3000 } },
                        geometry: { type: 'LineString' as const, coordinates: [] },
                    },
                ],
            };

            mockGetRadarRoute.mockResolvedValueOnce(mockRoute);

            const request = createRequest({
                coordinates,
                mode: 'foot-walking',
            });

            const response = await POST(request);

            expect(response.status).toBe(200);
            expect(mockGetRadarRoute).toHaveBeenCalledWith({
                coordinates,
                mode: 'foot-walking',
            });
        });

        it('should handle mode with empty string', async () => {
            const mockRoute = {
                type: 'FeatureCollection' as const,
                features: [],
            };

            mockGetRadarRoute.mockResolvedValueOnce(mockRoute);

            const request = createRequest({
                coordinates: [[51.5, -0.1], [51.51, -0.09]],
                mode: '',
            });

            const response = await POST(request);

            expect(response.status).toBe(200);
            expect(mockGetRadarRoute).toHaveBeenCalledWith({
                coordinates: [[51.5, -0.1], [51.51, -0.09]],
                mode: '',
            });
        });
    });
});

