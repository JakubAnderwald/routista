/**
 * API and infrastructure configuration
 * 
 * Contains settings for Radar API, caching, and rate limiting.
 */

/**
 * Radar API settings
 */
export const RADAR_API = {
    /** Maximum waypoints per API request (Radar supports up to 25) */
    chunkSize: 10,
    
    /** Delay between API calls in milliseconds (avoid rate limits) */
    delayBetweenChunksMs: 200,
} as const;

/**
 * Redis cache settings
 */
export const CACHE = {
    /** Cache TTL in seconds (24 hours) */
    ttlSeconds: 24 * 60 * 60,
    
    /** Key prefix for route cache entries */
    routeKeyPrefix: "route:",
    
    /** Key prefix for rate limit entries */
    rateLimitKeyPrefix: "ratelimit:",
} as const;

/**
 * Rate limiting configuration
 */
export const RATE_LIMIT = {
    /** Maximum requests allowed in the window */
    limit: 10,
    
    /** Time window in seconds */
    windowSeconds: 60,
    
    /** Extra TTL buffer for Redis key expiry */
    ttlBufferSeconds: 10,
} as const;

