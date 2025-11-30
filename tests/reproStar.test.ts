import { describe, it, expect } from 'vitest';
import path from 'path';
import { extractShapeFromImageNode } from './utils/nodeImageProcessing';
import { getRadarRoute } from '../src/lib/radarService';
import { scalePointsToGeo, calculateRouteAccuracy } from '../src/lib/geoUtils';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const TEST_IMAGES_DIR = path.resolve(__dirname, '../docs/test images');
const WARSAW_CENTER: [number, number] = [52.2297, 21.0122];
const RADIUS = 4000; // 4km radius
const MODE = 'foot-walking';

describe('Reproduction: Warsaw Star', () => {
    it('should generate accurate route for star.png in Warsaw', async () => {
        const imagePath = path.join(TEST_IMAGES_DIR, 'star.png');
        console.log(`Testing image: star.png in Warsaw`);

        // 1. Extract shape
        const shapePoints = await extractShapeFromImageNode(imagePath);

        // Log first 10 points to check ordering
        console.log("First 10 points (normalized):");
        shapePoints.slice(0, 10).forEach((p, i) => console.log(`[${i}] x: ${p[0].toFixed(3)}, y: ${p[1].toFixed(3)}`));

        // 2. Scale points
        const geoPoints = scalePointsToGeo(shapePoints, WARSAW_CENTER, RADIUS);

        // 3. Generate route
        const routeData = await getRadarRoute({ coordinates: geoPoints, mode: MODE });

        // 4. Calculate accuracy
        const accuracy = calculateRouteAccuracy(geoPoints, routeData, RADIUS);
        console.log(`Accuracy for star.png in Warsaw: ${accuracy.toFixed(2)}%`);

        // The user claims accuracy is high (94%), so we expect this to pass even if the shape is wrong visually.
        // This confirms the metric is flawed or the shape extraction is weird.
        expect(accuracy).toBeGreaterThan(80);
    }, 60000);
});
