/**
 * Shared Upstash Redis client.
 *
 * Used for route caching, rate limiting, and OSM water data. Returns null when
 * Redis is not configured, so every caller degrades to working without a cache
 * rather than failing.
 */

import { Redis } from "@upstash/redis";

/**
 * Creates a Redis client from environment variables.
 *
 * Checks the Vercel KV naming convention first, then Upstash's own.
 *
 * @returns A Redis client, or null if no credentials are configured.
 */
export function getRedisClient(): Redis | null {
    const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!url || !token) {
        return null;
    }

    return new Redis({ url, token });
}
