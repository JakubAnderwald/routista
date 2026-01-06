import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    calculateOtsuThreshold,
    shouldInvertDetection,
    createForegroundGrid,
    traceAllBoundaries,
    sortShapesByCentroid,
    connectShapesIntoContinuousPath,
    samplePointsFromPath,
    detectNoise,
    extractShapeFromImageData,
    ImageProcessingConfig,
} from '../../src/lib/imageProcessingCore';

// Default test configuration
const defaultConfig: ImageProcessingConfig = {
    minSignificantPoints: 10,
    noise: {
        smallComponentPoints: 50,
        tinyComponentPoints: 10,
        maxSmallComponents: 5,
    },
    otsu: {
        minThreshold: 20,
        maxThreshold: 235,
        defaultThreshold: 128,
    },
    minLightCoverageForInvert: 0.05,
};

// Helper to create RGBA pixel data
function createImageData(
    width: number,
    height: number,
    fillFn: (x: number, y: number) => [number, number, number, number]
): Uint8ClampedArray {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            const [r, g, b, a] = fillFn(x, y);
            data[idx] = r;
            data[idx + 1] = g;
            data[idx + 2] = b;
            data[idx + 3] = a;
        }
    }
    return data;
}

// Suppress console.log during tests
beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('imageProcessingCore', () => {
    describe('calculateOtsuThreshold', () => {
        it('should calculate threshold for bimodal image', () => {
            // Create an image with half black, half white pixels
            const width = 10;
            const height = 10;
            const data = createImageData(width, height, (x) => {
                const brightness = x < 5 ? 0 : 255;
                return [brightness, brightness, brightness, 255];
            });

            const threshold = calculateOtsuThreshold(data, width, height, defaultConfig.otsu);

            // Threshold should be somewhere in the middle
            expect(threshold).toBeGreaterThan(50);
            expect(threshold).toBeLessThan(200);
        });

        it('should return default threshold for uniform image', () => {
            // Create a completely black image (uniform)
            const width = 10;
            const height = 10;
            const data = createImageData(width, height, () => [0, 0, 0, 255]);

            const threshold = calculateOtsuThreshold(data, width, height, defaultConfig.otsu);

            // Should fall back to default for extreme threshold
            expect(threshold).toBe(defaultConfig.otsu.defaultThreshold);
        });

        it('should return default threshold for completely white image', () => {
            const width = 10;
            const height = 10;
            const data = createImageData(width, height, () => [255, 255, 255, 255]);

            const threshold = calculateOtsuThreshold(data, width, height, defaultConfig.otsu);

            expect(threshold).toBe(defaultConfig.otsu.defaultThreshold);
        });

        it('should handle grayscale gradient image', () => {
            const width = 256;
            const height = 1;
            // Create a gradient from 0 to 255
            const data = createImageData(width, height, (x) => [x, x, x, 255]);

            const threshold = calculateOtsuThreshold(data, width, height, defaultConfig.otsu);

            // For a uniform gradient, threshold should be near middle
            expect(threshold).toBeGreaterThan(100);
            expect(threshold).toBeLessThan(156);
        });
    });

    describe('shouldInvertDetection', () => {
        it('should return false for dark shape on light background', () => {
            // Mostly white with some black pixels
            const width = 10;
            const height = 10;
            const data = createImageData(width, height, (x, y) => {
                const isDarkShape = x >= 4 && x <= 6 && y >= 4 && y <= 6;
                const brightness = isDarkShape ? 0 : 255;
                return [brightness, brightness, brightness, 255];
            });

            const result = shouldInvertDetection(data, width, height, 128, 0.05);
            expect(result).toBe(false);
        });

        it('should return true for light shape on dark background', () => {
            // Mostly black with some white pixels
            const width = 10;
            const height = 10;
            const data = createImageData(width, height, (x, y) => {
                const isLightShape = x >= 4 && x <= 6 && y >= 4 && y <= 6;
                const brightness = isLightShape ? 255 : 0;
                return [brightness, brightness, brightness, 255];
            });

            const result = shouldInvertDetection(data, width, height, 128, 0.05);
            expect(result).toBe(true);
        });

        it('should return false when no opaque pixels', () => {
            // All transparent
            const width = 10;
            const height = 10;
            const data = createImageData(width, height, () => [128, 128, 128, 0]);

            const result = shouldInvertDetection(data, width, height, 128, 0.05);
            expect(result).toBe(false);
        });

        it('should handle transparent pixels correctly', () => {
            // Half transparent, half opaque dark
            const width = 10;
            const height = 10;
            const data = createImageData(width, height, (x) => {
                if (x < 5) return [0, 0, 0, 0]; // Transparent
                return [255, 255, 255, 255]; // Light opaque
            });

            const result = shouldInvertDetection(data, width, height, 128, 0.05);
            // All opaque pixels are light, so dark ratio is 0 - no invert
            expect(result).toBe(false);
        });

        it('should not invert when light coverage is too small', () => {
            // Mostly dark with tiny light area
            const width = 100;
            const height = 100;
            const data = createImageData(width, height, (x, y) => {
                // Only 1 pixel is light
                const isLight = x === 50 && y === 50;
                return [isLight ? 255 : 0, isLight ? 255 : 0, isLight ? 255 : 0, 255];
            });

            // minLightCoverage is 0.05 (5%), but we have only 0.01%
            const result = shouldInvertDetection(data, width, height, 128, 0.05);
            expect(result).toBe(false);
        });
    });

    describe('createForegroundGrid', () => {
        it('should detect dark pixels as foreground (normal mode)', () => {
            const width = 5;
            const height = 5;
            const data = createImageData(width, height, (x, y) => {
                // Create a small dark square in the center
                const isDark = x >= 1 && x <= 3 && y >= 1 && y <= 3;
                const brightness = isDark ? 0 : 255;
                return [brightness, brightness, brightness, 255];
            });

            const { grid, foundPixels } = createForegroundGrid(data, width, height, 128, false);

            expect(foundPixels).toBe(9); // 3x3 square
            expect(grid[1 * width + 1]).toBe(1); // Inside square
            expect(grid[0 * width + 0]).toBe(0); // Outside square
        });

        it('should detect light pixels as foreground (inverted mode)', () => {
            const width = 5;
            const height = 5;
            const data = createImageData(width, height, (x, y) => {
                // Create a small light square in the center on dark background
                const isLight = x >= 1 && x <= 3 && y >= 1 && y <= 3;
                const brightness = isLight ? 255 : 0;
                return [brightness, brightness, brightness, 255];
            });

            const { grid, foundPixels } = createForegroundGrid(data, width, height, 128, true);

            expect(foundPixels).toBe(9); // 3x3 square
            expect(grid[1 * width + 1]).toBe(1); // Inside square (light)
            expect(grid[0 * width + 0]).toBe(0); // Outside square (dark)
        });

        it('should ignore transparent pixels', () => {
            const width = 5;
            const height = 5;
            const data = createImageData(width, height, (x, y) => {
                // Center is dark but transparent, all others are dark and opaque
                const isCenter = x === 2 && y === 2;
                return [0, 0, 0, isCenter ? 0 : 255];
            });

            const { grid, foundPixels } = createForegroundGrid(data, width, height, 128, false);

            // Center is dark but transparent, so should not be detected
            expect(grid[2 * width + 2]).toBe(0);
            // All other 24 pixels are dark and opaque, so they should be detected
            expect(foundPixels).toBe(24);
        });

        it('should return empty grid for all light image', () => {
            const width = 5;
            const height = 5;
            const data = createImageData(width, height, () => [255, 255, 255, 255]);

            const { grid, foundPixels } = createForegroundGrid(data, width, height, 128, false);

            expect(foundPixels).toBe(0);
            expect(grid.every((v) => v === 0)).toBe(true);
        });
    });

    describe('traceAllBoundaries', () => {
        it('should trace boundary of a simple square', () => {
            const width = 10;
            const height = 10;
            const grid = new Uint8Array(width * height);

            // Create a 4x4 filled square at position (3,3)
            for (let y = 3; y < 7; y++) {
                for (let x = 3; x < 7; x++) {
                    grid[y * width + x] = 1;
                }
            }

            const shapes = traceAllBoundaries(grid, width, height, 5);

            expect(shapes.length).toBe(1);
            expect(shapes[0].length).toBeGreaterThan(5);
        });

        it('should find multiple separate components', () => {
            const width = 20;
            const height = 10;
            const grid = new Uint8Array(width * height);

            // Create two separate squares
            // Square 1 at (2,2) - 3x3
            for (let y = 2; y < 5; y++) {
                for (let x = 2; x < 5; x++) {
                    grid[y * width + x] = 1;
                }
            }
            // Square 2 at (15,2) - 3x3
            for (let y = 2; y < 5; y++) {
                for (let x = 15; x < 18; x++) {
                    grid[y * width + x] = 1;
                }
            }

            const shapes = traceAllBoundaries(grid, width, height, 5);

            expect(shapes.length).toBe(2);
        });

        it('should filter out small components', () => {
            const width = 10;
            const height = 10;
            const grid = new Uint8Array(width * height);

            // Create a single pixel (too small)
            grid[5 * width + 5] = 1;

            const shapes = traceAllBoundaries(grid, width, height, 10);

            expect(shapes.length).toBe(0);
        });

        it('should return empty array for empty grid', () => {
            const width = 10;
            const height = 10;
            const grid = new Uint8Array(width * height);

            const shapes = traceAllBoundaries(grid, width, height, 5);

            expect(shapes.length).toBe(0);
        });
    });

    describe('sortShapesByCentroid', () => {
        it('should sort shapes left-to-right', () => {
            const shapes = [
                [
                    { x: 100, y: 50 },
                    { x: 110, y: 50 },
                ], // Right
                [
                    { x: 10, y: 50 },
                    { x: 20, y: 50 },
                ], // Left
                [
                    { x: 50, y: 50 },
                    { x: 60, y: 50 },
                ], // Middle
            ];

            const sorted = sortShapesByCentroid(shapes);

            expect(sorted[0].centroidX).toBeLessThan(sorted[1].centroidX);
            expect(sorted[1].centroidX).toBeLessThan(sorted[2].centroidX);
        });

        it('should sort by Y when X is similar', () => {
            const shapes = [
                [
                    { x: 50, y: 100 },
                    { x: 55, y: 100 },
                ], // Bottom
                [
                    { x: 50, y: 10 },
                    { x: 55, y: 10 },
                ], // Top
                [
                    { x: 50, y: 50 },
                    { x: 55, y: 50 },
                ], // Middle
            ];

            const sorted = sortShapesByCentroid(shapes);

            // When X is similar (within 20), sort by Y
            expect(sorted[0].centroidY).toBeLessThan(sorted[1].centroidY);
            expect(sorted[1].centroidY).toBeLessThan(sorted[2].centroidY);
        });

        it('should handle empty array', () => {
            const sorted = sortShapesByCentroid([]);
            expect(sorted).toEqual([]);
        });

        it('should handle single shape', () => {
            const shapes = [
                [
                    { x: 50, y: 50 },
                    { x: 60, y: 60 },
                ],
            ];
            const sorted = sortShapesByCentroid(shapes);
            expect(sorted.length).toBe(1);
            expect(sorted[0].centroidX).toBe(55);
            expect(sorted[0].centroidY).toBe(55);
        });
    });

    describe('connectShapesIntoContinuousPath', () => {
        it('should return single shape unchanged', () => {
            const shapes = [
                {
                    points: [
                        { x: 0, y: 0 },
                        { x: 10, y: 0 },
                        { x: 10, y: 10 },
                    ],
                },
            ];

            const result = connectShapesIntoContinuousPath(shapes);

            expect(result.length).toBe(3);
            expect(result[0]).toEqual({ x: 0, y: 0 });
        });

        it('should connect multiple shapes at closest points', () => {
            const shapes = [
                {
                    points: [
                        { x: 0, y: 0 },
                        { x: 10, y: 0 },
                    ],
                },
                {
                    points: [
                        { x: 20, y: 0 },
                        { x: 30, y: 0 },
                    ],
                },
            ];

            const result = connectShapesIntoContinuousPath(shapes);

            // Should have all 4 points
            expect(result.length).toBe(4);
            // First shape's points
            expect(result[0]).toEqual({ x: 0, y: 0 });
            expect(result[1]).toEqual({ x: 10, y: 0 });
            // Second shape starts at closest point to (10,0) which is (20,0)
            expect(result[2]).toEqual({ x: 20, y: 0 });
        });

        it('should handle empty shapes array', () => {
            const result = connectShapesIntoContinuousPath([]);
            expect(result).toEqual([]);
        });
    });

    describe('samplePointsFromPath', () => {
        it('should sample correct number of points', () => {
            const points = [
                { x: 0, y: 0 },
                { x: 50, y: 0 },
                { x: 100, y: 0 },
                { x: 100, y: 50 },
                { x: 100, y: 100 },
            ];

            const result = samplePointsFromPath(points, 3, 100, 100, false);

            expect(result.length).toBe(3);
        });

        it('should close loop when requested', () => {
            const points = [
                { x: 0, y: 0 },
                { x: 100, y: 0 },
                { x: 100, y: 100 },
                { x: 0, y: 100 },
            ];

            const result = samplePointsFromPath(points, 4, 100, 100, true);

            // Should have 5 points (4 + closing point)
            expect(result.length).toBe(5);
            expect(result[0]).toEqual(result[4]); // First equals last
        });

        it('should normalize coordinates to 0-1 range', () => {
            const points = [
                { x: 50, y: 50 },
                { x: 100, y: 100 },
            ];

            const result = samplePointsFromPath(points, 2, 100, 100, false);

            expect(result[0]).toEqual([0.5, 0.5]);
            expect(result[1]).toEqual([1, 1]);
        });

        it('should handle single point path', () => {
            const points = [{ x: 50, y: 50 }];
            const result = samplePointsFromPath(points, 1, 100, 100, true);
            
            // With 1 point, should sample it and close the loop
            expect(result.length).toBe(2); // 1 sampled + 1 closing
            expect(result[0]).toEqual([0.5, 0.5]);
            expect(result[1]).toEqual([0.5, 0.5]); // Closing point is same as first
        });
    });

    describe('detectNoise', () => {
        it('should return false for valid large shape', () => {
            const shapes = [
                Array.from({ length: 100 }, (_, i) => ({ x: i, y: i })), // Large component
            ];

            const result = detectNoise(shapes, defaultConfig.noise);

            expect(result).toBe(false);
        });

        it('should return true for many small components without large one', () => {
            // Create many small components (each below smallComponentPoints)
            const shapes = Array.from({ length: 10 }, () =>
                Array.from({ length: 20 }, (_, i) => ({ x: i, y: i }))
            );

            const result = detectNoise(shapes, defaultConfig.noise);

            expect(result).toBe(true);
        });

        it('should return true when all components are tiny', () => {
            // Multiple tiny components (below tinyComponentPoints)
            const shapes = [
                [
                    { x: 0, y: 0 },
                    { x: 1, y: 1 },
                ],
                [
                    { x: 10, y: 10 },
                    { x: 11, y: 11 },
                ],
            ];

            const result = detectNoise(shapes, defaultConfig.noise);

            expect(result).toBe(true);
        });

        it('should return false when there is at least one large component', () => {
            const shapes = [
                Array.from({ length: 100 }, (_, i) => ({ x: i, y: i })), // Large
                Array.from({ length: 5 }, (_, i) => ({ x: i + 200, y: i })), // Small
            ];

            const result = detectNoise(shapes, defaultConfig.noise);

            expect(result).toBe(false);
        });

        it('should handle empty shapes array', () => {
            const result = detectNoise([], defaultConfig.noise);
            expect(result).toBe(false);
        });
    });

    describe('extractShapeFromImageData', () => {
        it('should extract shape from simple dark square on white', () => {
            const width = 50;
            const height = 50;
            const data = createImageData(width, height, (x, y) => {
                // Dark square in center
                const isDark = x >= 15 && x <= 35 && y >= 15 && y <= 35;
                return [isDark ? 0 : 255, isDark ? 0 : 255, isDark ? 0 : 255, 255];
            });

            const result = extractShapeFromImageData(data, width, height, 20, defaultConfig);

            expect(result.points.length).toBe(21); // 20 + closing point
            expect(result.componentCount).toBe(1);
            expect(result.isLikelyNoise).toBe(false);
            expect(result.isInverted).toBe(false);
        });

        it('should extract shape from light square on dark background', () => {
            const width = 50;
            const height = 50;
            const data = createImageData(width, height, (x, y) => {
                // Light square in center
                const isLight = x >= 15 && x <= 35 && y >= 15 && y <= 35;
                return [isLight ? 255 : 0, isLight ? 255 : 0, isLight ? 255 : 0, 255];
            });

            const result = extractShapeFromImageData(data, width, height, 20, defaultConfig);

            expect(result.points.length).toBe(21);
            expect(result.componentCount).toBe(1);
            expect(result.isInverted).toBe(true);
        });

        it('should throw error when no shape found', () => {
            const width = 10;
            const height = 10;
            // All white - no foreground pixels
            const data = createImageData(width, height, () => [255, 255, 255, 255]);

            expect(() => extractShapeFromImageData(data, width, height, 20, defaultConfig)).toThrow(
                'No shape found in image'
            );
        });

        it('should throw error when only noise detected', () => {
            const width = 50;
            const height = 50;
            // Scatter single dark pixels (noise-like)
            const data = createImageData(width, height, (x, y) => {
                // Only a few isolated pixels - below minSignificantPoints
                const isDark = (x === 10 && y === 10) || (x === 20 && y === 20);
                return [isDark ? 0 : 255, isDark ? 0 : 255, isDark ? 0 : 255, 255];
            });

            expect(() => extractShapeFromImageData(data, width, height, 20, defaultConfig)).toThrow(
                'No significant shape found in image'
            );
        });

        it('should detect multiple components', () => {
            const width = 100;
            const height = 50;
            const data = createImageData(width, height, (x, y) => {
                // Two separate squares
                const isSquare1 = x >= 10 && x <= 30 && y >= 10 && y <= 40;
                const isSquare2 = x >= 60 && x <= 80 && y >= 10 && y <= 40;
                const isDark = isSquare1 || isSquare2;
                return [isDark ? 0 : 255, isDark ? 0 : 255, isDark ? 0 : 255, 255];
            });

            const result = extractShapeFromImageData(data, width, height, 30, defaultConfig);

            expect(result.componentCount).toBe(2);
        });

        it('should mark noisy images correctly', () => {
            const width = 200;
            const height = 200;
            // Create multiple medium-sized shapes that will be detected as noise
            const data = createImageData(width, height, (x, y) => {
                // Create multiple separate squares, each large enough to pass minSignificantPoints
                // but small enough to be considered noise by detectNoise
                const isSquare1 = x >= 10 && x < 30 && y >= 10 && y < 30; // 20x20 = 400 pixels
                const isSquare2 = x >= 50 && x < 70 && y >= 10 && y < 30;
                const isSquare3 = x >= 90 && x < 110 && y >= 10 && y < 30;
                const isSquare4 = x >= 130 && x < 150 && y >= 10 && y < 30;
                const isSquare5 = x >= 170 && x < 190 && y >= 10 && y < 30;
                const isDark = isSquare1 || isSquare2 || isSquare3 || isSquare4 || isSquare5;
                return [isDark ? 0 : 255, isDark ? 0 : 255, isDark ? 0 : 255, 255];
            });

            const result = extractShapeFromImageData(data, width, height, 30, defaultConfig);

            // Should detect multiple components
            expect(result.componentCount).toBeGreaterThan(1);
        });
    });
});

