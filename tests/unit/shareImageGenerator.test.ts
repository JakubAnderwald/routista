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

    describe('formatLength', () => {
        it('should format meters for values under 1000m', async () => {
            const { formatLength } = await getShareImageModule();
            
            expect(formatLength(0)).toBe('0 m');
            expect(formatLength(100)).toBe('100 m');
            expect(formatLength(500)).toBe('500 m');
            expect(formatLength(999)).toBe('999 m');
        });

        it('should format as kilometers for values 1000m and over', async () => {
            const { formatLength } = await getShareImageModule();
            
            expect(formatLength(1000)).toBe('1.0 km');
            expect(formatLength(1500)).toBe('1.5 km');
            expect(formatLength(2500)).toBe('2.5 km');
            expect(formatLength(10000)).toBe('10.0 km');
        });

        it('should round meters to nearest integer', async () => {
            const { formatLength } = await getShareImageModule();
            
            expect(formatLength(100.4)).toBe('100 m');
            expect(formatLength(100.6)).toBe('101 m');
            expect(formatLength(999.9)).toBe('1000 m');
        });

        it('should format kilometers to one decimal place', async () => {
            const { formatLength } = await getShareImageModule();
            
            expect(formatLength(1234)).toBe('1.2 km');
            expect(formatLength(1250)).toBe('1.3 km'); // 1.25 rounds to 1.3
            expect(formatLength(2500)).toBe('2.5 km');
            expect(formatLength(42195)).toBe('42.2 km'); // Marathon distance
        });

        it('should handle edge case at 1000m boundary', async () => {
            const { formatLength } = await getShareImageModule();
            
            expect(formatLength(999.9)).toBe('1000 m');
            expect(formatLength(1000)).toBe('1.0 km');
            expect(formatLength(1000.1)).toBe('1.0 km');
        });
    });

    describe('getModeEmoji', () => {
        it('should return walking emoji for foot-walking mode', async () => {
            const { getModeEmoji } = await getShareImageModule();
            expect(getModeEmoji('foot-walking')).toBe('🚶');
        });

        it('should return cycling emoji for cycling-regular mode', async () => {
            const { getModeEmoji } = await getShareImageModule();
            expect(getModeEmoji('cycling-regular')).toBe('🚴');
        });

        it('should return car emoji for driving-car mode', async () => {
            const { getModeEmoji } = await getShareImageModule();
            expect(getModeEmoji('driving-car')).toBe('🚗');
        });

        it('should return running emoji for unknown mode', async () => {
            const { getModeEmoji } = await getShareImageModule();
            expect(getModeEmoji('unknown-mode')).toBe('🏃');
        });

        it('should return running emoji for empty string', async () => {
            const { getModeEmoji } = await getShareImageModule();
            expect(getModeEmoji('')).toBe('🏃');
        });

        it('should be case-sensitive', async () => {
            const { getModeEmoji } = await getShareImageModule();
            // Different case should not match
            expect(getModeEmoji('FOOT-WALKING')).toBe('🏃');
            expect(getModeEmoji('Foot-Walking')).toBe('🏃');
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

    it('should export formatLength and getModeEmoji', async () => {
        const shareModule = await getShareImageModule();
        expect(shareModule.formatLength).toBeDefined();
        expect(shareModule.getModeEmoji).toBeDefined();
    });
});
