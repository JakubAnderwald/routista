// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';

const mockIntlMiddleware = vi.hoisted(() => vi.fn());

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

    // Every middleware run bills Vercel Active CPU. The radar routes rate-limit
    // themselves, and dotted paths are files or bot probes, never pages.
    it.each([
        '/api/radar/directions',
        '/api/radar/autocomplete',
        '/_vercel/insights/script.js',
        '/wp-login.php',
        '/.env',
        '/robots.txt/extra',
    ])('skips non-page path %s', (url) => {
        expect(matches(url)).toBe(false);
    });

    it.each([
        '/',
        '/about',
        '/en',
        '/en/about',
        '/de/create',
        // The tunnel and API exclusions are bounded to the path segment.
        '/monitoring-guide',
        '/apiary',
        // Without the dot, it's a page path.
        '/sitemap',
    ])('runs on %s', (url) => {
        expect(matches(url)).toBe(true);
    });
});

describe('middleware handler', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const run = (path: string) => middleware(new NextRequest(`https://routista.test${path}`));

    it('hands page routes to the i18n middleware', () => {
        const intlResponse = new Response(null, { status: 307 });
        mockIntlMiddleware.mockReturnValue(intlResponse);

        const response = run('/about');

        expect(response).toBe(intlResponse);
        expect(mockIntlMiddleware).toHaveBeenCalledOnce();
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
        ])('makes %s → %s permanent', (path, target) => {
            mockIntlMiddleware.mockReturnValue(intlRedirect(target));

            const response = run(path);

            expect(response.status).toBe(308);
            expect(response.headers.get('location')).toBe(`https://routista.test${target}`);
            // The cookie keeps a browser with a German Accept-Language on English.
            expect(response.headers.get('set-cookie')).toContain('NEXT_LOCALE=en');
        });

        it('leaves locale-detection redirects temporary', () => {
            const intlResponse = NextResponse.redirect('https://routista.test/de/about');
            mockIntlMiddleware.mockReturnValue(intlResponse);

            const response = run('/about');

            expect(response).toBe(intlResponse);
            expect(response.status).toBe(307);
        });

        it('ignores paths that only start with the locale letters', () => {
            const intlResponse = NextResponse.redirect('https://routista.test/english');
            mockIntlMiddleware.mockReturnValue(intlResponse);

            const response = run('/english');

            expect(response).toBe(intlResponse);
        });

        it('passes through /en responses that are not redirects', () => {
            const intlResponse = NextResponse.next();
            mockIntlMiddleware.mockReturnValue(intlResponse);

            const response = run('/en/about');

            expect(response).toBe(intlResponse);
        });
    });
});
