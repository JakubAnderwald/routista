/**
 * Core image processing algorithms - platform agnostic.
 * 
 * These pure functions work with generic ArrayLike<number> data,
 * allowing reuse between browser (Uint8ClampedArray) and Node.js (Buffer) environments.
 */

/**
 * Configuration for image processing algorithms.
 * Matches structure from @/config/image.ts
 */
export interface ImageProcessingConfig {
    minSignificantPoints: number;
    noise: {
        smallComponentPoints: number;
        tinyComponentPoints: number;
        maxSmallComponents: number;
    };
    otsu: {
        minThreshold: number;
        maxThreshold: number;
        defaultThreshold: number;
    };
    minLightCoverageForInvert: number;
}

/**
 * Result from shape extraction containing all extracted data.
 */
export interface ShapeExtractionData {
    points: [number, number][];
    componentCount: number;
    isLikelyNoise: boolean;
    threshold: number;
    isInverted: boolean;
}

/**
 * A 2D point with x and y coordinates.
 */
interface Point {
    x: number;
    y: number;
}

/**
 * Calculate optimal threshold using Otsu's method.
 * Finds the threshold that maximizes inter-class variance between foreground and background.
 * 
 * @param data - RGBA pixel data (4 bytes per pixel)
 * @param width - Image width
 * @param height - Image height
 * @param config - Otsu configuration parameters
 * @returns Optimal threshold value (0-255)
 */
export function calculateOtsuThreshold(
    data: ArrayLike<number>,
    width: number,
    height: number,
    config: ImageProcessingConfig['otsu']
): number {
    const totalPixels = width * height;
    
    // Build brightness histogram (256 bins)
    const histogram = new Array(256).fill(0);
    for (let i = 0; i < totalPixels; i++) {
        const idx = i * 4;
        const brightness = Math.floor((data[idx] + data[idx + 1] + data[idx + 2]) / 3);
        histogram[brightness]++;
    }
    
    // Calculate total mean
    let totalSum = 0;
    for (let i = 0; i < 256; i++) {
        totalSum += i * histogram[i];
    }
    
    let sumB = 0;        // Sum of background
    let wB = 0;          // Weight of background
    let maxVariance = 0;
    let optimalThreshold = config.defaultThreshold;
    
    for (let t = 0; t < 256; t++) {
        wB += histogram[t];
        if (wB === 0) continue;
        
        const wF = totalPixels - wB; // Weight of foreground
        if (wF === 0) break;
        
        sumB += t * histogram[t];
        
        const meanB = sumB / wB;
        const meanF = (totalSum - sumB) / wF;
        
        // Inter-class variance
        const variance = wB * wF * (meanB - meanF) * (meanB - meanF);
        
        if (variance > maxVariance) {
            maxVariance = variance;
            optimalThreshold = t;
        }
    }
    
    // Fallback to default if threshold is extreme (likely uniform image)
    if (optimalThreshold < config.minThreshold || optimalThreshold > config.maxThreshold) {
        console.log(`[Otsu] Extreme threshold ${optimalThreshold}, falling back to ${config.defaultThreshold}`);
        return config.defaultThreshold;
    }
    
    console.log(`[Otsu] Calculated optimal threshold: ${optimalThreshold}`);
    return optimalThreshold;
}

/**
 * Determine if we should detect dark or light pixels based on image content.
 * Returns true if we should invert (detect light pixels instead of dark).
 * 
 * @param data - RGBA pixel data
 * @param width - Image width
 * @param height - Image height
 * @param threshold - Brightness threshold
 * @param minLightCoverage - Minimum light coverage ratio to invert
 * @returns true if detection should be inverted
 */
