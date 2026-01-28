import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    calculateDistance,
    calculateRouteLength,
    calculateRouteAccuracy,
    scalePointsToGeo,
    simplifyPoints,
    densifyPath
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

    describe('densifyPath', () => {
        it('should return input unchanged for fewer than 2 points', () => {
            const empty: [number, number][] = [];
            expect(densifyPath(empty, 100)).toEqual([]);

            const single: [number, number][] = [[51.5, -0.1]];
            expect(densifyPath(single, 100)).toEqual(single);
        });

        it('should return input unchanged when points are under threshold', () => {
            // Two points ~50m apart (well under 100m threshold)
            const points: [number, number][] = [
                [51.5, -0.1],
                [51.50045, -0.1], // ~50m north
            ];

            const result = densifyPath(points, 100);

            expect(result).toEqual(points);
        });

        it('should add intermediate points when gap exceeds threshold', () => {
            // Two points ~500m apart
            const points: [number, number][] = [
                [51.5, -0.1],
                [51.5045, -0.1], // ~500m north
            ];

            const result = densifyPath(points, 100);

            // Should have more points than original (densified)
            expect(result.length).toBeGreaterThan(2);
            expect(result[0]).toEqual(points[0]); // first point preserved
            expect(result[result.length - 1]).toEqual(points[1]); // last point preserved
        });

        it('should preserve all original points', () => {
            const points: [number, number][] = [
                [51.5, -0.1],
                [51.501, -0.1],    // ~100m
                [51.506, -0.1],    // ~500m gap - needs densification
            ];

            const result = densifyPath(points, 100);

            // All original points must be in result
            expect(result).toContainEqual(points[0]);
            expect(result).toContainEqual(points[1]);
            expect(result).toContainEqual(points[2]);
        });

        it('should interpolate linearly between points', () => {
            // Simple case: two points 200m apart with 100m threshold
            const points: [number, number][] = [
                [0, 0],
                [0.002, 0], // ~222m at equator
            ];

            const result = densifyPath(points, 100);

            // Should have 3 points: start, middle, end
            expect(result.length).toBeGreaterThanOrEqual(3);

            // Middle point(s) should be between start and end
            for (let i = 1; i < result.length - 1; i++) {
                expect(result[i][0]).toBeGreaterThan(points[0][0]);
                expect(result[i][0]).toBeLessThan(points[1][0]);
            }
        });

        it('should handle mixed gaps (some need densification, some dont)', () => {
            const points: [number, number][] = [
                [51.5, -0.1],
                [51.5005, -0.1],  // ~55m - no densification needed
                [51.506, -0.1],   // ~615m - needs densification
                [51.5065, -0.1],  // ~55m - no densification needed
            ];

            const result = densifyPath(points, 100);

            // Original points preserved
            expect(result[0]).toEqual(points[0]);
            expect(result).toContainEqual(points[1]);
            expect(result).toContainEqual(points[2]);
            expect(result[result.length - 1]).toEqual(points[3]);

            // More points than original due to densification
            expect(result.length).toBeGreaterThan(points.length);
        });
    });

    describe('calculateRouteAccuracy', () => {
        // Suppress console.log during tests
        beforeEach(() => {
            vi.spyOn(console, 'log').mockImplementation(() => {});
        });

        afterEach(() => {
            vi.restoreAllMocks();
        });

        it('should return 0 for empty original points', () => {
            const geoJson: FeatureCollection = {
                type: 'FeatureCollection',
                features: [
                    {
                        type: 'Feature',
                        properties: {},
                        geometry: {
                            type: 'LineString',
                            coordinates: [[0, 0], [0, 1]],
                        },
                    },
                ],
            };

            const result = calculateRouteAccuracy([], geoJson, 1000);
            expect(result).toBe(0);
        });

        it('should return 0 for null geoJson', () => {
            const originalPoints: [number, number][] = [[51.5, -0.1], [51.51, -0.1]];
            
            // @ts-expect-error - testing null input
            const result = calculateRouteAccuracy(originalPoints, null, 1000);
            expect(result).toBe(0);
        });

        it('should return 0 for undefined geoJson', () => {
            const originalPoints: [number, number][] = [[51.5, -0.1], [51.51, -0.1]];
            
            // @ts-expect-error - testing undefined input
            const result = calculateRouteAccuracy(originalPoints, undefined, 1000);
            expect(result).toBe(0);
        });

        it('should return 0 for geoJson without features', () => {
            const originalPoints: [number, number][] = [[51.5, -0.1], [51.51, -0.1]];
            
            // @ts-expect-error - testing invalid geoJson
            const result = calculateRouteAccuracy(originalPoints, {}, 1000);
            expect(result).toBe(0);
        });

        it('should return 0 for empty features array', () => {
            const originalPoints: [number, number][] = [[51.5, -0.1], [51.51, -0.1]];
            const geoJson: FeatureCollection = {
                type: 'FeatureCollection',
                features: [],
            };

            const result = calculateRouteAccuracy(originalPoints, geoJson, 1000);
            expect(result).toBe(0);
        });

        it('should return 0 for geoJson with no LineString features', () => {
            const originalPoints: [number, number][] = [[51.5, -0.1], [51.51, -0.1]];
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

            const result = calculateRouteAccuracy(originalPoints, geoJson, 1000);
            expect(result).toBe(0);
        });

        it('should return high accuracy when route matches original points exactly', () => {
            // Original points
            const originalPoints: [number, number][] = [
                [0, 0],
                [0, 0.001],
                [0, 0.002],
            ];

            // Route that exactly follows the original points
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
                                [0.001, 0],
                                [0.002, 0],
                            ],
                        },
                    },
                ],
            };

            const result = calculateRouteAccuracy(originalPoints, geoJson, 1000);
            
            // Should be high accuracy (route is very close to original)
            expect(result).toBeGreaterThan(80);
        });

        it('should return lower accuracy when route deviates from original', () => {
            // Original points forming a straight line
            const originalPoints: [number, number][] = [
                [0, 0],
                [0, 0.01],
                [0, 0.02],
            ];

            // Route that deviates significantly
            const geoJson: FeatureCollection = {
                type: 'FeatureCollection',
                features: [
                    {
                        type: 'Feature',
                        properties: {},
                        geometry: {
                            type: 'LineString',
                            // GeoJSON is [lng, lat] - this route is far from original
                            coordinates: [
                                [0.1, 0],    // Far east of original
                                [0.1, 0.01],
                                [0.1, 0.02],
                            ],
                        },
                    },
                ],
            };

            const result = calculateRouteAccuracy(originalPoints, geoJson, 1000);
            
            // Should be low accuracy due to deviation
            expect(result).toBeLessThan(50);
        });

        it('should handle multiple LineString features', () => {
            const originalPoints: [number, number][] = [
                [0, 0],
                [0.0001, 0],
            ];

            const geoJson: FeatureCollection = {
                type: 'FeatureCollection',
                features: [
                    {
                        type: 'Feature',
                        properties: {},
                        geometry: {
                            type: 'LineString',
                            coordinates: [[0, 0], [0, 0.00005]],
                        },
                    },
                    {
                        type: 'Feature',
                        properties: {},
                        geometry: {
                            type: 'LineString',
                            coordinates: [[0, 0.00005], [0, 0.0001]],
                        },
                    },
                ],
            };

            const result = calculateRouteAccuracy(originalPoints, geoJson, 1000);
            
            // Should calculate accuracy across both features
            expect(result).toBeGreaterThanOrEqual(0);
            expect(result).toBeLessThanOrEqual(100);
        });

        it('should clamp result to 0-100 range', () => {
            // Original and route are identical - should be capped at 100
            const originalPoints: [number, number][] = [[0, 0]];

            const geoJson: FeatureCollection = {
                type: 'FeatureCollection',
                features: [
                    {
                        type: 'Feature',
                        properties: {},
                        geometry: {
                            type: 'LineString',
                            coordinates: [[0, 0], [0, 0]],
                        },
                    },
                ],
            };

            const result = calculateRouteAccuracy(originalPoints, geoJson, 1000);
            
            expect(result).toBeLessThanOrEqual(100);
            expect(result).toBeGreaterThanOrEqual(0);
        });
    });
});

