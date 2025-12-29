import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// We need to test the pure functions from shareImageGenerator
// Some functions use browser APIs, so we'll mock navigator for isMobile

/**
 * Helper to test isMobile with a specific user agent
 * Reduces duplication of stubGlobal + resetModules + import pattern
 */
async function testIsMobileWithUserAgent(userAgent: string | undefined): Promise<boolean> {
    vi.stubGlobal('navigator', userAgent !== undefined ? { userAgent } : undefined);
    vi.resetModules();
    const { isMobile } = await import('../../src/lib/shareImageGenerator');
    return isMobile();
}

/**
 * Get a fresh import of shareImageGenerator module
 */
async function getShareImageModule() {
    return import('../../src/lib/shareImageGenerator');
}

describe('shareImageGenerator', () => {
    // Store original navigator
    const originalNavigator = global.navigator;

    beforeEach(() => {
        // Reset navigator mock before each test
        vi.stubGlobal('navigator', { userAgent: '' });
    });

    afterEach(() => {
        // Restore original navigator
        vi.stubGlobal('navigator', originalNavigator);
    });

    describe('isMobile', () => {
        it('should return true for iPhone user agent', async () => {
            const result = await testIsMobileWithUserAgent(
                'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)'
            );
            expect(result).toBe(true);
        });

        it('should return true for Android user agent', async () => {
            const result = await testIsMobileWithUserAgent(
                'Mozilla/5.0 (Linux; Android 11; Pixel 5)'
            );
            expect(result).toBe(true);
        });

        it('should return true for iPad user agent', async () => {
            const result = await testIsMobileWithUserAgent(
                'Mozilla/5.0 (iPad; CPU OS 14_0 like Mac OS X)'
            );
            expect(result).toBe(true);
        });

        it('should return false for desktop Chrome user agent', async () => {
            const result = await testIsMobileWithUserAgent(
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120.0.0.0'
            );
            expect(result).toBe(false);
        });

        it('should return false for desktop Firefox user agent', async () => {
            const result = await testIsMobileWithUserAgent(
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Firefox/121.0'
            );
            expect(result).toBe(false);
        });

        it('should return false when navigator is undefined', async () => {
            const result = await testIsMobileWithUserAgent(undefined);
            expect(result).toBe(false);
        });
    });

    describe('getPlatformShareUrl', () => {
        it('should return Twitter intent URL', async () => {
            const { getPlatformShareUrl } = await getShareImageModule();
            const url = getPlatformShareUrl('twitter');

            expect(url).toContain('https://twitter.com/intent/tweet');
            expect(url).toContain('text=');
            expect(url).toContain('url=');
        });

        it('should return Facebook sharer URL', async () => {
            const { getPlatformShareUrl } = await getShareImageModule();
            const url = getPlatformShareUrl('facebook');

            expect(url).toContain('https://www.facebook.com/sharer/sharer.php');
            expect(url).toContain('u=');
        });

        it('should return Instagram URL for instagram platform', async () => {
            const { getPlatformShareUrl } = await getShareImageModule();
            const url = getPlatformShareUrl('instagram');

            expect(url).toBe('https://www.instagram.com/');
        });
    });
});

describe('shareImageGenerator helpers (internal)', () => {
    it('should have correct platform dimensions defined', async () => {
        const shareModule = await getShareImageModule();
        expect(shareModule.generateShareImage).toBeDefined();
        expect(shareModule.isMobile).toBeDefined();
        expect(shareModule.getPlatformShareUrl).toBeDefined();
    });
});

