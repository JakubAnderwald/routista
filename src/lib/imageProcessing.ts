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

            // 5. Sample points uniformly along the path (matching Node.js behavior)
            // This ensures we get exactly numPoints evenly-spaced points
            const result: [number, number][] = [];
            for (let i = 0; i < numPoints; i++) {
                const index = Math.floor(i * combinedPoints.length / numPoints);
                const p = combinedPoints[index];
                result.push([p.x / width, p.y / height]);
            }

            // Close the loop back to start
            if (result.length > 0) {
                result.push(result[0]);
            }

            console.log(`[extractShapeFromImage] Sampled ${result.length} points (requested: ${numPoints})`);
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
