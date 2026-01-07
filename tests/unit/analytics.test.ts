/**
 * Unit tests for the analytics service.
 * 
 * Tests the type-safe PostHog wrapper, localhost detection,
 * and timing utilities.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock posthog-js before importing analytics
vi.mock('posthog-js', () => ({
    default: {
        capture: vi.fn(),
        get_distinct_id: vi.fn(() => 'test-distinct-id'),
    },
}));

import { track, startTiming } from '@/lib/analytics';
import posthog from 'posthog-js';

describe('analytics', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Reset window.location for each test
        vi.stubGlobal('window', {
            location: {
                hostname: 'routista.eu',
            },
        });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    describe('track', () => {
        it('should call posthog.capture with event name and properties', () => {
            track('wizard_started', {});

            expect(posthog.capture).toHaveBeenCalledWith('wizard_started', {});
        });

        it('should include all properties for shape_selected event', () => {
            track('shape_selected', {
                source: 'upload',
                point_count: 150,
            });

            expect(posthog.capture).toHaveBeenCalledWith('shape_selected', {
                source: 'upload',
                point_count: 150,
            });
        });

        it('should include all properties for generation_result success event', () => {
            track('generation_result', {
                status: 'success',
                latency_ms: 1234,
                route_length_km: 5.5,
                accuracy_percent: 85,
            });

            expect(posthog.capture).toHaveBeenCalledWith('generation_result', {
                status: 'success',
                latency_ms: 1234,
                route_length_km: 5.5,
                accuracy_percent: 85,
            });
        });

        it('should include error_message for generation_result error event', () => {
            track('generation_result', {
                status: 'error',
                latency_ms: 500,
                error_message: 'Route not found',
            });

            expect(posthog.capture).toHaveBeenCalledWith('generation_result', {
                status: 'error',
                latency_ms: 500,
                error_message: 'Route not found',
            });
        });

        it('should skip tracking on localhost', () => {
            vi.stubGlobal('window', {
                location: {
                    hostname: 'localhost',
                },
            });

            track('wizard_started', {});

            expect(posthog.capture).not.toHaveBeenCalled();
        });

        it('should skip tracking on 127.0.0.1', () => {
            vi.stubGlobal('window', {
                location: {
                    hostname: '127.0.0.1',
                },
            });

            track('wizard_started', {});

            expect(posthog.capture).not.toHaveBeenCalled();
        });

        it('should skip tracking on IPv6 localhost (::1)', () => {
            vi.stubGlobal('window', {
                location: {
                    hostname: '::1',
                },
            });

            track('wizard_started', {});

            expect(posthog.capture).not.toHaveBeenCalled();
        });

        it('should track gpx_exported event with all properties', () => {
            track('gpx_exported', {
                route_length_km: 10.5,
                accuracy_percent: 92,
                transport_mode: 'foot-walking',
            });

            expect(posthog.capture).toHaveBeenCalledWith('gpx_exported', {
                route_length_km: 10.5,
                accuracy_percent: 92,
                transport_mode: 'foot-walking',
            });
        });

        it('should track social_share event with platform and action', () => {
            track('social_share', {
                platform: 'instagram',
                action: 'copy',
            });

            expect(posthog.capture).toHaveBeenCalledWith('social_share', {
                platform: 'instagram',
                action: 'copy',
            });
        });

        it('should track support_click event with location', () => {
            track('support_click', {
                location: 'home',
            });

            expect(posthog.capture).toHaveBeenCalledWith('support_click', {
                location: 'home',
            });
        });
    });

    describe('startTiming', () => {
        it('should return a function that measures elapsed time', () => {
            const getLatency = startTiming();
            
            // Small delay to ensure some time passes
            const start = performance.now();
            while (performance.now() - start < 10) {
                // busy wait for ~10ms
            }
            
            const latency = getLatency();
            
            expect(typeof latency).toBe('number');
            expect(latency).toBeGreaterThanOrEqual(0);
        });

        it('should return integer milliseconds', () => {
            const getLatency = startTiming();
            const latency = getLatency();
            
            expect(Number.isInteger(latency)).toBe(true);
        });

        it('should return consistent increasing values on subsequent calls', () => {
            const getLatency = startTiming();
            
            const latency1 = getLatency();
            
            // Small delay
            const start = performance.now();
            while (performance.now() - start < 5) {
                // busy wait
            }
            
            const latency2 = getLatency();
            
            expect(latency2).toBeGreaterThanOrEqual(latency1);
        });
    });
});

describe('analytics edge cases', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should handle server-side rendering (no window)', () => {
        vi.stubGlobal('window', undefined);

        // Should not throw
        expect(() => track('wizard_started', {})).not.toThrow();
        expect(posthog.capture).not.toHaveBeenCalled();
    });

    it('should handle PostHog not being initialized', () => {
        vi.stubGlobal('window', {
            location: {
                hostname: 'routista.eu',
            },
        });

        // Mock PostHog as not initialized
        vi.mocked(posthog.get_distinct_id).mockReturnValue(undefined as unknown as string);

        // Should not throw, just skip
        expect(() => track('wizard_started', {})).not.toThrow();
    });
});
