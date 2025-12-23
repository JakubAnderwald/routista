import { Redis } from "@upstash/redis";
import { RATE_LIMIT, CACHE } from "@/config";

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
    /** Maximum number of requests allowed in the window */
    limit: number;
    /** Time window in seconds */
    windowSeconds: number;
}

/**
 * Rate limit result
 */
export interface RateLimitResult {
    /** Whether the request is allowed */
    success: boolean;
    /** Number of remaining requests in the current window */
    remaining: number;
    /** Unix timestamp when the rate limit resets */
    reset: number;
}

/**
 * Default rate limit configuration from config
 */
export const DEFAULT_RATE_LIMIT: RateLimitConfig = {
    limit: RATE_LIMIT.limit,
    windowSeconds: RATE_LIMIT.windowSeconds,
};

/**
 * Create Redis client from environment variables.
 * Checks both Vercel KV and Upstash naming conventions.
 * Returns null if not configured.
 */
function getRedisClient(): Redis | null {
    // Check Vercel KV naming convention first, then Upstash native naming
    const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
    
    if (!url || !token) {
        return null;
    }
    
    return new Redis({ url, token });
}

/**
 * Check and update rate limit for a given identifier (e.g., IP address).
 * Uses a sliding window algorithm with Upstash Redis.
 * 
 * @param identifier - Unique identifier for the rate limit (usually IP address)
 * @param config - Rate limit configuration
 * @returns Rate limit result indicating if request is allowed
 */
export async function checkRateLimit(
    identifier: string,
    config: RateLimitConfig = DEFAULT_RATE_LIMIT
): Promise<RateLimitResult> {
    const now = Date.now();
    const windowMs = config.windowSeconds * 1000;
    const windowStart = now - windowMs;
    const key = `${CACHE.rateLimitKeyPrefix}${identifier}`;

    const redis = getRedisClient();
    
    if (!redis) {
        // Redis not configured, allow request (development mode)
        console.warn(`[RateLimit] Redis not configured, allowing request`);
        return {
            success: true,
            remaining: config.limit,
            reset: Math.ceil((now + windowMs) / 1000),
        };
    }

    try {
        // Get current request timestamps from Redis
        const timestamps: number[] = (await redis.get<number[]>(key)) || [];

        // Filter out timestamps outside the current window
        const validTimestamps = timestamps.filter((ts) => ts > windowStart);

        // Check if limit exceeded
        if (validTimestamps.length >= config.limit) {
            const oldestInWindow = Math.min(...validTimestamps);
            const resetTime = oldestInWindow + windowMs;

            console.log(`[RateLimit] BLOCKED ${identifier}: ${validTimestamps.length}/${config.limit} requests in window`);

            return {
                success: false,
                remaining: 0,
                reset: Math.ceil(resetTime / 1000),
            };
        }

        // Add current request timestamp
        validTimestamps.push(now);

        // Store updated timestamps with TTL slightly longer than window
        await redis.set(key, validTimestamps, { ex: config.windowSeconds + RATE_LIMIT.ttlBufferSeconds });

        const remaining = config.limit - validTimestamps.length;
        console.log(`[RateLimit] ALLOWED ${identifier}: ${validTimestamps.length}/${config.limit} requests (${remaining} remaining)`);

        return {
            success: true,
            remaining,
            reset: Math.ceil((now + windowMs) / 1000),
        };
    } catch (error) {
        // If Redis fails, allow the request
        console.warn(`[RateLimit] Redis error, allowing request: ${error instanceof Error ? error.message : 'unknown error'}`);
        return {
            success: true,
            remaining: config.limit,
            reset: Math.ceil((now + windowMs) / 1000),
        };
    }
}

/**
 * Get the client IP address from a request.
 * Handles various proxy headers used by Vercel and other platforms.
 * 
 * @param request - The incoming request
 * @returns The client IP address or 'unknown'
 */
export function getClientIP(request: Request): string {
    // Vercel provides the real IP in x-real-ip header
    const realIP = request.headers.get("x-real-ip");
    if (realIP) return realIP;

    // Fallback to x-forwarded-for (first IP in the list)
    const forwardedFor = request.headers.get("x-forwarded-for");
    if (forwardedFor) {
        return forwardedFor.split(",")[0].trim();
    }

    return "unknown";
}
