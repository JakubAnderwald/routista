import { describe, it, expect } from 'vitest';
import { 
    calculateDistance, 
    calculateRouteLength, 
    scalePointsToGeo,
    simplifyPoints 
} from '../../src/lib/geoUtils';
import { FeatureCollection } from 'geojson';

describe('geoUtils', () => {
    describe('calculateDistance', () => {
        it('should return 0 for same point', () => {
            const point: [number, number] = [51.505, -0.09];
            expect(calculateDistance(point, point)).toBe(0);
        });

        it('should calculate distance between two points in London', () => {
            // Tower Bridge to Big Ben - approximately 2.5km
            const towerBridge: [number, number] = [51.5055, -0.0754];
            const bigBen: [number, number] = [51.5007, -0.1246];
            
            const distance = calculateDistance(towerBridge, bigBen);
            
            // Should be around 3.4km (within 10% tolerance)
            expect(distance).toBeGreaterThan(3000);
            expect(distance).toBeLessThan(4000);
        });

        it('should calculate distance across the equator', () => {
            const north: [number, number] = [1, 0];
            const south: [number, number] = [-1, 0];
            
            const distance = calculateDistance(north, south);
            
            // 2 degrees of latitude ≈ 222km
            expect(distance).toBeGreaterThan(200000);
            expect(distance).toBeLessThan(250000);
        });

        it('should handle antipodal points', () => {
            const london: [number, number] = [51.5, 0];
            const antipode: [number, number] = [-51.5, 180];
            
            const distance = calculateDistance(london, antipode);
            
            // Should be approximately half Earth's circumference (~20,000km)
            expect(distance).toBeGreaterThan(19000000);
            expect(distance).toBeLessThan(21000000);
        });
    });

    describe('calculateRouteLength', () => {
        it('should return 0 for null input', () => {
            // @ts-expect-error - testing null input
            expect(calculateRouteLength(null)).toBe(0);
        });

        it('should return 0 for undefined input', () => {
            // @ts-expect-error - testing undefined input
            expect(calculateRouteLength(undefined)).toBe(0);
        });

        it('should return 0 for object without features', () => {
            // @ts-expect-error - testing invalid input
            expect(calculateRouteLength({})).toBe(0);
        });

        it('should return 0 for empty features array', () => {
            const geoJson: FeatureCollection = {
                type: 'FeatureCollection',
                features: [],
            };
            expect(calculateRouteLength(geoJson)).toBe(0);
        });

        it('should calculate length of a simple LineString', () => {
            // Two points ~111km apart (1 degree of latitude at equator)
            const geoJson: FeatureCollection = {
                type: 'FeatureCollection',
                features: [
                    {
                        type: 'Feature',
                        properties: {},
                        geometry: {
                            type: 'LineString',
                            // GeoJSON is [lng, lat]
                            coordinates: [
                                [0, 0],
                                [0, 1],
                            ],
                        },
                    },
                ],
            };

            const length = calculateRouteLength(geoJson);
            
            // 1 degree of latitude ≈ 111km
            expect(length).toBeGreaterThan(100000);
            expect(length).toBeLessThan(120000);
        });

        it('should calculate length of multi-segment LineString', () => {
            const geoJson: FeatureCollection = {
                type: 'FeatureCollection',
                features: [
                    {
                        type: 'Feature',
                        properties: {},
                        geometry: {
                            type: 'LineString',
                            // 3 points forming an L shape
                            coordinates: [
                                [0, 0],
                                [0, 1],  // 1 degree north
                                [1, 1],  // 1 degree east (at lat 1)
                            ],
                        },
                    },
                ],
            };

            const length = calculateRouteLength(geoJson);
            
            // Should be approximately 2 * 111km = 222km
            expect(length).toBeGreaterThan(200000);
            expect(length).toBeLessThan(250000);
        });

        it('should sum lengths of multiple LineString features', () => {
            const geoJson: FeatureCollection = {
                type: 'FeatureCollection',
                features: [
                    {
                        type: 'Feature',
                        properties: {},
                        geometry: {
                            type: 'LineString',
                            coordinates: [
                                [0, 0],
                                [0, 1],
                            ],
                        },
                    },
                    {
                        type: 'Feature',
                        properties: {},
                        geometry: {
                            type: 'LineString',
                            coordinates: [
                                [0, 1],
                                [0, 2],
                            ],
                        },
                    },
                ],
            };

            const length = calculateRouteLength(geoJson);
            
            // Should be approximately 2 * 111km = 222km
            expect(length).toBeGreaterThan(200000);
            expect(length).toBeLessThan(250000);
        });

        it('should ignore non-LineString geometry types', () => {
            const geoJson: FeatureCollection = {
                type: 'FeatureCollection',
                features: [
                    {
                        type: 'Feature',
                        properties: {},
                        geometry: {
                            type: 'Point',
                            coordinates: [0, 0],
                        },
                    },
                ],
            };

            expect(calculateRouteLength(geoJson)).toBe(0);
        });

        it('should return 0 for single-point LineString', () => {
            const geoJson: FeatureCollection = {
                type: 'FeatureCollection',
                features: [
                    {
                        type: 'Feature',
                        properties: {},
                        geometry: {
                            type: 'LineString',
                            coordinates: [[0, 0]],
                        },
                    },
                ],
            };

            expect(calculateRouteLength(geoJson)).toBe(0);
        });
    });

    describe('scalePointsToGeo', () => {
        it('should map corner points correctly', () => {
            const center: [number, number] = [0, 0];
            const radius = 1000; // 1km

            // Test center point
            const centerResult = scalePointsToGeo([[0.5, 0.5]], center, radius);
            expect(centerResult[0][0]).toBeCloseTo(0, 3); // lat
            expect(centerResult[0][1]).toBeCloseTo(0, 3); // lng
        });

        it('should handle empty points array', () => {
            const result = scalePointsToGeo([], [51.5, -0.1], 1000);
            expect(result).toEqual([]);
        });

        it('should scale points symmetrically around center', () => {
            const center: [number, number] = [51.5, -0.1];
            const radius = 1000;

            // Top-left (0,0) and bottom-right (1,1) should be equidistant from center
            const points: [number, number][] = [[0, 0], [1, 1]];
            const result = scalePointsToGeo(points, center, radius);

            // Top-left should have higher lat (north) and lower lng (west)
            expect(result[0][0]).toBeGreaterThan(center[0]);
            expect(result[0][1]).toBeLessThan(center[1]);

            // Bottom-right should have lower lat (south) and higher lng (east)
            expect(result[1][0]).toBeLessThan(center[0]);
            expect(result[1][1]).toBeGreaterThan(center[1]);
        });
    });

    describe('simplifyPoints', () => {
        it('should return input unchanged for 2 or fewer points', () => {
            const twoPoints: [number, number][] = [[0, 0], [1, 1]];
            expect(simplifyPoints(twoPoints, 0.001)).toEqual(twoPoints);

            const onePoint: [number, number][] = [[0, 0]];
            expect(simplifyPoints(onePoint, 0.001)).toEqual(onePoint);

            const empty: [number, number][] = [];
            expect(simplifyPoints(empty, 0.001)).toEqual(empty);
        });

        it('should simplify a straight line to just endpoints', () => {
            // Points on a straight line
            const points: [number, number][] = [
                [0, 0],
                [0.5, 0.5],
                [1, 1],
            ];

            const result = simplifyPoints(points, 0.1);

            // Should reduce to just start and end
            expect(result.length).toBe(2);
            expect(result[0]).toEqual([0, 0]);
            expect(result[1]).toEqual([1, 1]);
        });

        it('should preserve points that deviate significantly', () => {
            // Triangle shape - middle point deviates from line
            const points: [number, number][] = [
                [0, 0],
                [0.5, 1],  // Significantly off the line from (0,0) to (1,0)
                [1, 0],
            ];

            const result = simplifyPoints(points, 0.001);

            // Should preserve all 3 points due to significant deviation
            expect(result.length).toBe(3);
        });
    });
});