export function shouldInvertDetection(
    data: ArrayLike<number>,
    width: number,
    height: number,
    threshold: number,
    minLightCoverage: number
): boolean {
    const totalPixels = width * height;
    let darkPixels = 0;
    let opaquePixels = 0;
    
    for (let i = 0; i < totalPixels; i++) {
        const idx = i * 4;
        const a = data[idx + 3];
        if (a <= 128) continue; // Skip transparent pixels
        
        opaquePixels++;
        const brightness = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
        if (brightness < threshold) {
            darkPixels++;
        }
    }
    
    // If no opaque pixels, don't invert
    if (opaquePixels === 0) {
        console.log(`[Detection] No opaque pixels, using default (no invert)`);
        return false;
    }
    
    // Calculate ratio among OPAQUE pixels only
    const darkRatio = darkPixels / opaquePixels;
    
    // If dark pixels are the majority (>50%) of opaque pixels, the shape is likely light-on-dark
    // We want the minority to be the foreground shape
    // But only invert if there's a significant light area (at least minLightCoverage of image)
    const lightPixels = opaquePixels - darkPixels;
    const lightCoverage = lightPixels / totalPixels;
    const shouldInvert = darkRatio > 0.5 && lightCoverage > minLightCoverage;
    
    console.log(`[Detection] Dark ratio: ${(darkRatio * 100).toFixed(1)}% of opaque, light coverage: ${(lightCoverage * 100).toFixed(1)}%, invert: ${shouldInvert}`);
    return shouldInvert;
}

/**
 * Create a binary grid marking foreground pixels.
 * 
 * @param data - RGBA pixel data
 * @param width - Image width
 * @param height - Image height
 * @param threshold - Brightness threshold
 * @param isInverted - Whether to detect light pixels instead of dark
 * @returns Object containing grid and count of foreground pixels
 */
export function createForegroundGrid(
    data: ArrayLike<number>,
    width: number,
    height: number,
    threshold: number,
    isInverted: boolean
): { grid: Uint8Array; foundPixels: number } {
    const grid = new Uint8Array(width * height);
    let foundPixels = 0;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const a = data[i + 3];
            const brightness = (r + g + b) / 3;

            // Detect dark pixels normally, or light pixels if inverted
            const isForeground = isInverted 
                ? (brightness >= threshold && a > 128)
                : (brightness < threshold && a > 128);
            
            if (isForeground) {
                grid[y * width + x] = 1;
                foundPixels++;
            }
        }
    }
    
    return { grid, foundPixels };
}

/**
 * Trace all shape boundaries using Moore-Neighbor algorithm.
 * Identifies connected components and traces their boundaries.
 * 
 * @param grid - Binary grid (1 = foreground, 0 = background)
 * @param width - Grid width
 * @param height - Grid height
 * @param minSignificantPoints - Minimum points for a component to be significant
 * @param logPrefix - Prefix for log messages
 * @returns Array of shapes, each shape is array of boundary points
 */
