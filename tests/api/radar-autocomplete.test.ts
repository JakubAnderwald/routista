import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { POST } from '../../src/app/api/radar/autocomplete/route';
import { NextRequest } from 'next/server';

// Mock the radar service
vi.mock('../../src/lib/radarService', () => ({
    getRadarAutocomplete: vi.fn(),
}));

// Mock Sentry
vi.mock('@sentry/nextjs', () => ({
    captureException: vi.fn(),
}));

import { getRadarAutocomplete } from '../../src/lib/radarService';
import * as Sentry from '@sentry/nextjs';

describe('/api/radar/autocomplete', () => {
    const mockGetRadarAutocomplete = vi.mocked(getRadarAutocomplete);

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
        return new NextRequest('http://localhost/api/radar/autocomplete', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });
    }

    describe('Success cases', () => {
        it('should return 200 with address suggestions', async () => {
            const mockAddresses = {
                addresses: [
                    { latitude: 51.5, longitude: -0.1, formattedAddress: 'London, UK' },
                    { latitude: 51.51, longitude: -0.12, formattedAddress: 'London Bridge' },
                ],
            };

            mockGetRadarAutocomplete.mockResolvedValueOnce(mockAddresses);

            const request = createRequest({ query: 'London' });

            const response = await POST(request);

            expect(response.status).toBe(200);
            const data = await response.json();
            expect(data.addresses).toHaveLength(2);
            expect(data.addresses[0].formattedAddress).toBe('London, UK');
        });

        it('should pass query to getRadarAutocomplete', async () => {
            const mockAddresses = { addresses: [] };
            mockGetRadarAutocomplete.mockResolvedValueOnce(mockAddresses);

            const request = createRequest({ query: 'Berlin' });

            await POST(request);

            expect(mockGetRadarAutocomplete).toHaveBeenCalledWith('Berlin');
        });

        it('should return empty addresses array when no results', async () => {
            mockGetRadarAutocomplete.mockResolvedValueOnce({ addresses: [] });

            const request = createRequest({ query: 'NonExistentPlace12345' });

            const response = await POST(request);

            expect(response.status).toBe(200);
            const data = await response.json();
            expect(data.addresses).toEqual([]);
        });
    });

    describe('Validation errors (400)', () => {
        it('should return 400 when query is missing', async () => {
            const request = createRequest({});

            const response = await POST(request);

            expect(response.status).toBe(400);
            const data = await response.json();
            expect(data.error).toBe('Invalid query parameter');
        });

        it('should return 400 when query is null', async () => {
            const request = createRequest({ query: null });

            const response = await POST(request);

            expect(response.status).toBe(400);
            const data = await response.json();
            expect(data.error).toBe('Invalid query parameter');
        });

        it('should return 400 when query is not a string (number)', async () => {
            const request = createRequest({ query: 123 });

            const response = await POST(request);

            expect(response.status).toBe(400);
            const data = await response.json();
            expect(data.error).toBe('Invalid query parameter');
        });

        it('should return 400 when query is not a string (object)', async () => {
            const request = createRequest({ query: { nested: 'object' } });

            const response = await POST(request);

            expect(response.status).toBe(400);
            const data = await response.json();
            expect(data.error).toBe('Invalid query parameter');
        });

        it('should return 400 when query is not a string (array)', async () => {
            const request = createRequest({ query: ['array', 'of', 'strings'] });

            const response = await POST(request);

            expect(response.status).toBe(400);
            const data = await response.json();
            expect(data.error).toBe('Invalid query parameter');
        });

        it('should return 400 when query is empty string', async () => {
            const request = createRequest({ query: '' });

            const response = await POST(request);

            expect(response.status).toBe(400);
            const data = await response.json();
            expect(data.error).toBe('Invalid query parameter');
        });
    });

    describe('Error handling', () => {
        it('should return 500 when getRadarAutocomplete throws an error', async () => {
            mockGetRadarAutocomplete.mockRejectedValueOnce(new Error('Service unavailable'));

            const request = createRequest({ query: 'London' });

            const response = await POST(request);

            expect(response.status).toBe(500);
            const data = await response.json();
            expect(data.error).toBe('Service unavailable');
        });

        it('should return 500 with generic message for non-Error exceptions', async () => {
            mockGetRadarAutocomplete.mockRejectedValueOnce('string error');

            const request = createRequest({ query: 'London' });

            const response = await POST(request);

            expect(response.status).toBe(500);
            const data = await response.json();
            expect(data.error).toBe('Internal Server Error');
        });

        it('should capture exception in Sentry on error', async () => {
            const error = new Error('Test error');
            mockGetRadarAutocomplete.mockRejectedValueOnce(error);

            const request = createRequest({ query: 'London' });

            await POST(request);

            expect(Sentry.captureException).toHaveBeenCalledWith(
                error,
                expect.objectContaining({
                    extra: expect.objectContaining({
                        endpoint: '/api/radar/autocomplete',
                    }),
                })
            );
        });

        it('should return 500 when request body is invalid JSON', async () => {
            const request = new NextRequest('http://localhost/api/radar/autocomplete', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: 'not valid json',
            });

            const response = await POST(request);

            expect(response.status).toBe(500);
            const data = await response.json();
            expect(data.error).toBeDefined();
        });
    });

    describe('Edge cases', () => {
        it('should handle query with special characters', async () => {
            mockGetRadarAutocomplete.mockResolvedValueOnce({ addresses: [] });

            const request = createRequest({ query: 'New York, NY 10001!' });

            const response = await POST(request);

            expect(response.status).toBe(200);
            expect(mockGetRadarAutocomplete).toHaveBeenCalledWith('New York, NY 10001!');
        });

        it('should handle query with unicode characters', async () => {
            mockGetRadarAutocomplete.mockResolvedValueOnce({ addresses: [] });

            const request = createRequest({ query: '東京' });

            const response = await POST(request);

            expect(response.status).toBe(200);
            expect(mockGetRadarAutocomplete).toHaveBeenCalledWith('東京');
        });

        it('should handle very long query strings', async () => {
            const longQuery = 'A'.repeat(1000);
            mockGetRadarAutocomplete.mockResolvedValueOnce({ addresses: [] });

            const request = createRequest({ query: longQuery });

            const response = await POST(request);

            expect(response.status).toBe(200);
            expect(mockGetRadarAutocomplete).toHaveBeenCalledWith(longQuery);
        });

        it('should handle query with leading/trailing whitespace', async () => {
            mockGetRadarAutocomplete.mockResolvedValueOnce({ addresses: [] });

            const request = createRequest({ query: '  London  ' });

            const response = await POST(request);

            expect(response.status).toBe(200);
            // The API passes the query as-is; trimming is handled by the service
            expect(mockGetRadarAutocomplete).toHaveBeenCalledWith('  London  ');
        });

        it('should handle extra fields in request body', async () => {
            mockGetRadarAutocomplete.mockResolvedValueOnce({ addresses: [] });

            const request = createRequest({
                query: 'London',
                extraField: 'should be ignored',
                limit: 10,
            });

            const response = await POST(request);

            expect(response.status).toBe(200);
            expect(mockGetRadarAutocomplete).toHaveBeenCalledWith('London');
        });
    });
});

