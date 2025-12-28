import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import createMiddleware from 'next-intl/middleware';
import { routing } from './src/i18n/routing';
import { checkRateLimit, getClientIP, DEFAULT_RATE_LIMIT } from './src/lib/rateLimit';
import * as Sentry from '@sentry/nextjs';

const intlMiddleware = createMiddleware(routing);

export default async function middleware(request: NextRequest) {
    const pathname = request.nextUrl.pathname;

    // Skip i18n middleware for all API routes
    if (pathname.startsWith('/api/')) {
        // Only apply rate limiting to /api/radar/* routes
        if (!pathname.startsWith('/api/radar')) {
            return NextResponse.next();
        }
    }

    // Handle rate limiting for /api/radar/* routes
    if (pathname.startsWith('/api/radar')) {
        const clientIP = getClientIP(request);
        const result = await checkRateLimit(clientIP, DEFAULT_RATE_LIMIT);

        if (!result.success) {
            // Log rate limit block to Sentry
            Sentry.captureMessage("Rate limit exceeded", {
                level: "warning",
                extra: {
                    ip: clientIP,
                    path: pathname,
                    remaining: result.remaining,
                    reset: result.reset,
                }
            });

            return NextResponse.json(
                {
                    error: "Too many requests",
                    message: "Rate limit exceeded. Please try again later.",
                    retryAfter: result.reset,
                },
                {
                    status: 429,
                    headers: {
                        'Retry-After': String(result.reset - Math.floor(Date.now() / 1000)),
                        'X-RateLimit-Limit': String(DEFAULT_RATE_LIMIT.limit),
                        'X-RateLimit-Remaining': String(result.remaining),
                        'X-RateLimit-Reset': String(result.reset),
                    },
                }
            );
        }

        // Add rate limit headers to successful responses
        const response = NextResponse.next();
        response.headers.set('X-RateLimit-Limit', String(DEFAULT_RATE_LIMIT.limit));
        response.headers.set('X-RateLimit-Remaining', String(result.remaining));
        response.headers.set('X-RateLimit-Reset', String(result.reset));
        return response;
    }

    // For non-API routes, use the i18n middleware
    return intlMiddleware(request);
}

export const config = {
    // Match:
    // - All pathnames for i18n (except static files)
    // - /api/radar/* for rate limiting
    matcher: [
        // API routes for rate limiting
        '/api/radar/:path*',
        // i18n routes (excluding static files, manifest, and generated icons)
        '/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icon|apple-icon|.*\\.(?:png|jpg|jpeg|svg|gif|webp)).*)'
    ]
};
