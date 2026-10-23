import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import createMiddleware from 'next-intl/middleware';
import { routing } from './src/i18n/routing';

const intlMiddleware = createMiddleware(routing);

const DEFAULT_LOCALE_PREFIX = `/${routing.defaultLocale}`;

function hasDefaultLocalePrefix(pathname: string): boolean {
    return pathname === DEFAULT_LOCALE_PREFIX || pathname.startsWith(`${DEFAULT_LOCALE_PREFIX}/`);
}

/**
 * next-intl answers every redirect with a 307. Stripping the default-locale
 * prefix (/en/about → /about) is deterministic, because a path prefix outranks
 * the cookie and Accept-Language, so it is made permanent and Google drops the
 * /en URLs. Locale-detection redirects (/ → /de) stay 307.
 *
 * Headers are kept, including the NEXT_LOCALE cookie that lets a browser with
 * a German Accept-Language stay on English. That cookie is also why this can't
 * be a next.config redirect, which would run before next-intl.
 */
function withPermanentPrefixStrip(request: NextRequest, response: Response): Response {
    const location = response.headers.get('location');
    if (response.status !== 307 || !location || !hasDefaultLocalePrefix(request.nextUrl.pathname)) {
        return response;
    }
    return NextResponse.redirect(location, { status: 308, headers: response.headers });
}

export default function middleware(request: NextRequest) {
    return withPermanentPrefixStrip(request, intlMiddleware(request));
}

export const config = {
    // i18n only. Every middleware run bills Vercel Active CPU, which the Hobby
    // plan caps, so it skips everything that isn't a page:
    // - `api`: the radar routes rate-limit themselves (src/lib/apiRateLimit.ts).
    // - `_next`, `_vercel`: framework assets and Vercel analytics scripts.
    // - `monitoring`: Sentry's tunnelRoute (next.config.ts). If i18n rewrote it
    //   to /en/monitoring, Sentry's rewrite would never fire and every browser
    //   event would 404. Keep it in sync with `tunnelRoute`.
    // - `icon`, `apple-icon`: generated app icons.
    // - Any path with a dot: static files, robots.txt, sitemap.xml, the
    //   manifest, and bot probes such as /wp-login.php or /.env. i18n would
    //   otherwise rewrite them to /en/robots.txt (404) or redirect them to /de/….
    matcher: [
        '/((?!api(?:/|$)|_next|_vercel|monitoring(?:/|$)|icon|apple-icon|.*\\..*).*)'
    ]
};
