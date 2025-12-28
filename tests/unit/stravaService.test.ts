import { describe, it, expect } from 'vitest';
import { mapModeToStravaType } from '../../src/lib/stravaService';

describe('stravaService', () => {
    describe('mapModeToStravaType', () => {
        it('should map foot-walking to run type', () => {
            const result = mapModeToStravaType('foot-walking');
            
            expect(result.type).toBe(2); // 2 = run
            expect(result.sub_type).toBe(1); // 1 = road
        });

        it('should map cycling-regular to ride type', () => {
            const result = mapModeToStravaType('cycling-regular');
            
            expect(result.type).toBe(1); // 1 = ride
            expect(result.sub_type).toBe(1); // 1 = road
        });

        it('should map driving-car to ride type (fallback)', () => {
            const result = mapModeToStravaType('driving-car');
            
            // Driving doesn't fit Strava, defaults to ride
            expect(result.type).toBe(1); // 1 = ride
            expect(result.sub_type).toBe(1); // 1 = road
        });

        it('should default to run for unknown modes', () => {
            const result = mapModeToStravaType('unknown-mode');
            
            expect(result.type).toBe(2); // 2 = run
            expect(result.sub_type).toBe(1); // 1 = road
        });

        it('should default to run for empty string', () => {
            const result = mapModeToStravaType('');
            
            expect(result.type).toBe(2); // 2 = run
            expect(result.sub_type).toBe(1); // 1 = road
        });
    });
});

