export async function extractShapeFromImage(file: File, numPoints: number = 1000): Promise<[number, number][]> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);

        img.onload = () => {
            const canvas = document.createElement('canvas');
            const size = 800; // Resize for easier processing
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d');

            if (!ctx) {
                reject(new Error("Could not get canvas context"));
                return;
            }

            // Draw image
            ctx.drawImage(img, 0, 0, size, size);
            ctx.drawImage(img, 0, 0, size, size);
            // const imageData = ctx.getImageData(0, 0, size, size);
            // const data = imageData.data;

            // Find edge points
            // Find edge points

            // Simple edge detection: check if pixel is dark and has a light neighbor
            const { width, height } = canvas;
            const imageData = ctx.getImageData(0, 0, width, height);
            const data = imageData.data;

            // 1. Identify all dark pixels and mark them in a 2D grid
            const grid = new Uint8Array(width * height);
            let startX = -1, startY = -1;
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
                        if (startX === -1) {
                            startX = x;
                            startY = y;
                        }
                    }
                }
            }

            if (foundPixels === 0) {
                reject(new Error("No shape found in image"));
                return;
            }

            // 2. Trace the boundary (Moore-Neighbor Tracing)
            const boundaryPoints: { x: number, y: number }[] = [];
            let cx = startX;
            let cy = startY;
            let backtrackX = startX - 1;
            let backtrackY = startY;

            // Directions: N, NE, E, SE, S, SW, W, NW
            const dx = [0, 1, 1, 1, 0, -1, -1, -1];
            const dy = [-1, -1, 0, 1, 1, 1, 0, -1];

            boundaryPoints.push({ x: cx, y: cy });

            let loops = 0;
            const maxLoops = width * height;

            while (loops < maxLoops) {
                let foundNext = false;

                // Find index of backtrack direction
                // Find index of backtrack direction
                // Optimization: check if backtrack is valid neighbor
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
                if (cx === startX && cy === startY) break;

                boundaryPoints.push({ x: cx, y: cy });
                loops++;
            }

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
