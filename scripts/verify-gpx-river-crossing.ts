/**
 * GPX River Crossing Verification Script
 *
 * Tests that routes cross rivers via bridges, not through water.
 * Generates a heart shape over Tower Bridge area and checks for
 * suspicious "river jumps" in the resulting GPX.
 *
 * Usage:
 *   npx tsx scripts/verify-gpx-river-crossing.ts --local
 *   npx tsx scripts/verify-gpx-river-crossing.ts --production
 *   npx tsx scripts/verify-gpx-river-crossing.ts --compare
 */

import * as path from 'path';
import * as fs from 'fs';
import sharp from 'sharp';
import { extractShapeFromImageData, ImageProcessingConfig } from '../src/lib/imageProcessingCore';
import { scalePointsToGeo, calculateDistance } from '../src/lib/geoUtils';
import { generateGPX } from '../src/lib/gpxGenerator';
import { FeatureCollection } from 'geojson';

// Thames river latitude range near Tower Bridge
const THAMES_LAT_MIN = 51.504;
const THAMES_LAT_MAX = 51.508;
const THAMES_CENTER = 51.506;

// Tower Bridge coordinates
const TOWER_BRIDGE: [number, number] = [51.5055, -0.0754];
const ROUTE_RADIUS = 1000; // 1km

// River jump detection threshold
const RIVER_JUMP_THRESHOLD_METERS = 50;

// Scratchpad for output files
const SCRATCHPAD = '/private/tmp/claude/-Users-jakub-code-routista/0c0ff7ec-e74a-45ae-ac1a-0f55eb323f52/scratchpad';

// API endpoints
const LOCAL_API = 'http://localhost:3000/api/radar/directions';
const PRODUCTION_API = 'https://www.routista.eu/api/radar/directions';

