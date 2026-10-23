// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

const mockCheckRateLimit = vi.hoisted(() => vi.fn());
const mockCaptureMessage = vi.hoisted(() => vi.fn());

vi.mock('../../src/lib/rateLimit', () => ({
    checkRateLimit: mockCheckRateLimit,
    getClientIP: () => '203.0.113.7',
    DEFAULT_RATE_LIMIT: { limit: 10, windowSeconds: 60 },
}));

vi.mock('@sentry/nextjs', () => ({
    captureMessage: mockCaptureMessage,
}));

import { withRateLimit } from '../../src/lib/apiRateLimit';

describe('withRateLimit', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const request = () => new Request('https://routista.test/api/radar/directions', { method: 'POST' });

    it('runs the handler and adds rate limit headers to allowed requests', async () => {
        mockCheckRateLimit.mockResolvedValue({ success: true, remaining: 7, reset: 1_700_000_060 });
        const handler = vi.fn(async () => NextResponse.json({ ok: true }));

        const response = await withRateLimit(request(), handler);

        expect(handler).toHaveBeenCalledOnce();
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ ok: true });
        expect(response.headers.get('X-RateLimit-Limit')).toBe('10');
        expect(response.headers.get('X-RateLimit-Remaining')).toBe('7');
        expect(response.headers.get('X-RateLimit-Reset')).toBe('1700000060');
        expect(mockCheckRateLimit).toHaveBeenCalledWith('203.0.113.7', expect.objectContaining({ limit: 10 }));
    });

    it('keeps the rate limit headers on handler errors', async () => {
        mockCheckRateLimit.mockResolvedValue({ success: true, remaining: 3, reset: 1_700_000_060 });

        const response = await withRateLimit(request(), async () =>
            NextResponse.json({ error: 'boom' }, { status: 500 })
        );

        expect(response.status).toBe(500);
        expect(response.headers.get('X-RateLimit-Remaining')).toBe('3');
    });

    it('blocks requests over the limit without running the handler and reports them to Sentry', async () => {
        mockCheckRateLimit.mockResolvedValue({ success: false, remaining: 0, reset: 1_700_000_060 });
        const handler = vi.fn();

        const response = await withRateLimit(request(), handler);

        expect(handler).not.toHaveBeenCalled();
        expect(response.status).toBe(429);
        expect(await response.json()).toMatchObject({ error: 'Too many requests', retryAfter: 1_700_000_060 });
        expect(response.headers.get('X-RateLimit-Remaining')).toBe('0');
        expect(response.headers.get('Retry-After')).not.toBeNull();
        expect(mockCaptureMessage).toHaveBeenCalledWith(
            'Rate limit exceeded',
            expect.objectContaining({
                level: 'warning',
                extra: expect.objectContaining({ path: '/api/radar/directions' }),
            })
        );
    });
});
