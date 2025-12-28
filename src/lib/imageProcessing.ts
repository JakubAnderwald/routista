import { IMAGE_PROCESSING } from "@/config";
import { extractShapeFromImageData, ShapeExtractionData } from "./imageProcessingCore";

// Re-export the type directly for consumers
export type ShapeExtractionResult = ShapeExtractionData;

/**
 * Extract shape from an image file using browser Canvas API.
 * 
 * @param file - Image file to process
 * @param numPoints - Number of points to sample from shape boundary
 * @returns Extracted shape data including points, component info, and noise detection
 */
export async function extractShapeFromImage(
    file: File, 
    numPoints: number = IMAGE_PROCESSING.defaultNumPoints
): Promise<ShapeExtractionResult> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);

        img.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                const maxDimension = IMAGE_PROCESSING.maxDimension;
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

                // Use shared core extraction logic
                const result = extractShapeFromImageData(
                    data,
                    width,
                    height,
                    numPoints,
                    {
                        minSignificantPoints: IMAGE_PROCESSING.minSignificantPoints,
                        noise: IMAGE_PROCESSING.noise,
                        otsu: IMAGE_PROCESSING.otsu,
                        minLightCoverageForInvert: IMAGE_PROCESSING.minLightCoverageForInvert,
                    },
                    '[extractShapeFromImage]'
                );

                URL.revokeObjectURL(url);
                resolve(result);
            } catch (error) {
                URL.revokeObjectURL(url);
                reject(error);
            }
        };

        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error("Failed to load image"));
        };

        img.src = url;
    });
}