export function traceAllBoundaries(
    grid: Uint8Array,
    width: number,
    height: number,
    minSignificantPoints: number,
    logPrefix: string = '[traceAllBoundaries]'
): Point[][] {
    const allShapes: Point[][] = [];
    
    // Track which pixels have been assigned to a component
    const componentMap = new Uint8Array(width * height);

    // Directions: N, NE, E, SE, S, SW, W, NW
    const dx = [0, 1, 1, 1, 0, -1, -1, -1];
    const dy = [-1, -1, 0, 1, 1, 1, 0, -1];

    // Flood-fill helper to mark all connected pixels as belonging to current component
    const floodFillMark = (startX: number, startY: number, componentId: number) => {
        const stack: [number, number][] = [[startX, startY]];
        while (stack.length > 0) {
            const [fx, fy] = stack.pop()!;
            const idx = fy * width + fx;
            
            if (fx < 0 || fx >= width || fy < 0 || fy >= height) continue;
            if (grid[idx] !== 1 || componentMap[idx] !== 0) continue;
            
            componentMap[idx] = componentId;
            
            // Add 4-connected neighbors
            stack.push([fx + 1, fy]);
            stack.push([fx - 1, fy]);
            stack.push([fx, fy + 1]);
            stack.push([fx, fy - 1]);
        }
    };

    let componentId = 0;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            // Only start tracing from unassigned foreground pixels
            if (grid[y * width + x] === 1 && componentMap[y * width + x] === 0) {
                componentId++;
                
                // First, flood-fill to mark ALL pixels of this component
                floodFillMark(x, y, componentId);
                
                // Now trace the boundary
                const points: Point[] = [];
                let cx = x;
                let cy = y;
                let backtrackX = x - 1;
                let backtrackY = y;

                points.push({ x: cx, y: cy });

                let loops = 0;
                const maxLoops = width * height * 2;

                while (loops < maxLoops) {
                    let foundNext = false;

                    // Find index of backtrack direction
                    let backtrackIdx = -1;
                    for (let k = 0; k < 8; k++) {
                        if (cx + dx[k] === backtrackX && cy + dy[k] === backtrackY) {
                            backtrackIdx = k;
                            break;
                        }
                    }
                    if (backtrackIdx === -1) backtrackIdx = 6; // Default West

                    // Scan clockwise from backtrack
                    for (let j = 0; j < 8; j++) {
                        const scanIdx = (backtrackIdx + j) % 8;
                        const sx = cx + dx[scanIdx];
                        const sy = cy + dy[scanIdx];

                        if (sx >= 0 && sx < width && sy >= 0 && sy < height && grid[sy * width + sx] === 1) {
                            // Found next P
                            const prevIdx = (scanIdx + 7) % 8;
                            backtrackX = cx + dx[prevIdx];
                            backtrackY = cy + dy[prevIdx];

                            cx = sx;
                            cy = sy;
                            foundNext = true;
                            break;
                        }
                    }

                    if (!foundNext) break;
                    if (cx === x && cy === y) break; // Closed the loop

                    points.push({ x: cx, y: cy });
                    loops++;
                }

                // If this shape is significant, add to collection
                if (points.length > minSignificantPoints) {
                    allShapes.push(points);
                    console.log(`${logPrefix} Found component ${allShapes.length} with ${points.length} boundary points at ${x},${y}`);
                }
                // Continue scanning for more components (no break!)
            }
        }
    }

    return allShapes;
}

/**
 * Sort shapes by their centroid position (left-to-right, then top-to-bottom).
 * 
 * @param shapes - Array of shapes to sort
 * @returns Sorted array of shapes with centroid info
 */
export function sortShapesByCentroid(shapes: Point[][]): { points: Point[]; centroidX: number; centroidY: number }[] {
    const shapesWithCentroid = shapes.map(points => {
        const sumX = points.reduce((acc, p) => acc + p.x, 0);
        const sumY = points.reduce((acc, p) => acc + p.y, 0);
        return {
            points,
            centroidX: sumX / points.length,
            centroidY: sumY / points.length
        };
    });

    // Sort primarily by X (left-to-right), secondarily by Y (top-to-bottom)
    shapesWithCentroid.sort((a, b) => {
        const xDiff = a.centroidX - b.centroidX;
        if (Math.abs(xDiff) > 20) return xDiff; // Significant horizontal difference
        return a.centroidY - b.centroidY; // Otherwise sort by Y
    });

    return shapesWithCentroid;
}

/**
 * Connect multiple shapes into a single continuous path.
 * Finds optimal connection points between shapes.
 * 
 * @param sortedShapes - Shapes sorted by centroid
 * @returns Combined path of all points
 */
export function connectShapesIntoContinuousPath(
    sortedShapes: { points: Point[] }[]
): Point[] {
    let combinedPoints: Point[] = [];
    
    for (let i = 0; i < sortedShapes.length; i++) {
        const shape = sortedShapes[i].points;
        
        if (i === 0) {
            // First shape: add all points
            combinedPoints = [...shape];
        } else {
            // Subsequent shapes: find best connection point
            const lastPoint = combinedPoints[combinedPoints.length - 1];
            
            // Find the point in the new shape closest to our last point
            let bestIdx = 0;
            let bestDist = Infinity;
            for (let j = 0; j < shape.length; j++) {
                const dist = Math.hypot(shape[j].x - lastPoint.x, shape[j].y - lastPoint.y);
                if (dist < bestDist) {
                    bestDist = dist;
                    bestIdx = j;
                }
            }
            
            // Reorder shape to start from closest point
            const reorderedShape = [...shape.slice(bestIdx), ...shape.slice(0, bestIdx)];
            
            // Add the new shape
            combinedPoints.push(...reorderedShape);
        }
    }

    return combinedPoints;
}

