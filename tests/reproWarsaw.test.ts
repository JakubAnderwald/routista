import { describe, it, expect } from 'vitest';
import path from 'path';
import { extractShapeFromImageNode } from './utils/nodeImageProcessing';
import { generateRoute } from '../src/lib/routeGenerator';
import { scalePointsToGeo, calculateRouteAccuracy } from '../src/lib/geoUtils';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const TEST_IMAGES_DIR = path.resolve(__dirname, '../docs/test images');
const WARSAW_CENTER: [number, number] = [52.2297, 21.0122];
const RADIUS = 4000;
const MODE = 'foot-walking';

describe('Reproduction: Warsaw Heart', () => {
    it('should generate accurate route for heart.png in Warsaw', async () => {
        const imagePath = path.join(TEST_IMAGES_DIR, 'heart.png');
        console.log(`Testing image: heart.png in Warsaw`);

        // 1. Extract shape
        const shapePoints = await extractShapeFromImageNode(imagePath);

        // 2. Scale points
        const geoPoints = scalePointsToGeo(shapePoints, WARSAW_CENTER, RADIUS);

        // 3. Generate route
        const routeData = await generateRoute({ coordinates: geoPoints, mode: MODE });

        // 4. Calculate accuracy
        const accuracy = calculateRouteAccuracy(geoPoints, routeData, RADIUS);
        console.log(`Accuracy for heart.png in Warsaw: ${accuracy.toFixed(2)}%`);

        // 5. Assert accuracy
        expect(accuracy).toBeGreaterThan(80);
    }, 30000); // Increase timeout for real API call
});
