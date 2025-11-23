import { describe, it, expect } from 'vitest';
import path from 'path';
import fs from 'fs';
import { extractShapeFromImageNode } from './utils/nodeImageProcessing';
import { generateRoute } from '../src/lib/routeGenerator';
import { scalePointsToGeo, calculateRouteAccuracy } from '../src/lib/geoUtils';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const TEST_IMAGES_DIR = path.resolve(__dirname, '../docs/test images');
const CENTER: [number, number] = [51.505, -0.09];
const RADIUS = 1000;
const MODE = 'foot-walking';

describe('Route Accuracy Tests', () => {
    const images = fs.readdirSync(TEST_IMAGES_DIR).filter(file => file.endsWith('.png'));

    it.each(images)('should generate accurate route for %s', async (imageFile) => {
        const imagePath = path.join(TEST_IMAGES_DIR, imageFile);
        console.log(`Testing image: ${imageFile}`);

        // 1. Extract shape
        const shapePoints = await extractShapeFromImageNode(imagePath);
        expect(shapePoints.length).toBeGreaterThan(0);

        // 2. Scale points
        const geoPoints = scalePointsToGeo(shapePoints, CENTER, RADIUS);

        // 3. Generate route
        const routeData = await generateRoute({ coordinates: geoPoints, mode: MODE });
        expect(routeData).toBeDefined();
        expect(routeData.features).toBeDefined();

        // Debug logging
        // console.log('GeoPoints:', JSON.stringify(geoPoints.slice(0, 5)));
        // console.log('RouteData Features:', JSON.stringify(routeData.features));

        // 4. Calculate accuracy
        const accuracy = calculateRouteAccuracy(geoPoints, routeData, RADIUS);
        console.log(`Accuracy for ${imageFile}: ${accuracy.toFixed(2)}%`);

        // 5. Assert accuracy
        // We expect at least 80% accuracy for these clear shapes
        expect(accuracy).toBeGreaterThan(80);
    });
});
