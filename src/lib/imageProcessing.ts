export async function extractShapeFromImage(file: File, numPoints: number = 1000): Promise<[number, number][]> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);

        img.onload = () => {
            const canvas = document.createElement('canvas');
            const maxDimension = 800;
            let scale = 1;

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
            // const imageData = ctx.getImageData(0, 0, size, size);
            // const data = imageData.data;

            // Find edge points
            // Find edge points

            // Simple edge detection: check if pixel is dark and has a light neighbor
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

            // 2. Trace the boundary (Moore-Neighbor Tracing)
            // We scan for a starting point and try to trace. If the trace is too short (noise), we continue looking.
            let boundaryPoints: { x: number, y: number }[] = [];

            // Keep track of visited starting pixels to avoid re-tracing the same noise
            const visitedStart = new Uint8Array(width * height);

            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    if (grid[y * width + x] === 1 && visitedStart[y * width + x] === 0) {
                        // Found a potential start point
                        const points: { x: number, y: number }[] = [];
                        let cx = x;
                        let cy = y;
                        let backtrackX = x - 1;
                        let backtrackY = y;

                        points.push({ x: cx, y: cy });

                        let loops = 0;
                        // Limit loops to prevent infinite loop, but allow enough for large shapes
                        const maxLoops = width * height * 2;

                        // Directions: N, NE, E, SE, S, SW, W, NW
                        const dx = [0, 1, 1, 1, 0, -1, -1, -1];
                        const dy = [-1, -1, 0, 1, 1, 1, 0, -1];

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

                        // If this shape is significant, use it
                        if (points.length > 50) { // Threshold for "valid shape"
                            boundaryPoints = points;
                            console.log(`[extractShapeFromImage] Found valid shape with ${points.length} points at ${x},${y}`);
                            break;
                        } else {
                            console.log(`[extractShapeFromImage] Ignored noise/small shape with ${points.length} points at ${x},${y}`);
                            // Mark these points as visited so we don't try them again? 
                            // Actually, just marking the start is enough for the outer loop, 
                            // but ideally we'd mark all. For now, simple scan is fine.
                        }
                    }
                }
                if (boundaryPoints.length > 0) break;
            }

            if (boundaryPoints.length === 0) {
                console.warn("[extractShapeFromImage] No significant shape found, using fallback (first pixel)");
                reject(new Error("No significant shape found in image (noise only?)"));
                return;
            }

            // 3. Simplify points using Douglas-Peucker algorithm
            // This reduces points on straight lines, keeping only "turns"
            const epsilon = 5; // Tolerance in pixels. Higher = simpler shape.
            const simplifiedPoints = simplifyPoints(boundaryPoints, epsilon);
            console.log(`[extractShapeFromImage] Simplified ${boundaryPoints.length} points to ${simplifiedPoints.length} points`);

            // 4. Normalize points
            const result: [number, number][] = simplifiedPoints.map(p => [p.x / width, p.y / height]);

            // Ensure loop is closed if it was closed before
            // M NT usually produces a loop, but let's make sure the last point connects to first if distinct
            if (result.length > 2) {
                const first = result[0];
                const last = result[result.length - 1];
                const dist = Math.hypot(first[0] - last[0], first[1] - last[1]);
                if (dist > 0.01) {
                    result.push(first);
                }
            }

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
