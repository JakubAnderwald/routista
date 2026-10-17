// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
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
    // when middleware leaves it alone; an i18n rewrite to /en/monitoring 404s.
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

    // Metadata routes at the app root; i18n would rewrite them to /en/robots.txt (404).
    it.each(['/robots.txt', '/sitemap.xml'])('skips crawler file %s', (url) => {
        expect(matches(url)).toBe(false);
    });

    it.each([
        '/',
        '/about',
        '/en',
        '/en/about',
        '/de/create',
        '/api/radar/directions',
        // The tunnel exclusion is bounded to the path segment.
        '/monitoring-guide',
        // The crawler file exclusions are anchored to the exact file.
        '/sitemap',
        '/robots.txt/extra',
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

    describe('default-locale prefix strip', () => {
        const intlRedirect = (location: string) => {
            const response = NextResponse.redirect(`https://routista.test${location}`);
            response.cookies.set('NEXT_LOCALE', 'en');
            return response;
        };

        it.each([
            ['/en/about', '/about'],
            ['/en', '/'],
            ['/en/create?ref=share', '/create?ref=share'],
        ])('makes %s → %s permanent', async (path, target) => {
            mockIntlMiddleware.mockReturnValue(intlRedirect(target));

            const response = await run(path);

            expect(response.status).toBe(308);
            expect(response.headers.get('location')).toBe(`https://routista.test${target}`);
            // The cookie keeps a browser with a German Accept-Language on English.
            expect(response.headers.get('set-cookie')).toContain('NEXT_LOCALE=en');
        });

        it('leaves locale-detection redirects temporary', async () => {
            const intlResponse = NextResponse.redirect('https://routista.test/de/about');
            mockIntlMiddleware.mockReturnValue(intlResponse);

            const response = await run('/about');

            expect(response).toBe(intlResponse);
            expect(response.status).toBe(307);
        });

        it('ignores paths that only start with the locale letters', async () => {
            const intlResponse = NextResponse.redirect('https://routista.test/english');
            mockIntlMiddleware.mockReturnValue(intlResponse);

            const response = await run('/english');

            expect(response).toBe(intlResponse);
        });

        it('passes through /en responses that are not redirects', async () => {
            const intlResponse = NextResponse.next();
            mockIntlMiddleware.mockReturnValue(intlResponse);

            const response = await run('/en/about');

            expect(response).toBe(intlResponse);
        });
    });
});
