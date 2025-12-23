import { FeatureCollection } from "geojson";
import { GEO } from "@/config";

/**
 * Scales normalized shape points (0-1) to real-world geographic coordinates.
 * 
 * @param points - Array of [x, y] coordinates where x and y are between 0 and 1.
 * @param center - The center point [lat, lng] of the target area.
 * @param radius - The radius in meters of the target area.
 * @returns Array of [lat, lng] coordinates.
 */
export function scalePointsToGeo(
    points: [number, number][], // [x, y] normalized 0-1
    center: [number, number],   // [lat, lng]
    radius: number              // meters
): [number, number][] {       // [lat, lng]
    const latRad = (center[0] * Math.PI) / 180;
    const metersPerLat = (2 * Math.PI * GEO.earthRadiusMeters) / 360;
    const metersPerLng = (2 * Math.PI * GEO.earthRadiusMeters * Math.cos(latRad)) / 360;

    // Calculate bounding box in degrees
    const latOffset = radius / metersPerLat;
    const lngOffset = radius / metersPerLng;

    const minLat = center[0] - latOffset;
    const minLng = center[1] - lngOffset;
    const maxLat = center[0] + latOffset;
    const maxLng = center[1] + lngOffset;

    const latRange = maxLat - minLat;
    const lngRange = maxLng - minLng;

    return points.map(([x, y]) => {
        // Invert Y because image coordinates (0,0) is top-left, but map (lat) increases upwards
        // x (0-1) -> lng (min-max)
        // y (0-1) -> lat (max-min) because y goes down in image
        // Image: 0,0 top-left. Map: MaxLat, MinLng is top-left.

        const lng = minLng + x * lngRange;
        const lat = maxLat - y * latRange;

        return [lat, lng];
    });
}

/**
 * Calculates the great-circle distance between two points using the Haversine formula.
 * 
 * @param p1 - First point [lat, lng].
 * @param p2 - Second point [lat, lng].
 * @returns Distance in meters.
 */
export function calculateDistance(p1: [number, number], p2: [number, number]): number {
    const R = GEO.earthRadiusMeanMeters;
    const φ1 = p1[0] * Math.PI / 180;
    const φ2 = p2[0] * Math.PI / 180;
    const Δφ = (p2[0] - p1[0]) * Math.PI / 180;
    const Δλ = (p2[1] - p1[1]) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) *
        Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
}

/**
 * Calculates the total length of a route from a GeoJSON object.
 * 
 * @param geoJson - The GeoJSON object containing the route features.
 * @returns Total length in meters.
 */
export function calculateRouteLength(geoJson: FeatureCollection): number {
    if (!geoJson || !geoJson.features) return 0;
    let totalDistance = 0;
    for (const feature of geoJson.features) {
        if (feature.geometry.type === "LineString") {
            const coords = feature.geometry.coordinates;
            for (let i = 0; i < coords.length - 1; i++) {
                // GeoJSON is [lng, lat], we need [lat, lng] for calculateDistance
                const p1: [number, number] = [coords[i][1], coords[i][0]];
                const p2: [number, number] = [coords[i + 1][1], coords[i + 1][0]];
                totalDistance += calculateDistance(p1, p2);
            }
        }
    }
    return totalDistance;
}

/**
 * Simplifies a path of points using the Ramer-Douglas-Peucker algorithm.
 * This reduces the number of points while preserving the overall shape, which is crucial for API performance.
 * 
 * @param points - Array of [lat, lng] points.
 * @param tolerance - The maximum distance (in degrees) a point can be from the line between its neighbors to be removed.
 * @returns Simplified array of [lat, lng] points.
 */
export function simplifyPoints(points: [number, number][], tolerance: number): [number, number][] {
    if (points.length <= 2) {
        return points;
    }

    const start = points[0];
    const end = points[points.length - 1];

    // Check if this is a closed loop (first and last points are very close)
    const dist = calculateDistance(start, end);
    const isClosedLoop = dist < GEO.closedLoopThresholdMeters;

    // IMPORTANT FIX (GitHub issue #5): Apply stricter tolerance to ALL shapes
    // Previously only closed loops got the /20 adjustment, causing open shapes
    // (like letters, symbols) to be over-simplified to near-straight lines.
    // 
    // For closed loops: use tolerance/closedLoopDivisor (very strict, ~2-3m effective)
    // For open shapes: use tolerance/openShapeDivisor (strict but allows some simplification)
    const adjustedTolerance = isClosedLoop 
        ? tolerance / GEO.simplification.closedLoopDivisor 
        : tolerance / GEO.simplification.openShapeDivisor;
    
    const result = simplifyPointsRecursive(points, adjustedTolerance);
    
    console.log(`[geoUtils] simplifyPoints: ${points.length} → ${result.length} points (closed: ${isClosedLoop}, tolerance: ${tolerance} → ${adjustedTolerance.toFixed(6)})`);
    
    return result;
}

function simplifyPointsRecursive(points: [number, number][], tolerance: number): [number, number][] {
    if (points.length <= 2) return points;

    let maxDist = 0;
    let index = 0;

    const start = points[0];
    const end = points[points.length - 1];

    for (let i = 1; i < points.length - 1; i++) {
        const dist = perpendicularDistance(points[i], start, end);
        if (dist > maxDist) {
            maxDist = dist;
            index = i;
        }
    }

    if (maxDist > tolerance) {
        const left = simplifyPointsRecursive(points.slice(0, index + 1), tolerance);
        const right = simplifyPointsRecursive(points.slice(index), tolerance);
        return [...left.slice(0, -1), ...right];
    } else {
        return [start, end];
    }
}

