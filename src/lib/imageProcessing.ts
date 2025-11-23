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
            const imageData = ctx.getImageData(0, 0, size, size);
            const data = imageData.data;

            // Find edge points
            const points: { x: number, y: number }[] = [];
            const threshold = 128;

            // Simple edge detection: check if pixel is dark and has a light neighbor
            // Or just find all dark pixels if it's a line drawing
            // Let's assume dark shape on light background

            for (let y = 0; y < size; y++) {
                for (let x = 0; x < size; x++) {
                    const i = (y * size + x) * 4;
                    const r = data[i];
                    const g = data[i + 1];
                    const b = data[i + 2];
                    const a = data[i + 3];

                    // Convert to grayscale
                    const brightness = (r + g + b) / 3;

                    // If pixel is dark (part of shape)
                    if (brightness < threshold && a > 128) {
                        points.push({ x, y });
                    }
                }
            }

            if (points.length === 0) {
                reject(new Error("No shape found in image"));
                return;
            }

            // Sort points to form a path
            // 1. Calculate center of mass
            const center = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
            center.x /= points.length;
            center.y /= points.length;

            // 2. Group by angle to find the outer shell (max radius per angle)
            const buckets = new Map<number, { x: number, y: number, r: number }>();
            const numBuckets = numPoints * 2; // Oversample buckets slightly

            points.forEach(p => {
                const dx = p.x - center.x;
                const dy = p.y - center.y;
                const angle = Math.atan2(dy, dx);
                const radius = Math.sqrt(dx * dx + dy * dy);

                // Quantize angle to buckets
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

            // 4. Downsample to exact numPoints if needed
            const result: [number, number][] = [];
            const step = Math.max(1, Math.floor(sortedPoints.length / numPoints));

            for (let i = 0; i < sortedPoints.length; i += step) {
                if (result.length < numPoints) {
                    result.push([sortedPoints[i].x / size, sortedPoints[i].y / size]);
                }
            }

            // Close the loop
            if (result.length > 0) {
                result.push(result[0]);
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
