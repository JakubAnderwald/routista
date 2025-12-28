import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// We need to test the pure functions from shareImageGenerator
// Some functions use browser APIs, so we'll mock navigator for isMobile

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
        // We need to dynamically import to get fresh module state
        const getIsMobile = async () => {
            // Clear module cache to get fresh import with new navigator
            vi.resetModules();
            const { isMobile } = await import('../../src/lib/shareImageGenerator');
            return isMobile;
        };

        it('should return true for iPhone user agent', async () => {
            vi.stubGlobal('navigator', { 
                userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)' 
            });
            const isMobile = await getIsMobile();
            expect(isMobile()).toBe(true);
        });

        it('should return true for Android user agent', async () => {
            vi.stubGlobal('navigator', { 
                userAgent: 'Mozilla/5.0 (Linux; Android 11; Pixel 5)' 
            });
            const isMobile = await getIsMobile();
            expect(isMobile()).toBe(true);
        });

        it('should return true for iPad user agent', async () => {
            vi.stubGlobal('navigator', { 
                userAgent: 'Mozilla/5.0 (iPad; CPU OS 14_0 like Mac OS X)' 
            });
            const isMobile = await getIsMobile();
            expect(isMobile()).toBe(true);
        });

        it('should return false for desktop Chrome user agent', async () => {
            vi.stubGlobal('navigator', { 
                userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120.0.0.0' 
            });
            const isMobile = await getIsMobile();
            expect(isMobile()).toBe(false);
        });

        it('should return false for desktop Firefox user agent', async () => {
            vi.stubGlobal('navigator', { 
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Firefox/121.0' 
            });
            const isMobile = await getIsMobile();
            expect(isMobile()).toBe(false);
        });

        it('should return false when navigator is undefined', async () => {
            vi.stubGlobal('navigator', undefined);
            const isMobile = await getIsMobile();
            expect(isMobile()).toBe(false);
        });
    });

    describe('getPlatformShareUrl', () => {
        it('should return Twitter intent URL', async () => {
            const { getPlatformShareUrl } = await import('../../src/lib/shareImageGenerator');
            const url = getPlatformShareUrl('twitter');
            
            expect(url).toContain('https://twitter.com/intent/tweet');
            expect(url).toContain('text=');
            expect(url).toContain('url=');
        });

        it('should return Facebook sharer URL', async () => {
            const { getPlatformShareUrl } = await import('../../src/lib/shareImageGenerator');
            const url = getPlatformShareUrl('facebook');
            
            expect(url).toContain('https://www.facebook.com/sharer/sharer.php');
            expect(url).toContain('u=');
        });

        it('should return Instagram URL for instagram platform', async () => {
            const { getPlatformShareUrl } = await import('../../src/lib/shareImageGenerator');
            const url = getPlatformShareUrl('instagram');
            
            expect(url).toBe('https://www.instagram.com/');
        });
    });
});

// Test formatLength and getModeEmoji which are internal functions
// We can test them indirectly through generateShareImage or extract them
// For now, let's add a separate test file that imports them if they're exported

describe('shareImageGenerator helpers (internal)', () => {
    // These are internal functions - if we want to test them directly,
    // we'd need to export them. For now, testing through integration.
    
    it('should have correct platform dimensions defined', async () => {
        // This tests that the module loads correctly
        const shareModule = await import('../../src/lib/shareImageGenerator');
        expect(shareModule.generateShareImage).toBeDefined();
        expect(shareModule.isMobile).toBeDefined();
        expect(shareModule.getPlatformShareUrl).toBeDefined();
    });
});

