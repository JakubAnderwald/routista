// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function extractShapeFromImage(file: File, numPoints: number = 1000): Promise<[number, number][]> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);

        img.onload = () => {
            const canvas = document.createElement('canvas');
            const maxDimension = 800;
            let scale = 1;

            // Preserve aspect ratio when scaling
            if (img.width > maxDimension || img.height > maxDimension) {
                scale = Math.min(maxDimension / img.width, maxDimension / img.height);
            }

            canvas.width = Math.floor(img.width * scale);
            canvas.height = Math.floor(img.height * scale);
            const ctx = canvas.getContext('2d');

            if (!ctx) {
                reject(new Error("Could not get canvas context"));
                return;
            }

            // Draw image preserving aspect ratio
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            const { width, height } = canvas;
            const imageData = ctx.getImageData(0, 0, width, height);
            const data = imageData.data;

            // Identify all dark pixels and mark them in a 2D grid
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

                    if (brightness < 128 && a > 128) {
                        grid[y * width + x] = 1;
                        foundPixels++;
                    }
                }
            }

            if (foundPixels === 0) {
                reject(new Error("No shape found in image"));
                return;
            }

            // 2. Trace ALL boundaries (Moore-Neighbor Tracing for multiple components)
            const allShapes: { x: number, y: number }[][] = [];
            
            // Track which pixels have been assigned to a component (not just traced)
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
                    // Only start tracing from unassigned dark pixels
                    if (grid[y * width + x] === 1 && componentMap[y * width + x] === 0) {
                        componentId++;
                        
                        // First, flood-fill to mark ALL pixels of this component
                        floodFillMark(x, y, componentId);
                        
                        // Now trace the boundary
                        const points: { x: number, y: number }[] = [];
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

                        // If this shape is significant (>50 points), add to collection
                        if (points.length > 50) {
                            allShapes.push(points);
                            console.log(`[extractShapeFromImage] Found component ${allShapes.length} with ${points.length} boundary points at ${x},${y}`);
                        }
                        // Continue scanning for more components (no break!)
                    }
                }
            }

            console.log(`[extractShapeFromImage] Found ${allShapes.length} total component(s)`);

            if (allShapes.length === 0) {
                console.warn("[extractShapeFromImage] No significant shape found");
                reject(new Error("No significant shape found in image (noise only?)"));
                return;
            }

            // 3. Sort shapes by centroid (left-to-right, then top-to-bottom)
            const shapesWithCentroid = allShapes.map(points => {
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

            // 4. Connect shapes into a single continuous path
            let combinedPoints: { x: number, y: number }[] = [];
            
            for (let i = 0; i < shapesWithCentroid.length; i++) {
                const shape = shapesWithCentroid[i].points;
                
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
                    
                    // Add connecting segment (jump) and the new shape
                    combinedPoints.push(...reorderedShape);
                }
            }

            console.log(`[extractShapeFromImage] Combined path has ${combinedPoints.length} points`);

            // 5. Simplify points using Douglas-Peucker algorithm
            // This reduces points on straight lines, keeping only "turns"
            // Note: epsilon=5 pixels is a balance between noise reduction and detail preservation
            // For a 800px canvas, 5px ≈ 0.6% tolerance
            const epsilon = 5; // Tolerance in pixels. Higher = simpler shape.
            const simplifiedPoints = simplifyPoints(combinedPoints, epsilon);
            
            console.log(`[extractShapeFromImage] Simplification: ${combinedPoints.length} → ${simplifiedPoints.length} points (epsilon: ${epsilon}px)`);
            console.log(`[extractShapeFromImage] Shape bounds: x=[${Math.min(...simplifiedPoints.map(p => p.x)).toFixed(0)}, ${Math.max(...simplifiedPoints.map(p => p.x)).toFixed(0)}], y=[${Math.min(...simplifiedPoints.map(p => p.y)).toFixed(0)}, ${Math.max(...simplifiedPoints.map(p => p.y)).toFixed(0)}]`);

            // 6. Normalize points
            const result: [number, number][] = simplifiedPoints.map(p => [p.x / width, p.y / height]);

            // Ensure loop is closed
            if (result.length > 2) {
                const first = result[0];
                const last = result[result.length - 1];
                const dist = Math.hypot(first[0] - last[0], first[1] - last[1]);
                const isClosed = dist <= 0.01;
                if (!isClosed) {
                    result.push(first);
                }
                console.log(`[extractShapeFromImage] Shape type: ${isClosed ? 'closed loop' : 'open shape'} (start-end distance: ${(dist * 100).toFixed(1)}%)`);
            }

            console.log(`[extractShapeFromImage] Final output: ${result.length} normalized points`);
            URL.revokeObjectURL(url);
            resolve(result);
        };

        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error("Failed to load image"));
        };

        img.src = url;
    });
}

// Douglas-Peucker Simplification
function simplifyPoints(points: { x: number, y: number }[], epsilon: number): { x: number, y: number }[] {
    if (points.length <= 2) return points;

    let dmax = 0;
    let index = 0;
    const end = points.length - 1;

    for (let i = 1; i < end; i++) {
        const d = perpendicularDistance(points[i], points[0], points[end]);
        if (d > dmax) {
            index = i;
            dmax = d;
        }
    }

    if (dmax > epsilon) {
        const recResults1 = simplifyPoints(points.slice(0, index + 1), epsilon);
        const recResults2 = simplifyPoints(points.slice(index), epsilon);

        // Build the result list
        return [...recResults1.slice(0, recResults1.length - 1), ...recResults2];
    } else {
        return [points[0], points[end]];
    }
}

function perpendicularDistance(point: { x: number, y: number }, lineStart: { x: number, y: number }, lineEnd: { x: number, y: number }): number {
    let dx = lineEnd.x - lineStart.x;
    let dy = lineEnd.y - lineStart.y;

    // Normalize
    const mag = Math.hypot(dx, dy);
    if (mag > 0) {
        dx /= mag;
        dy /= mag;
    }

    const pvx = point.x - lineStart.x;
    const pvy = point.y - lineStart.y;

    // Project point onto line (scaling factor)
    const pvdot = pvx * dx + pvy * dy;

    // Clamped projection
    // For general DP, we usually consider the infinite line, but for polygons segment logic is safer.
    // However, standard DP uses line distance.
    const dsx = pvx - pvdot * dx;
    const dsy = pvy - pvdot * dy;

    return Math.hypot(dsx, dsy);
}
