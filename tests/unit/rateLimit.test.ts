import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Create hoisted mock functions
const mockRedisGet = vi.hoisted(() => vi.fn());
const mockRedisSet = vi.hoisted(() => vi.fn());

// Mock the Redis module with proper class
vi.mock('@upstash/redis', () => {
    return {
        Redis: class MockRedis {
            get = mockRedisGet;
            set = mockRedisSet;
        },
    };
});

import { checkRateLimit, getClientIP, DEFAULT_RATE_LIMIT, RateLimitConfig } from '../../src/lib/rateLimit';

describe('rateLimit', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Reset env vars
        vi.stubEnv('KV_REST_API_URL', '');
        vi.stubEnv('KV_REST_API_TOKEN', '');
        vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
        vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('getClientIP', () => {
        it('should return x-real-ip header if present', () => {
            const request = new Request('https://example.com', {
                headers: {
                    'x-real-ip': '192.168.1.1',
                },
            });

            const ip = getClientIP(request);

            expect(ip).toBe('192.168.1.1');
        });

        it('should return first IP from x-forwarded-for if x-real-ip not present', () => {
            const request = new Request('https://example.com', {
                headers: {
                    'x-forwarded-for': '10.0.0.1, 10.0.0.2, 10.0.0.3',
                },
            });

            const ip = getClientIP(request);

            expect(ip).toBe('10.0.0.1');
        });

        it('should trim whitespace from x-forwarded-for IP', () => {
            const request = new Request('https://example.com', {
                headers: {
                    'x-forwarded-for': '  10.0.0.1  , 10.0.0.2',
                },
            });

            const ip = getClientIP(request);

            expect(ip).toBe('10.0.0.1');
        });

        it('should prefer x-real-ip over x-forwarded-for', () => {
            const request = new Request('https://example.com', {
                headers: {
                    'x-real-ip': '192.168.1.1',
                    'x-forwarded-for': '10.0.0.1, 10.0.0.2',
                },
            });

            const ip = getClientIP(request);

            expect(ip).toBe('192.168.1.1');
        });

        it('should return unknown when no IP headers present', () => {
            const request = new Request('https://example.com');

            const ip = getClientIP(request);

            expect(ip).toBe('unknown');
        });
    });

    describe('checkRateLimit', () => {
        it('should allow request when Redis is not configured', async () => {
            const result = await checkRateLimit('test-ip');

            expect(result.success).toBe(true);
            expect(result.remaining).toBe(DEFAULT_RATE_LIMIT.limit);
        });

        it('should allow first request when Redis is configured', async () => {
            vi.stubEnv('KV_REST_API_URL', 'https://redis.example.com');
            vi.stubEnv('KV_REST_API_TOKEN', 'test-token');

            // No previous requests
            mockRedisGet.mockResolvedValueOnce(null);
            mockRedisSet.mockResolvedValueOnce('OK');

            const result = await checkRateLimit('test-ip');

            expect(result.success).toBe(true);
            expect(result.remaining).toBe(DEFAULT_RATE_LIMIT.limit - 1);
        });

        it('should allow request when under limit', async () => {
            vi.stubEnv('KV_REST_API_URL', 'https://redis.example.com');
            vi.stubEnv('KV_REST_API_TOKEN', 'test-token');

            // 5 previous requests (under default limit of 10)
            const now = Date.now();
            const timestamps = Array.from({ length: 5 }, (_, i) => now - i * 1000);
            mockRedisGet.mockResolvedValueOnce(timestamps);
            mockRedisSet.mockResolvedValueOnce('OK');

            const result = await checkRateLimit('test-ip');

            expect(result.success).toBe(true);
            expect(result.remaining).toBe(DEFAULT_RATE_LIMIT.limit - 6); // 5 previous + 1 new
        });

        it('should block request when at limit', async () => {
            vi.stubEnv('KV_REST_API_URL', 'https://redis.example.com');
            vi.stubEnv('KV_REST_API_TOKEN', 'test-token');

            const config: RateLimitConfig = {
                limit: 10,
                windowSeconds: 60,
            };

            // 10 requests in the window (at limit)
            const now = Date.now();
            const timestamps = Array.from({ length: 10 }, (_, i) => now - i * 1000);
            mockRedisGet.mockResolvedValueOnce(timestamps);

            const result = await checkRateLimit('test-ip', config);

            expect(result.success).toBe(false);
            expect(result.remaining).toBe(0);
        });

        it('should allow request after old timestamps expire', async () => {
            vi.stubEnv('KV_REST_API_URL', 'https://redis.example.com');
            vi.stubEnv('KV_REST_API_TOKEN', 'test-token');

            const config: RateLimitConfig = {
                limit: 10,
                windowSeconds: 60,
            };

            // All 10 timestamps are older than window
            const now = Date.now();
            const windowMs = config.windowSeconds * 1000;
            const oldTimestamps = Array.from({ length: 10 }, (_, i) => now - windowMs - 1000 - i * 100);
            mockRedisGet.mockResolvedValueOnce(oldTimestamps);
            mockRedisSet.mockResolvedValueOnce('OK');

            const result = await checkRateLimit('test-ip', config);

            expect(result.success).toBe(true);
            // All old timestamps filtered out, only new one counts
            expect(result.remaining).toBe(config.limit - 1);
        });

        it('should allow request when Redis throws error', async () => {
            vi.stubEnv('KV_REST_API_URL', 'https://redis.example.com');
            vi.stubEnv('KV_REST_API_TOKEN', 'test-token');

            mockRedisGet.mockRejectedValueOnce(new Error('Redis connection failed'));

            const result = await checkRateLimit('test-ip');

            // Should allow on error (graceful fallback)
            expect(result.success).toBe(true);
            expect(result.remaining).toBe(DEFAULT_RATE_LIMIT.limit);
        });

        it('should use custom rate limit config', async () => {
            vi.stubEnv('KV_REST_API_URL', 'https://redis.example.com');
            vi.stubEnv('KV_REST_API_TOKEN', 'test-token');

            const customConfig: RateLimitConfig = {
                limit: 5,
                windowSeconds: 30,
            };

            mockRedisGet.mockResolvedValueOnce(null);
            mockRedisSet.mockResolvedValueOnce('OK');

            const result = await checkRateLimit('test-ip', customConfig);

            expect(result.success).toBe(true);
            expect(result.remaining).toBe(customConfig.limit - 1);
        });

        it('should work with Upstash naming convention', async () => {
            vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://upstash.example.com');
            vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'upstash-token');

            mockRedisGet.mockResolvedValueOnce(null);
            mockRedisSet.mockResolvedValueOnce('OK');

            const result = await checkRateLimit('test-ip');

            expect(result.success).toBe(true);
        });

        it('should filter mixed old and new timestamps correctly', async () => {
            vi.stubEnv('KV_REST_API_URL', 'https://redis.example.com');
            vi.stubEnv('KV_REST_API_TOKEN', 'test-token');

            const config: RateLimitConfig = {
                limit: 5,
                windowSeconds: 60,
            };

            const now = Date.now();
            const windowMs = config.windowSeconds * 1000;
            
            // Mix of old and new timestamps
            const timestamps = [
                now - 10000,       // Valid (10s ago)
                now - 20000,       // Valid (20s ago)
                now - windowMs - 1000, // Expired
                now - windowMs - 2000, // Expired
            ];
            mockRedisGet.mockResolvedValueOnce(timestamps);
            mockRedisSet.mockResolvedValueOnce('OK');

            const result = await checkRateLimit('test-ip', config);

            expect(result.success).toBe(true);
            // 2 valid + 1 new = 3 total, so 5 - 3 = 2 remaining
            expect(result.remaining).toBe(2);
        });
    });

    describe('DEFAULT_RATE_LIMIT', () => {
        it('should have expected default values', () => {
            expect(DEFAULT_RATE_LIMIT.limit).toBeGreaterThan(0);
            expect(DEFAULT_RATE_LIMIT.windowSeconds).toBeGreaterThan(0);
        });
    });
});

