import sharp from 'sharp';

export async function extractShapeFromImageNode(filePath: string, numPoints: number = 1000): Promise<[number, number][]> {
    const { data, info } = await sharp(filePath)
        .resize(800, 800, { fit: 'fill' })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

    const { width, height, channels } = info;
    // console.log(`Image Info: ${width}x${height}, channels: ${channels}, data length: ${data.length}`);

    const points: { x: number, y: number }[] = [];
    const threshold = 128;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const a = data[i + 3];

            const brightness = (r + g + b) / 3;

            if (brightness < threshold && a > 128) {
                points.push({ x, y });
            }
        }
    }

    if (points.length === 0) {
        throw new Error("No shape found in image");
    }
    // console.log(`Found ${points.length} dark pixels`);

    // ASCII Visualization
    const gridH = 40;
    const gridW = 80;
    const grid = Array(gridH).fill(null).map(() => Array(gridW).fill('.'));

    for (const p of points) {
        const gx = Math.floor(p.x / width * gridW);
        const gy = Math.floor(p.y / height * gridH);
        if (gy >= 0 && gy < gridH && gx >= 0 && gx < gridW) {
            grid[gy][gx] = '#';
        }
    }
    // console.log("Shape Visualization:");
    // console.log(grid.map(row => row.join('')).join('\n'));

    // Sort points to form a path (same logic as client-side)
    const center = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
    center.x /= points.length;
    center.y /= points.length;
    // console.log(`Center of mass: [${center.x.toFixed(2)}, ${center.y.toFixed(2)}]`);

    const buckets = new Map<number, { x: number, y: number, r: number }>();
    const numBuckets = numPoints * 2;

    points.forEach(p => {
        const dx = p.x - center.x;
        const dy = p.y - center.y;
        const angle = Math.atan2(dy, dx);
        const radius = Math.sqrt(dx * dx + dy * dy);

        const bucketIndex = Math.floor((angle + Math.PI) / (2 * Math.PI) * numBuckets);

        const existing = buckets.get(bucketIndex);
        if (!existing || radius > existing.r) {
            buckets.set(bucketIndex, { x: p.x, y: p.y, r: radius });
        }
    });

    // 3. Collect and sort the outer points
    const sortedPoints = Array.from(buckets.values())
        .sort((a, b) => {
            const angleA = Math.atan2(a.y - center.y, a.x - center.x);
            const angleB = Math.atan2(b.y - center.y, b.x - center.x);
            return angleA - angleB;
        });

    // const sortedYs = sortedPoints.map(p => p.y);
    // console.log(`Sorted Points: ${sortedPoints.length}, Y range: [${Math.min(...sortedYs)}, ${Math.max(...sortedYs)}]`);

    const result: [number, number][] = [];
    for (let i = 0; i < numPoints; i++) {
        const index = Math.floor(i * sortedPoints.length / numPoints);
        const p = sortedPoints[index];
        result.push([p.x / width, p.y / height]);
    }

    if (result.length > 0) {
        result.push(result[0]);
    }

    return result;
}
