import sharp from 'sharp';
import { extractShapeFromImageData, ImageProcessingConfig } from '../../src/lib/imageProcessingCore';

/**
 * Default configuration matching browser-side IMAGE_PROCESSING config.
 * Used for Node.js testing environment.
 */
const NODE_IMAGE_PROCESSING_CONFIG: ImageProcessingConfig = {
    minSignificantPoints: 50,
    noise: {
        smallComponentPoints: 500,
        tinyComponentPoints: 200,
        maxSmallComponents: 3,
    },
    otsu: {
        minThreshold: 20,
        maxThreshold: 235,
        defaultThreshold: 128,
    },
    minLightCoverageForInvert: 0.05,
};

/**
 * Extract shape from an image file using Node.js Sharp library.
 * 
 * This is the Node.js equivalent of extractShapeFromImage for testing.
 * Uses the same core algorithms via imageProcessingCore.
 * 
 * @param filePath - Path to the image file
 * @param numPoints - Number of points to sample (default: 1000)
 * @returns Normalized shape points as [x, y] tuples (0-1 range)
 */
export async function extractShapeFromImageNode(
    filePath: string, 
    numPoints: number = 1000
): Promise<[number, number][]> {
    const { data, info } = await sharp(filePath)
        .resize(800, 800, { fit: 'fill' })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

    const { width, height } = info;

    // Use shared core extraction logic
    const result = extractShapeFromImageData(
        data,
        width,
        height,
        numPoints,
        NODE_IMAGE_PROCESSING_CONFIG,
        '[extractShapeFromImageNode]'
    );

    return result.points;
}
