import { describe, it, expect } from 'vitest';
import path from 'path';
import fs from 'fs';
import { extractShapeFromImageNode } from './utils/nodeImageProcessing';
import { getRadarRoute } from '../src/lib/radarService';
import { scalePointsToGeo, calculateRouteAccuracy } from '../src/lib/geoUtils';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

/**
 * Route Accuracy E2E Tests
 * 
 * These tests mirror the browser flow exactly:
 * 1. Load images from public/ folder (same as browser examples)
 * 2. Extract shape with 150 points (matching browser's extractShapeFromImage)
 * 3. Scale to geo coordinates with center [51.505, -0.09] and radius 1000m
 * 4. Generate route via getRadarRoute (same function browser uses via /api/radar/directions)
 * 5. Calculate accuracy using calculateRouteAccuracy
 * 
 * Parameters are aligned with browser defaults in CreateClient.tsx:
 * - center: [51.505, -0.09] (London area)
 * - radius: 1000m
 * - mode: 'foot-walking'
 * - numPoints: 150
 */

// Use images from public/ folder - same source as browser examples
const PUBLIC_EXAMPLES_DIR = path.resolve(__dirname, '../public/examples');
const PUBLIC_ROOT_DIR = path.resolve(__dirname, '../public');

// Images in public/examples/
const EXAMPLE_IMAGES = fs.readdirSync(PUBLIC_EXAMPLES_DIR).filter(file => file.endsWith('.png'));
// Images in public/ root (star, heart)
const ROOT_IMAGE_NAMES = ['star.png', 'heart-v2.png'];
// eslint-disable-next-line security/detect-non-literal-fs-filename
const ROOT_IMAGES = ROOT_IMAGE_NAMES.filter(file => fs.existsSync(path.join(PUBLIC_ROOT_DIR, file)));

// Combined test images with their full paths
const TEST_IMAGES: { name: string; path: string }[] = [
    ...EXAMPLE_IMAGES.map(name => ({ name, path: path.join(PUBLIC_EXAMPLES_DIR, name) })),
    ...ROOT_IMAGES.map(name => ({ name, path: path.join(PUBLIC_ROOT_DIR, name) })),
];

const CENTER: [number, number] = [51.505, -0.09];
const RADIUS = 1000;
const MODE = 'foot-walking';

describe('Route Accuracy Tests', () => {
    it.concurrent.each(TEST_IMAGES)('should generate accurate route for $name', { timeout: 60000 }, async ({ name: imageFile, path: imagePath }) => {
        console.log(`Testing image: ${imageFile}`);

        // 1. Extract shape (150 points is enough for test shapes, reduces API calls)
        const shapePoints = await extractShapeFromImageNode(imagePath, 150);
        expect(shapePoints.length).toBeGreaterThan(0);

        // 2. Scale points
        const geoPoints = scalePointsToGeo(shapePoints, CENTER, RADIUS);

        // 3. Generate route
        const routeData = await getRadarRoute({ coordinates: geoPoints, mode: MODE });
        expect(routeData).toBeDefined();
        expect(routeData.features).toBeDefined();

        // Debug logging
        // console.log('GeoPoints:', JSON.stringify(geoPoints.slice(0, 5)));
        // console.log('RouteData Features:', JSON.stringify(routeData.features));

        // 4. Calculate accuracy
        const accuracy = calculateRouteAccuracy(geoPoints, routeData, RADIUS);
        console.log(`Accuracy for ${imageFile}: ${accuracy.toFixed(2)}%`);

        // 5. Assert accuracy
        // Triangles have sharp corners that are harder to route accurately, so we use a lower threshold
        const minAccuracy = (imageFile === 'triangle.png' || imageFile === 'anchor.png' || imageFile === 'paw.png') ? 70 :
            (imageFile === 'lightning.png') ? 75 :
                (imageFile === 'dino.png') ? 60 : 80;
        expect(accuracy).toBeGreaterThan(minAccuracy);
    });
});