function perpendicularDistance(p: [number, number], p1: [number, number], p2: [number, number]): number {
    const [x, y] = p;
    const [x1, y1] = p1;
    const [x2, y2] = p2;

    const A = x - x1;
    const B = y - y1;
    const C = x2 - x1;
    const D = y2 - y1;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;

    if (lenSq !== 0) {
        param = dot / lenSq;
    }

    let xx, yy;

    if (param < 0) {
        xx = x1;
        yy = y1;
    } else if (param > 1) {
        xx = x2;
        yy = y2;
    } else {
        xx = x1 + param * C;
        yy = y1 + param * D;
    }

    const dx = x - xx;
    const dy = y - yy;

    return Math.sqrt(dx * dx + dy * dy);
}

function distanceToSegment(p: [number, number], v: [number, number], w: [number, number]): number {
    const latRad = (v[0] * Math.PI) / 180;
    const metersPerLat = GEO.metersPerLatDegree;
    const metersPerLng = 40075000 * Math.cos(latRad) / 360;

    const x = (p[1] - v[1]) * metersPerLng;
    const y = (p[0] - v[0]) * metersPerLat;
    const x2 = (w[1] - v[1]) * metersPerLng;
    const y2 = (w[0] - v[0]) * metersPerLat;

    const A = x - 0;
    const B = y - 0;
    const C = x2 - 0;
    const D = y2 - 0;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;

    if (lenSq !== 0) {
        param = dot / lenSq;
    }

    let xx, yy;

    if (param < 0) {
        xx = 0;
        yy = 0;
    } else if (param > 1) {
        xx = x2;
        yy = y2;
    } else {
        xx = 0 + param * C;
        yy = 0 + param * D;
    }

    const dx = x - xx;
    const dy = y - yy;

    return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculates a score (0-100) representing how well the generated route matches the original shape.
 * Uses a bidirectional error metric:
 * 1. Forward Error: Average distance from Original Shape -> Nearest Route Segment.
 * 2. Backward Error: Average distance from Route -> Nearest Original Point.
 * 
 * @param originalPoints - The target shape points [lat, lng].
 * @param geoJson - The generated route GeoJSON.
 * @param radius - The radius of the area in meters (used for normalization).
 * @returns Accuracy score from 0 to 100.
 */
export function calculateRouteAccuracy(
    originalPoints: [number, number][], // [lat, lng]
    geoJson: FeatureCollection,
    radius: number // meters
): number {
    if (!geoJson || !geoJson.features || originalPoints.length === 0) return 0;

    // Flatten all route points
    const routePoints: [number, number][] = [];
    for (const feature of geoJson.features) {
        if (feature.geometry.type === "LineString") {
            for (const coord of feature.geometry.coordinates) {
                routePoints.push([coord[1], coord[0]]); // [lat, lng]
            }
        }
    }

    if (routePoints.length === 0) return 0;

    // 1. Forward Error: Average distance from Original -> Closest Route Segment
    let totalForwardError = 0;
    for (const p1 of originalPoints) {
        let minDist = Infinity;
        for (let i = 0; i < routePoints.length - 1; i++) {
            const p2 = routePoints[i];
            const p3 = routePoints[i + 1];
            const dist = distanceToSegment(p1, p2, p3);
            if (dist < minDist) minDist = dist;
        }
        totalForwardError += minDist;
    }
    const avgForwardError = totalForwardError / originalPoints.length;

    // 2. Backward Error: Average distance from Route -> Closest Original Point
    // We sample the route segments
    let totalBackwardError = 0;
    let checkedPoints = 0;

    // Sample points along the route segments
    for (let i = 0; i < routePoints.length - 1; i++) {
        const pStart = routePoints[i];
        const pEnd = routePoints[i + 1];
        const segmentDist = calculateDistance(pStart, pEnd);
        const numSamples = Math.max(1, Math.floor(segmentDist / GEO.accuracy.sampleDistanceMeters));

        for (let j = 0; j <= numSamples; j++) {
            const t = j / numSamples;
            const lat = pStart[0] + (pEnd[0] - pStart[0]) * t;
            const lng = pStart[1] + (pEnd[1] - pStart[1]) * t;
            const pSample: [number, number] = [lat, lng];

            let minDist = Infinity;
            for (const p2 of originalPoints) {
                const dist = calculateDistance(pSample, p2);
                if (dist < minDist) minDist = dist;
            }
            totalBackwardError += minDist;
            checkedPoints++;
        }
    }
    const avgBackwardError = checkedPoints > 0 ? totalBackwardError / checkedPoints : 0;

    // Combine errors. We weight them equally.
    const totalAvgError = (avgForwardError + avgBackwardError) / 2;

    // Normalize score.
    // We want a score that reflects "perceived" accuracy.
    // A deviation of 10% of the radius is actually quite visible but still "recognizable".
    // Let's say maxToleratedErrorFraction deviation is where the shape is lost (0%).
    const maxToleratedError = radius * GEO.accuracy.maxToleratedErrorFraction;

    // Linear falloff
    const score = 100 * (1 - totalAvgError / maxToleratedError);

    return Math.max(0, Math.min(100, score));
}
