import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { checkRateLimit, getClientIP, DEFAULT_RATE_LIMIT } from './rateLimit';

/**
 * Rate-limit a /api/radar/* request inside its route handler.
 *
 * This used to run in middleware, which made every API call two billed Vercel
 * invocations (middleware + function) against the Hobby plan's Active CPU cap.
 * Blocked requests get a 429 and a Sentry warning; allowed ones run `handler`
 * and get the X-RateLimit-* headers added to its response.
 */
export async function withRateLimit(
    request: Request,
    handler: () => Promise<NextResponse>
): Promise<NextResponse> {
    const clientIP = getClientIP(request);
    const result = await checkRateLimit(clientIP, DEFAULT_RATE_LIMIT);

    const rateLimitHeaders = {
        'X-RateLimit-Limit': String(DEFAULT_RATE_LIMIT.limit),
        'X-RateLimit-Remaining': String(result.remaining),
        'X-RateLimit-Reset': String(result.reset),
    };

    if (!result.success) {
        Sentry.captureMessage("Rate limit exceeded", {
            level: "warning",
            extra: {
                ip: clientIP,
                path: new URL(request.url).pathname,
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
                    ...rateLimitHeaders,
                },
            }
        );
    }

    const response = await handler();
    for (const [name, value] of Object.entries(rateLimitHeaders)) {
        response.headers.set(name, value);
    }
    return response;
}