// Image processing config (matches nodeImageProcessing.ts)
const IMAGE_CONFIG: ImageProcessingConfig = {
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

interface TrackPoint {
    lat: number;
    lon: number;
}

interface RiverJump {
    fromPoint: TrackPoint;
    toPoint: TrackPoint;
    distance: number;
    crossesThames: boolean;
}

interface AnalysisResult {
    totalPoints: number;
    riverJumps: RiverJump[];
    totalDistance: number;
    bridgeCrossings: number;
    warnings: string[];
}

/**
 * Load heart shape from image and scale to geo coordinates
 */
async function loadHeartShape(): Promise<[number, number][]> {
    const heartPath = path.join(process.cwd(), 'public', 'heart-v2.png');

    console.log(`Loading heart shape from: ${heartPath}`);

    const { data, info } = await sharp(heartPath)
        .resize(800, 800, { fit: 'fill' })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

    const { width, height } = info;

    const result = extractShapeFromImageData(
        data,
        width,
        height,
        1000, // numPoints
        IMAGE_CONFIG,
        '[verify-gpx]'
    );

    console.log(`Extracted ${result.points.length} shape points`);

    // Scale to Tower Bridge area
    const geoPoints = scalePointsToGeo(result.points, TOWER_BRIDGE, ROUTE_RADIUS);
    console.log(`Scaled to geo coordinates around Tower Bridge (${TOWER_BRIDGE[0]}, ${TOWER_BRIDGE[1]})`);

    return geoPoints;
}

/**
 * Call the routing API to get a route
 */
async function getRoute(coordinates: [number, number][], apiUrl: string): Promise<FeatureCollection> {
    console.log(`\nCalling API: ${apiUrl}`);
    console.log(`Sending ${coordinates.length} waypoints`);

    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            coordinates,
            mode: 'foot-walking',
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error ${response.status}: ${errorText}`);
    }

    const geoJson = await response.json() as FeatureCollection;
    console.log(`Received route with ${geoJson.features?.length || 0} features`);

    return geoJson;
}

/**
 * Parse GPX and extract trackpoints
 */
function parseGPXTrackpoints(gpx: string): TrackPoint[] {
    const points: TrackPoint[] = [];
    const regex = /<trkpt lat="([^"]+)" lon="([^"]+)">/g;
    let match;

    while ((match = regex.exec(gpx)) !== null) {
        points.push({
            lat: parseFloat(match[1]),
            lon: parseFloat(match[2]),
        });
    }

    return points;
}

/**
 * Check if two points cross the Thames
 */
function crossesThames(p1: TrackPoint, p2: TrackPoint): boolean {
    // Check if one point is north and one is south of Thames center
    return (p1.lat < THAMES_CENTER && p2.lat > THAMES_CENTER) ||
           (p1.lat > THAMES_CENTER && p2.lat < THAMES_CENTER);
}

/**
 * Analyze GPX for river crossing issues
 */
function analyzeGPX(gpx: string): AnalysisResult {
    const points = parseGPXTrackpoints(gpx);
    const riverJumps: RiverJump[] = [];
    const warnings: string[] = [];
    let totalDistance = 0;
    let bridgeCrossings = 0;

    for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1];
        const curr = points[i];
        const distance = calculateDistance(
            [prev.lat, prev.lon],
            [curr.lat, curr.lon]
        );
        totalDistance += distance;

        // Check for Thames crossings
        if (crossesThames(prev, curr)) {
            bridgeCrossings++;

            // A proper bridge crossing should have many small steps
            // A suspicious crossing has a large gap
            if (distance > RIVER_JUMP_THRESHOLD_METERS) {
                riverJumps.push({
                    fromPoint: prev,
                    toPoint: curr,
                    distance,
                    crossesThames: true,
                });
            }
        }
    }

    // Generate warnings
    if (riverJumps.length > 0) {
        warnings.push(`Found ${riverJumps.length} suspicious river jump(s) with gaps > ${RIVER_JUMP_THRESHOLD_METERS}m`);
        for (const jump of riverJumps) {
            warnings.push(
                `  Jump: (${jump.fromPoint.lat.toFixed(5)}, ${jump.fromPoint.lon.toFixed(5)}) → ` +
                `(${jump.toPoint.lat.toFixed(5)}, ${jump.toPoint.lon.toFixed(5)}) = ${jump.distance.toFixed(1)}m`
            );
        }
    }

    if (bridgeCrossings === 0 && points.some(p => p.lat < THAMES_CENTER) && points.some(p => p.lat > THAMES_CENTER)) {
        warnings.push('Route spans both sides of Thames but no bridge crossings detected - may indicate routing issue');
    }

    return {
        totalPoints: points.length,
        riverJumps,
        totalDistance,
        bridgeCrossings,
        warnings,
    };
}

/**
 * Print analysis report
 */
function printReport(name: string, result: AnalysisResult): void {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`ANALYSIS: ${name}`);
    console.log('='.repeat(60));
    console.log(`Total trackpoints: ${result.totalPoints}`);
    console.log(`Total distance: ${(result.totalDistance / 1000).toFixed(2)} km`);
    console.log(`Thames crossings: ${result.bridgeCrossings}`);
    console.log(`Suspicious river jumps: ${result.riverJumps.length}`);

    if (result.warnings.length > 0) {
        console.log('\n⚠️  WARNINGS:');
        for (const warning of result.warnings) {
            console.log(`   ${warning}`);
        }
    } else {
        console.log('\n✅ No river crossing issues detected');
    }
}

/**
 * Save GPX to scratchpad
 */
function saveGPX(gpx: string, filename: string): string {
    // Ensure scratchpad exists
    if (!fs.existsSync(SCRATCHPAD)) {
        fs.mkdirSync(SCRATCHPAD, { recursive: true });
    }

    // Validate filename is safe (alphanumeric, dash, underscore, dot)
    if (!/^[\w.-]+$/.test(filename)) {
        throw new Error(`Invalid filename: ${filename}`);
    }

    const filepath = path.join(SCRATCHPAD, filename);
    fs.writeFileSync(filepath, gpx, 'utf-8');
    console.log(`\nSaved GPX to: ${filepath}`);
    return filepath;
}

/**
 * Run verification for a single endpoint
 */
async function runVerification(apiUrl: string, name: string): Promise<{ gpx: string; result: AnalysisResult }> {
    console.log(`\n${'#'.repeat(60)}`);
    console.log(`# ${name}`);
    console.log('#'.repeat(60));

    const shapePoints = await loadHeartShape();
    const geoJson = await getRoute(shapePoints, apiUrl);
    const gpx = generateGPX(geoJson);
    const result = analyzeGPX(gpx);

    printReport(name, result);

    return { gpx, result };
}

/**
 * Compare local vs production
 */
async function runComparison(): Promise<void> {
    console.log('\n🔄 Running comparison: LOCAL vs PRODUCTION\n');

    // Run both
    let localResult: { gpx: string; result: AnalysisResult };
    let prodResult: { gpx: string; result: AnalysisResult };

    try {
        localResult = await runVerification(LOCAL_API, 'LOCAL');
        saveGPX(localResult.gpx, 'local-route.gpx');
    } catch (error) {
        console.error('\n❌ Failed to get local route:', error instanceof Error ? error.message : error);
        console.log('Make sure the dev server is running: npm run dev');
        return;
    }

    try {
        prodResult = await runVerification(PRODUCTION_API, 'PRODUCTION');
        saveGPX(prodResult.gpx, 'production-route.gpx');
    } catch (error) {
        console.error('\n❌ Failed to get production route:', error instanceof Error ? error.message : error);
        return;
    }

    // Comparison summary
    console.log(`\n${'='.repeat(60)}`);
    console.log('COMPARISON SUMMARY');
    console.log('='.repeat(60));
    console.log(`
                          LOCAL      PRODUCTION
Trackpoints:              ${localResult.result.totalPoints.toString().padStart(6)}       ${prodResult.result.totalPoints.toString().padStart(6)}
Distance (km):            ${(localResult.result.totalDistance / 1000).toFixed(2).padStart(6)}       ${(prodResult.result.totalDistance / 1000).toFixed(2).padStart(6)}
Thames crossings:         ${localResult.result.bridgeCrossings.toString().padStart(6)}       ${prodResult.result.bridgeCrossings.toString().padStart(6)}
River jump warnings:      ${localResult.result.riverJumps.length.toString().padStart(6)}       ${prodResult.result.riverJumps.length.toString().padStart(6)}
`);

    if (localResult.result.riverJumps.length < prodResult.result.riverJumps.length) {
        console.log('✅ LOCAL has fewer river jump issues than PRODUCTION');
    } else if (localResult.result.riverJumps.length > prodResult.result.riverJumps.length) {
        console.log('⚠️  LOCAL has MORE river jump issues than PRODUCTION');
    } else if (localResult.result.riverJumps.length === 0) {
        console.log('✅ Both LOCAL and PRODUCTION have no river jump issues');
    } else {
        console.log('⚠️  Both LOCAL and PRODUCTION have the same number of river jump issues');
    }
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
    const args = process.argv.slice(2);
    const mode = args[0] || '--local';

    console.log('🌉 GPX River Crossing Verification Script');
    console.log(`Mode: ${mode}`);
    console.log(`Thames zone: lat ${THAMES_LAT_MIN} - ${THAMES_LAT_MAX}`);
    console.log(`Jump threshold: ${RIVER_JUMP_THRESHOLD_METERS}m`);

    try {
        if (mode === '--compare') {
            await runComparison();
        } else if (mode === '--production') {
            const { gpx, result } = await runVerification(PRODUCTION_API, 'PRODUCTION');
            saveGPX(gpx, 'production-route.gpx');
            process.exit(result.riverJumps.length > 0 ? 1 : 0);
        } else {
            const { gpx, result } = await runVerification(LOCAL_API, 'LOCAL');
            saveGPX(gpx, 'local-route.gpx');
            process.exit(result.riverJumps.length > 0 ? 1 : 0);
        }
    } catch (error) {
        console.error('\n❌ Error:', error instanceof Error ? error.message : error);
        if (mode === '--local') {
            console.log('\n💡 Make sure the dev server is running: npm run dev');
        }
        process.exit(1);
    }
}

main();
