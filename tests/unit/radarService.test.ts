import { describe, it, expect } from 'vitest';
import { hashCoordinates } from '../../src/lib/radarService';

describe('radarService', () => {
    describe('hashCoordinates', () => {
        it('should return consistent hash for same coordinates', () => {
            const coords: [number, number][] = [
                [51.505, -0.09],
                [51.506, -0.08],
            ];

            const hash1 = hashCoordinates(coords);
            const hash2 = hashCoordinates(coords);

            expect(hash1).toBe(hash2);
        });

        it('should return different hashes for different coordinates', () => {
            const coords1: [number, number][] = [[51.505, -0.09]];
            const coords2: [number, number][] = [[51.506, -0.09]];

            const hash1 = hashCoordinates(coords1);
            const hash2 = hashCoordinates(coords2);

            expect(hash1).not.toBe(hash2);
        });

        it('should return a base36 string', () => {
            const coords: [number, number][] = [[51.505, -0.09]];
            const hash = hashCoordinates(coords);

            // Base36 contains only 0-9 and a-z
            expect(hash).toMatch(/^[0-9a-z]+$/);
        });

        it('should handle empty array', () => {
            const hash = hashCoordinates([]);

            // Should return a valid hash (from empty string)
            expect(typeof hash).toBe('string');
            expect(hash.length).toBeGreaterThan(0);
        });

        it('should handle single coordinate', () => {
            const coords: [number, number][] = [[0, 0]];
            const hash = hashCoordinates(coords);

            expect(typeof hash).toBe('string');
            expect(hash.length).toBeGreaterThan(0);
        });

        it('should round coordinates to 5 decimal places', () => {
            // These should produce the same hash due to rounding
            const coords1: [number, number][] = [[51.5050001, -0.09000001]];
            const coords2: [number, number][] = [[51.5050002, -0.09000002]];

            const hash1 = hashCoordinates(coords1);
            const hash2 = hashCoordinates(coords2);

            // With 5 decimal place rounding, these tiny differences should be ignored
            expect(hash1).toBe(hash2);
        });

        it('should produce different hashes for coordinates differing at 5th decimal', () => {
            // These differ at the 5th decimal place
            const coords1: [number, number][] = [[51.50500, -0.09000]];
            const coords2: [number, number][] = [[51.50501, -0.09000]];

            const hash1 = hashCoordinates(coords1);
            const hash2 = hashCoordinates(coords2);

            // Should produce different hashes
            expect(hash1).not.toBe(hash2);
        });

        it('should handle negative coordinates', () => {
            const coords: [number, number][] = [
                [-33.8688, 151.2093], // Sydney
                [-34.6037, -58.3816], // Buenos Aires
            ];

            const hash = hashCoordinates(coords);

            expect(typeof hash).toBe('string');
            expect(hash.length).toBeGreaterThan(0);
        });

        it('should handle large coordinate arrays', () => {
            // Generate 100 coordinates
            const coords: [number, number][] = Array.from({ length: 100 }, (_, i) => [
                51.5 + i * 0.001,
                -0.09 + i * 0.001,
            ]);

            const hash = hashCoordinates(coords);

            expect(typeof hash).toBe('string');
            expect(hash.length).toBeGreaterThan(0);
        });

        it('should be order-sensitive', () => {
            const coords1: [number, number][] = [
                [51.505, -0.09],
                [51.506, -0.08],
            ];
            const coords2: [number, number][] = [
                [51.506, -0.08],
                [51.505, -0.09],
            ];

            const hash1 = hashCoordinates(coords1);
            const hash2 = hashCoordinates(coords2);

            // Different order should produce different hash
            expect(hash1).not.toBe(hash2);
        });
    });
});