/**
 * Sample points uniformly from a path.
 * 
 * @param points - Source points
 * @param numPoints - Number of points to sample
 * @param width - Image width (for normalization)
 * @param height - Image height (for normalization)
 * @param closeLoop - Whether to close the loop by adding first point at end
 * @returns Normalized sampled points (0-1 range)
 */
export function samplePointsFromPath(
    points: Point[],
    numPoints: number,
    width: number,
    height: number,
    closeLoop: boolean = true
): [number, number][] {
    const result: [number, number][] = [];
    
    for (let i = 0; i < numPoints; i++) {
        const index = Math.floor(i * points.length / numPoints);
        const p = points[index];
        result.push([p.x / width, p.y / height]);
    }

    // Close the loop back to start
    if (closeLoop && result.length > 0) {
        result.push(result[0]);
    }

    return result;
}

/**
 * Detect if the extracted shapes are likely noise rather than valid shapes.
 * 
 * @param shapes - All extracted shapes
 * @param config - Noise detection configuration
 * @returns true if shapes appear to be noise
 */
export function detectNoise(
    shapes: Point[][],
    config: ImageProcessingConfig['noise']
): boolean {
    const smallComponents = shapes.filter(s => s.length < config.smallComponentPoints);
    const hasLargeComponent = shapes.some(s => s.length >= config.smallComponentPoints);
    
    // Noise if: many small components without any large one, OR all components are tiny
    return (!hasLargeComponent && smallComponents.length > config.maxSmallComponents) || 
           (shapes.length > 1 && shapes.every(s => s.length < config.tinyComponentPoints));
}

/**
 * Extract shape from RGBA image data - main orchestration function.
 * Combines all processing steps into a single extraction pipeline.
 * 
 * @param data - RGBA pixel data
 * @param width - Image width
 * @param height - Image height
 * @param numPoints - Number of points to sample
 * @param config - Image processing configuration
 * @param logPrefix - Prefix for log messages
 * @returns Extracted shape data
 */
export function extractShapeFromImageData(
    data: ArrayLike<number>,
    width: number,
    height: number,
    numPoints: number,
    config: ImageProcessingConfig,
    logPrefix: string = '[extractShape]'
): ShapeExtractionData {
    // Calculate adaptive threshold using Otsu's method
    const threshold = calculateOtsuThreshold(data, width, height, config.otsu);
    
    // Determine if we should invert detection (for light shapes on dark backgrounds)
    const isInverted = shouldInvertDetection(data, width, height, threshold, config.minLightCoverageForInvert);
    
    // Create binary grid of foreground pixels
    const { grid, foundPixels } = createForegroundGrid(data, width, height, threshold, isInverted);
    
    console.log(`${logPrefix} Threshold: ${threshold}, Inverted: ${isInverted}, Found: ${foundPixels} pixels`);

    if (foundPixels === 0) {
        throw new Error("No shape found in image");
    }

    // Trace all boundaries
    const allShapes = traceAllBoundaries(grid, width, height, config.minSignificantPoints, logPrefix);
    
    console.log(`${logPrefix} Found ${allShapes.length} total component(s)`);

    if (allShapes.length === 0) {
        throw new Error("No significant shape found in image (noise only?)");
    }

    // Sort shapes by centroid
    const sortedShapes = sortShapesByCentroid(allShapes);
    
    // Connect shapes into continuous path
    const combinedPoints = connectShapesIntoContinuousPath(sortedShapes);
    
    console.log(`${logPrefix} Combined path has ${combinedPoints.length} points`);

    // Sample points uniformly
    const points = samplePointsFromPath(combinedPoints, numPoints, width, height, true);
    
    console.log(`${logPrefix} Sampled ${points.length} points (requested: ${numPoints})`);
    
    // Detect noise
    const isLikelyNoise = detectNoise(allShapes, config.noise);

    return {
        points,
        componentCount: allShapes.length,
        isLikelyNoise,
        threshold,
        isInverted
    };
}

