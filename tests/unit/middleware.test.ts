// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';

const mockCheckRateLimit = vi.hoisted(() => vi.fn());
const mockCaptureMessage = vi.hoisted(() => vi.fn());
const mockIntlMiddleware = vi.hoisted(() => vi.fn());

vi.mock('../../src/lib/rateLimit', () => ({
    checkRateLimit: mockCheckRateLimit,
    getClientIP: () => '203.0.113.7',
    DEFAULT_RATE_LIMIT: { limit: 10, windowSeconds: 60 },
}));

vi.mock('@sentry/nextjs', () => ({
    captureMessage: mockCaptureMessage,
}));

// next-intl's ESM build imports `next/server` and `next/navigation` without an
// extension, which Node's resolver rejects outside Next's bundler. Its behaviour
// isn't under test here.
vi.mock('next-intl/middleware', () => ({
    default: () => mockIntlMiddleware,
}));
vi.mock('next-intl/navigation', () => ({
    createNavigation: () => ({}),
}));

import middleware, { config } from '../../middleware';

const matches = (url: string) => unstable_doesMiddlewareMatch({ config, url });

describe('middleware matcher', () => {
    // Sentry's tunnelRoute (next.config.ts) is only rewritten to Sentry ingest
    // when middleware leaves it alone; an i18n redirect to /en/monitoring 404s.
    it.each([
        '/monitoring?o=4510000000000000&p=4510000000000001',
        '/monitoring',
        '/monitoring/',
    ])('skips the Sentry tunnel %s', (url) => {
        expect(matches(url)).toBe(false);
    });

    it.each([
        '/_next/static/chunks/main.js',
        '/_next/image?url=%2Fhero.png&w=640&q=75',
        '/favicon.ico',
        '/manifest.webmanifest',
        '/icon',
        '/apple-icon',
        '/examples/heart.png',
    ])('skips static asset %s', (url) => {
        expect(matches(url)).toBe(false);
    });

    it.each([
        '/',
        '/en',
        '/de/create',
        '/api/radar/directions',
        // The tunnel exclusion is bounded to the path segment.
        '/monitoring-guide',
    ])('runs on %s', (url) => {
        expect(matches(url)).toBe(true);
    });
});

describe('middleware handler', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const run = (path: string) => middleware(new NextRequest(`https://routista.test${path}`));

    it('passes non-radar API routes straight through', async () => {
        const response = await run('/api/share');

        expect(response.headers.get('x-middleware-next')).toBe('1');
        expect(mockCheckRateLimit).not.toHaveBeenCalled();
    });

    it('adds rate limit headers to allowed radar requests', async () => {
        mockCheckRateLimit.mockResolvedValue({ success: true, remaining: 7, reset: 1_700_000_060 });

        const response = await run('/api/radar/directions');

        expect(response.headers.get('x-middleware-next')).toBe('1');
        expect(response.headers.get('X-RateLimit-Limit')).toBe('10');
        expect(response.headers.get('X-RateLimit-Remaining')).toBe('7');
        expect(response.headers.get('X-RateLimit-Reset')).toBe('1700000060');
    });

    it('blocks radar requests over the limit and reports them to Sentry', async () => {
        mockCheckRateLimit.mockResolvedValue({ success: false, remaining: 0, reset: 1_700_000_060 });

        const response = await run('/api/radar/directions');

        expect(response.status).toBe(429);
        expect(await response.json()).toMatchObject({ error: 'Too many requests' });
        expect(response.headers.get('X-RateLimit-Remaining')).toBe('0');
        expect(mockCaptureMessage).toHaveBeenCalledWith(
            'Rate limit exceeded',
            expect.objectContaining({ level: 'warning' })
        );
    });

    it('hands page routes to the i18n middleware', async () => {
        const intlResponse = new Response(null, { status: 307 });
        mockIntlMiddleware.mockReturnValue(intlResponse);

        const response = await run('/about');

        expect(response).toBe(intlResponse);
        expect(mockIntlMiddleware).toHaveBeenCalledOnce();
        expect(mockCheckRateLimit).not.toHaveBeenCalled();
    });
});
