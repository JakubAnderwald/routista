import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { checkRateLimit, getClientIP, DEFAULT_RATE_LIMIT, type RateLimitConfig } from './rateLimit';

/** Which limit to apply. Without a bucket, the request counts against the default per-IP key. */
export interface RateLimitOptions {
    config: RateLimitConfig;
    /** Separate counter name, so this endpoint's traffic does not share the default budget. */
    bucket?: string;
}

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
    handler: () => Promise<NextResponse>,
    { config, bucket }: RateLimitOptions = { config: DEFAULT_RATE_LIMIT }
): Promise<NextResponse> {
    const clientIP = getClientIP(request);
    const identifier = bucket ? `${bucket}:${clientIP}` : clientIP;
    const result = await checkRateLimit(identifier, config);

    const rateLimitHeaders = {
        'X-RateLimit-Limit': String(config.limit),
        'X-RateLimit-Remaining': String(result.remaining),
        'X-RateLimit-Reset': String(result.reset),
    };

    if (!result.success) {
        Sentry.captureMessage("Rate limit exceeded", {
            level: "warning",
            extra: {
                ip: clientIP,
                path: new URL(request.url).pathname,
                bucket: bucket ?? 'default',
                limit: config.limit,
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
