import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { POST } from '../../src/app/api/strava/upload/route';
import { NextRequest } from 'next/server';
import { FeatureCollection, LineString } from 'geojson';

// Mock the strava service
vi.mock('../../src/lib/stravaService', () => ({
    refreshTokens: vi.fn(),
    mapModeToStravaType: vi.fn().mockReturnValue({ type: 2, sub_type: 1 }),
}));

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

import { refreshTokens, mapModeToStravaType } from '../../src/lib/stravaService';

describe('/api/strava/upload', () => {
    const mockRefreshTokens = vi.mocked(refreshTokens);
    const mockMapModeToStravaType = vi.mocked(mapModeToStravaType);

    const validRouteData: FeatureCollection<LineString> = {
        type: 'FeatureCollection',
        features: [
            {
                type: 'Feature',
                properties: {},
                geometry: {
                    type: 'LineString',
                    coordinates: [
                        [-0.1, 51.5],
                        [-0.09, 51.51],
                        [-0.08, 51.52],
                    ],
                },
            },
        ],
    };

    const validTokens = {
        access_token: 'valid-access-token',
        refresh_token: 'valid-refresh-token',
        expires_at: Math.floor(Date.now() / 1000) + 3600, // Valid for 1 hour
    };

    const expiredTokens = {
        access_token: 'expired-access-token',
        refresh_token: 'refresh-token',
        expires_at: Math.floor(Date.now() / 1000) - 100, // Already expired
    };

    beforeEach(() => {
        vi.clearAllMocks();
        // Set up environment variables
        vi.stubEnv('STRAVA_CLIENT_ID', 'test-client-id');
        vi.stubEnv('STRAVA_CLIENT_SECRET', 'test-client-secret');
        // Reset mock implementations
        mockMapModeToStravaType.mockReturnValue({ type: 2, sub_type: 1 });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    /**
     * Helper to create a NextRequest with JSON body
     */
    function createRequest(body: object): NextRequest {
        return new NextRequest('http://localhost/api/strava/upload', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });
    }

    describe('Success cases', () => {
        it('should return 200 with route ID when upload succeeds', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    id: 12345,
                    name: 'Test Route',
                }),
            });

            const request = createRequest({
                routeData: validRouteData,
                tokens: validTokens,
                mode: 'foot-walking',
                name: 'My Route',
                description: 'A test route',
            });

            const response = await POST(request);

            expect(response.status).toBe(200);
            const data = await response.json();
            expect(data.success).toBe(true);
            expect(data.routeId).toBe(12345);
            expect(data.routeUrl).toBe('https://www.strava.com/routes/12345');
        });

        it('should call Strava API with correct parameters', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ id: 12345 }),
            });

            const request = createRequest({
                routeData: validRouteData,
                tokens: validTokens,
                mode: 'cycling-regular',
                name: 'Cycling Route',
                description: 'A cycling route',
            });

            await POST(request);

            expect(mockFetch).toHaveBeenCalledWith(
                'https://www.strava.com/api/v3/routes',
                expect.objectContaining({
                    method: 'POST',
                    headers: expect.objectContaining({
                        'Authorization': 'Bearer valid-access-token',
                        'Content-Type': 'application/json',
                    }),
                })
            );
        });

        it('should use default name when not provided', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ id: 12345 }),
            });

            const request = createRequest({
                routeData: validRouteData,
                tokens: validTokens,
                mode: 'foot-walking',
            });

            await POST(request);

            const fetchCall = mockFetch.mock.calls[0];
            const body = JSON.parse(fetchCall[1].body);
            expect(body.name).toContain('Routista Route');
        });

        it('should use default description when not provided', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ id: 12345 }),
            });

            const request = createRequest({
                routeData: validRouteData,
                tokens: validTokens,
                mode: 'foot-walking',
            });

            await POST(request);

            const fetchCall = mockFetch.mock.calls[0];
            const body = JSON.parse(fetchCall[1].body);
            expect(body.description).toBe('Generated with Routista (routista.eu)');
        });

        it('should map mode to Strava type correctly', async () => {
            mockMapModeToStravaType.mockReturnValue({ type: 1, sub_type: 2 });
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ id: 12345 }),
            });

            const request = createRequest({
                routeData: validRouteData,
                tokens: validTokens,
                mode: 'cycling-regular',
            });

            await POST(request);

            expect(mockMapModeToStravaType).toHaveBeenCalledWith('cycling-regular');
            const fetchCall = mockFetch.mock.calls[0];
            const body = JSON.parse(fetchCall[1].body);
            expect(body.type).toBe(1);
            expect(body.sub_type).toBe(2);
        });
    });

    describe('Token refresh', () => {
        it('should refresh tokens when expired and return new tokens', async () => {
            const newTokens = {
                access_token: 'new-access-token',
                refresh_token: 'new-refresh-token',
                expires_at: Math.floor(Date.now() / 1000) + 3600,
            };

            mockRefreshTokens.mockResolvedValueOnce(newTokens);
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ id: 12345 }),
            });

            const request = createRequest({
                routeData: validRouteData,
                tokens: expiredTokens,
                mode: 'foot-walking',
            });

            const response = await POST(request);

            expect(response.status).toBe(200);
            const data = await response.json();
            expect(data.tokens).toEqual(newTokens);
            expect(mockRefreshTokens).toHaveBeenCalledWith(
                'refresh-token',
                'test-client-id',
                'test-client-secret'
            );
        });

        it('should use refreshed token for API call', async () => {
            const newTokens = {
                access_token: 'refreshed-token',
                refresh_token: 'new-refresh-token',
                expires_at: Math.floor(Date.now() / 1000) + 3600,
            };

            mockRefreshTokens.mockResolvedValueOnce(newTokens);
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ id: 12345 }),
            });

            const request = createRequest({
                routeData: validRouteData,
                tokens: expiredTokens,
                mode: 'foot-walking',
            });

            await POST(request);

            const fetchCall = mockFetch.mock.calls[0];
            expect(fetchCall[1].headers['Authorization']).toBe('Bearer refreshed-token');
        });

        it('should not return tokens when they were not refreshed', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ id: 12345 }),
            });

            const request = createRequest({
                routeData: validRouteData,
                tokens: validTokens,
                mode: 'foot-walking',
            });

            const response = await POST(request);

            const data = await response.json();
            expect(data.tokens).toBeUndefined();
        });

        it('should return 401 when token refresh fails', async () => {
            mockRefreshTokens.mockRejectedValueOnce(new Error('Refresh failed'));

            const request = createRequest({
                routeData: validRouteData,
                tokens: expiredTokens,
                mode: 'foot-walking',
            });

            const response = await POST(request);

            expect(response.status).toBe(401);
            const data = await response.json();
            expect(data.error).toContain('Token refresh failed');
            expect(data.needsReauth).toBe(true);
        });

        it('should return 500 when environment credentials are missing for refresh', async () => {
            vi.stubEnv('STRAVA_CLIENT_ID', '');

            const request = createRequest({
                routeData: validRouteData,
                tokens: expiredTokens,
                mode: 'foot-walking',
            });

            const response = await POST(request);

            expect(response.status).toBe(500);
            const data = await response.json();
            expect(data.error).toBe('Server configuration error');
        });
    });

    describe('Validation errors (400)', () => {
        it('should return 400 for invalid JSON body', async () => {
            const request = new NextRequest('http://localhost/api/strava/upload', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: 'not valid json',
            });

            const response = await POST(request);

            expect(response.status).toBe(400);
            const data = await response.json();
            expect(data.error).toBe('Invalid request body');
        });

        it('should return 400 when routeData is missing', async () => {
            const request = createRequest({
                tokens: validTokens,
                mode: 'foot-walking',
            });

            const response = await POST(request);

            expect(response.status).toBe(400);
            const data = await response.json();
            expect(data.error).toBe('Missing required fields: routeData, tokens, mode');
        });

        it('should return 400 when tokens are missing', async () => {
            const request = createRequest({
                routeData: validRouteData,
                mode: 'foot-walking',
            });

            const response = await POST(request);

            expect(response.status).toBe(400);
            const data = await response.json();
            expect(data.error).toBe('Missing required fields: routeData, tokens, mode');
        });

        it('should return 400 when mode is missing', async () => {
            const request = createRequest({
                routeData: validRouteData,
                tokens: validTokens,
            });

            const response = await POST(request);

            expect(response.status).toBe(400);
            const data = await response.json();
            expect(data.error).toBe('Missing required fields: routeData, tokens, mode');
        });

        it('should return 400 when access_token is missing', async () => {
            const request = createRequest({
                routeData: validRouteData,
                tokens: { refresh_token: 'token', expires_at: 12345 },
                mode: 'foot-walking',
            });

            const response = await POST(request);

            expect(response.status).toBe(400);
            const data = await response.json();
            expect(data.error).toBe('Invalid tokens');
        });

        it('should return 400 when refresh_token is missing', async () => {
            const request = createRequest({
                routeData: validRouteData,
                tokens: { access_token: 'token', expires_at: 12345 },
                mode: 'foot-walking',
            });

            const response = await POST(request);

            expect(response.status).toBe(400);
            const data = await response.json();
            expect(data.error).toBe('Invalid tokens');
        });

        it('should return 400 when route has fewer than 2 points', async () => {
            const singlePointRoute: FeatureCollection<LineString> = {
                type: 'FeatureCollection',
                features: [
                    {
                        type: 'Feature',
                        properties: {},
                        geometry: {
                            type: 'LineString',
                            coordinates: [[-0.1, 51.5]],
                        },
                    },
                ],
            };

            const request = createRequest({
                routeData: singlePointRoute,
                tokens: validTokens,
                mode: 'foot-walking',
            });

            const response = await POST(request);

            expect(response.status).toBe(400);
            const data = await response.json();
            expect(data.error).toBe('Route must have at least 2 points');
        });

        it('should return 400 when route has no features', async () => {
            const emptyRoute: FeatureCollection = {
                type: 'FeatureCollection',
                features: [],
            };

            const request = createRequest({
                routeData: emptyRoute,
                tokens: validTokens,
                mode: 'foot-walking',
            });

            const response = await POST(request);

            expect(response.status).toBe(400);
            const data = await response.json();
            expect(data.error).toBe('Route must have at least 2 points');
        });
    });

    describe('Strava API error handling', () => {
        it('should return 500 when Strava API returns error', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 500,
                text: async () => 'Internal Server Error',
            });

            const request = createRequest({
                routeData: validRouteData,
                tokens: validTokens,
                mode: 'foot-walking',
            });

            const response = await POST(request);

            expect(response.status).toBe(500);
            const data = await response.json();
            expect(data.error).toContain('Strava API error');
        });

        it('should return 401 when Strava API returns 401', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 401,
                text: async () => 'Unauthorized',
            });

            const request = createRequest({
                routeData: validRouteData,
                tokens: validTokens,
                mode: 'foot-walking',
            });

            const response = await POST(request);

            expect(response.status).toBe(401);
            const data = await response.json();
            expect(data.needsReauth).toBe(true);
        });

        it('should return 401 for Authorization Error message', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 403,
                text: async () => 'Authorization Error: invalid token',
            });

            const request = createRequest({
                routeData: validRouteData,
                tokens: validTokens,
                mode: 'foot-walking',
            });

            const response = await POST(request);

            expect(response.status).toBe(401);
            const data = await response.json();
            expect(data.needsReauth).toBe(true);
        });
    });

    describe('Coordinate extraction and simplification', () => {
        it('should extract coordinates from multiple LineString features', async () => {
            const multiFeatureRoute: FeatureCollection<LineString> = {
                type: 'FeatureCollection',
                features: [
                    {
                        type: 'Feature',
                        properties: {},
                        geometry: {
                            type: 'LineString',
                            coordinates: [[-0.1, 51.5], [-0.09, 51.51]],
                        },
                    },
                    {
                        type: 'Feature',
                        properties: {},
                        geometry: {
                            type: 'LineString',
                            coordinates: [[-0.08, 51.52], [-0.07, 51.53]],
                        },
                    },
                ],
            };

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ id: 12345 }),
            });

            const request = createRequest({
                routeData: multiFeatureRoute,
                tokens: validTokens,
                mode: 'foot-walking',
            });

            const response = await POST(request);

            expect(response.status).toBe(200);
            // Verify waypoints are extracted correctly
            const fetchCall = mockFetch.mock.calls[0];
            const body = JSON.parse(fetchCall[1].body);
            expect(body.waypoints).toHaveLength(4);
        });

        it('should simplify coordinates when more than 25 waypoints', async () => {
            // Create route with 30 points
            const manyPointsRoute: FeatureCollection<LineString> = {
                type: 'FeatureCollection',
                features: [
                    {
                        type: 'Feature',
                        properties: {},
                        geometry: {
                            type: 'LineString',
                            coordinates: Array.from({ length: 30 }, (_, i) => [
                                -0.1 + i * 0.001,
                                51.5 + i * 0.001,
                            ]),
                        },
                    },
                ],
            };

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ id: 12345 }),
            });

            const request = createRequest({
                routeData: manyPointsRoute,
                tokens: validTokens,
                mode: 'foot-walking',
            });

            await POST(request);

            const fetchCall = mockFetch.mock.calls[0];
            const body = JSON.parse(fetchCall[1].body);
            // Should be simplified to 25 waypoints
            expect(body.waypoints.length).toBeLessThanOrEqual(25);
        });

        it('should convert coordinates to lat/lng format for Strava', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ id: 12345 }),
            });

            const request = createRequest({
                routeData: validRouteData,
                tokens: validTokens,
                mode: 'foot-walking',
            });

            await POST(request);

            const fetchCall = mockFetch.mock.calls[0];
            const body = JSON.parse(fetchCall[1].body);
            // GeoJSON is [lng, lat], Strava wants { lat, lng }
            expect(body.waypoints[0]).toEqual({ lat: 51.5, lng: -0.1 });
        });
    });

    describe('Edge cases', () => {
        it('should handle route with exactly 2 points', async () => {
            const twoPointRoute: FeatureCollection<LineString> = {
                type: 'FeatureCollection',
                features: [
                    {
                        type: 'Feature',
                        properties: {},
                        geometry: {
                            type: 'LineString',
                            coordinates: [[-0.1, 51.5], [-0.09, 51.51]],
                        },
                    },
                ],
            };

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ id: 12345 }),
            });

            const request = createRequest({
                routeData: twoPointRoute,
                tokens: validTokens,
                mode: 'foot-walking',
            });

            const response = await POST(request);

            expect(response.status).toBe(200);
        });

        it('should handle tokens about to expire (within 60 seconds)', async () => {
            const aboutToExpireTokens = {
                access_token: 'expiring-access-token',
                refresh_token: 'refresh-token',
                expires_at: Math.floor(Date.now() / 1000) + 30, // Expires in 30 seconds
            };

            const newTokens = {
                access_token: 'new-token',
                refresh_token: 'new-refresh',
                expires_at: Math.floor(Date.now() / 1000) + 3600,
            };

            mockRefreshTokens.mockResolvedValueOnce(newTokens);
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ id: 12345 }),
            });

            const request = createRequest({
                routeData: validRouteData,
                tokens: aboutToExpireTokens,
                mode: 'foot-walking',
            });

            const response = await POST(request);

            expect(response.status).toBe(200);
            expect(mockRefreshTokens).toHaveBeenCalled();
        });

        it('should handle custom name with special characters', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ id: 12345 }),
            });

            const request = createRequest({
                routeData: validRouteData,
                tokens: validTokens,
                mode: 'foot-walking',
                name: 'My Route with "quotes" & <special> chars',
            });

            await POST(request);

            const fetchCall = mockFetch.mock.calls[0];
            const body = JSON.parse(fetchCall[1].body);
            expect(body.name).toBe('My Route with "quotes" & <special> chars');
        });
    });
});

