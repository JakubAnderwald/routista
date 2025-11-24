import sharp from 'sharp';

export async function extractShapeFromImageNode(filePath: string, numPoints: number = 1000): Promise<[number, number][]> {
    const { data, info } = await sharp(filePath)
        .resize(800, 800, { fit: 'fill' })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

    const { width, height } = info;
    // console.log(`Image Info: ${width}x${height}, channels: ${channels}, data length: ${data.length}`);

    const threshold = 128;

    // 1. Identify all dark pixels and mark them in a 2D grid for fast lookup
    const grid = new Uint8Array(width * height);
    const visited = new Uint8Array(width * height);
    let startX = -1, startY = -1;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const a = data[i + 3];
            const brightness = (r + g + b) / 3;

            if (brightness < threshold && a > 128) {
                grid[y * width + x] = 1;
                if (startX === -1) {
                    startX = x;
                    startY = y;
                }
            }
        }
    }

    if (startX === -1) {
        throw new Error("No shape found in image");
    }

    // 2. Trace the boundary (Moore-Neighbor Tracing)
    const boundaryPoints: { x: number, y: number }[] = [];
    let cx = startX;
    let cy = startY;
    let backtrackX = startX - 1; // Start coming from the left
    let backtrackY = startY;

    // Directions: N, NE, E, SE, S, SW, W, NW
    const dx = [0, 1, 1, 1, 0, -1, -1, -1];
    const dy = [-1, -1, 0, 1, 1, 1, 0, -1];

    // Find the first boundary point (P0)
    boundaryPoints.push({ x: cx, y: cy });
    visited[cy * width + cx] = 1;

    let loops = 0;
    const maxLoops = width * height; // Safety break

    while (loops < maxLoops) {
        let foundNext = false;

        // Search neighbors in clockwise order
        // We need to start searching from the neighbor *after* the one we came from (backtrack)
        // Actually, Moore-Neighbor starts from the pixel we entered *from* (backtrack) and goes clockwise.

        // Find index of backtrack direction
        let startDir = 0;
        for (let i = 0; i < 8; i++) {
            if (cx + dx[i] === backtrackX && cy + dy[i] === backtrackY) {
                startDir = i;
                break;
            }
        }

        // Scan clockwise
        for (let i = 0; i < 8; i++) {
            const dir = (startDir + i) % 8;
            const nx = cx + dx[dir];
            const ny = cy + dy[dir];

            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                if (grid[ny * width + nx] === 1) {
                    // Found next boundary pixel
                    // Update backtrack to be the current pixel (relative to the new one)
                    // Actually, backtrack for the *next* step is the neighbor *before* the one we found?
                    // Standard Moore: Backtrack is the previous white pixel.
                    // Here we just set backtrack to the current pixel `cx, cy`? 
                    // No, we need to enter the new pixel `nx, ny` from `cx, cy`? 
                    // Let's simplify: Backtrack is `cx, cy`. 
                    // But we need to start search from the "white" pixel we just skipped over.
                    // The "white" pixel is the one at `(dir - 1)`?

                    backtrackX = cx + dx[(dir + 6) % 8]; // Approx "previous" neighbor
                    backtrackY = cy + dy[(dir + 6) % 8]; // (dir - 2) mod 8 in 8-connectivity?

                    // Actually, let's just use a simpler "always look left" or standard implementation.
                    // Standard: Start from backtrack. Rotate clockwise until black.
                    // The black pixel is the next current. The pixel *before* it (clockwise) is the new backtrack.

                    // Let's re-implement strictly:
                    // 1. Start with B = backtrack (white), P = current (black).
                    // 2. Search neighbors of P starting from B, clockwise.
                    // 3. First black neighbor is P_next. The neighbor immediately preceding it is B_next.

                    // We need to find the actual backtrack index in the neighbor list
                    let backtrackIdx = -1;
                    for (let k = 0; k < 8; k++) {
                        if (cx + dx[k] === backtrackX && cy + dy[k] === backtrackY) {
                            backtrackIdx = k;
                            break;
                        }
                    }
                    // If backtrack is not a neighbor (e.g. first point), assume West
                    if (backtrackIdx === -1) backtrackIdx = 6; // West

                    // Scan clockwise from backtrack
                    for (let j = 0; j < 8; j++) {
                        const scanIdx = (backtrackIdx + j) % 8;
                        const sx = cx + dx[scanIdx];
                        const sy = cy + dy[scanIdx];

                        if (sx >= 0 && sx < width && sy >= 0 && sy < height && grid[sy * width + sx] === 1) {
                            // Found next P
                            const prevIdx = (scanIdx + 7) % 8; // The one before (counter-clockwise) or after?
                            // We scanned clockwise. The one before `scanIdx` was white (or we would have stopped).
                            // So B_next is the neighbor at `(scanIdx - 1)` (modulo 8).
                            // In our array `(scanIdx + 7) % 8`.

                            backtrackX = cx + dx[prevIdx];
                            backtrackY = cy + dy[prevIdx];

                            cx = sx;
                            cy = sy;
                            foundNext = true;
                            break;
                        }
                    }
                    break; // Break the outer loop (we found next pixel)
                }
            }
        }

        if (!foundNext) {
            // Isolated pixel or end of line
            break;
        }

        // Stop if we closed the loop
        if (cx === startX && cy === startY) {
            break;
        }

        boundaryPoints.push({ x: cx, y: cy });
        loops++;
    }

    console.log(`Traced boundary: ${boundaryPoints.length} points`);

    // 3. Sample points evenly
    const result: [number, number][] = [];
    for (let i = 0; i < numPoints; i++) {
        const index = Math.floor(i * boundaryPoints.length / numPoints);
        const p = boundaryPoints[index];
        result.push([p.x / width, p.y / height]);
    }

    if (result.length > 0) {
        result.push(result[0]); // Close the loop
    }

    return result;
}
