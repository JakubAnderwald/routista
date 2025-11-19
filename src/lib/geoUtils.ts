export function scalePointsToGeo(
    points: [number, number][], // [x, y] normalized 0-1
    center: [number, number],   // [lat, lng]
    radius: number              // meters
): [number, number][] {       // [lat, lng]
    const earthRadius = 6378137; // meters
    const latRad = (center[0] * Math.PI) / 180;
    const metersPerLat = (2 * Math.PI * earthRadius) / 360;
    const metersPerLng = (2 * Math.PI * earthRadius * Math.cos(latRad)) / 360;

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
        // Actually, let's keep it simple. 
        // x (0-1) -> lng (min-max)
        // y (0-1) -> lat (max-min) because y goes down in image, lat goes down? No lat goes up.
        // Image: 0,0 top-left. Map: MaxLat, MinLng is top-left.

        const lng = minLng + x * lngRange;
        const lat = maxLat - y * latRange;

        return [lat, lng];
    });
}

export function calculateDistance(p1: [number, number], p2: [number, number]): number {
    const R = 6371e3; // metres
    const φ1 = p1[0] * Math.PI / 180; // φ, λ in radians
    const φ2 = p2[0] * Math.PI / 180;
    const Δφ = (p2[0] - p1[0]) * Math.PI / 180;
    const Δλ = (p2[1] - p1[1]) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) *
        Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
}

export function calculateRouteLength(geoJson: any): number {
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

export function simplifyPoints(points: [number, number][], tolerance: number): [number, number][] {
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
        const left = simplifyPoints(points.slice(0, index + 1), tolerance);
        const right = simplifyPoints(points.slice(index), tolerance);
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

export function calculateRouteAccuracy(
    originalPoints: [number, number][], // [lat, lng]
    geoJson: any,
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

    // 1. Forward Error: Average distance from Original -> Closest Route Point
    let totalForwardError = 0;
    for (const p1 of originalPoints) {
        let minDist = Infinity;
        for (const p2 of routePoints) {
            const dist = calculateDistance(p1, p2);
            if (dist < minDist) minDist = dist;
        }
        totalForwardError += minDist;
    }
    const avgForwardError = totalForwardError / originalPoints.length;

    // 2. Backward Error: Average distance from Route -> Closest Original Point
    // We sample the route points to avoid checking every single point if there are thousands,
    // but for typical routes (hundreds of points), it's fine.
    let totalBackwardError = 0;
    const step = Math.max(1, Math.floor(routePoints.length / 100)); // Limit checks for performance
    let checkedPoints = 0;

    for (let i = 0; i < routePoints.length; i += step) {
        const p1 = routePoints[i];
        let minDist = Infinity;
        for (const p2 of originalPoints) {
            const dist = calculateDistance(p1, p2);
            if (dist < minDist) minDist = dist;
        }
        totalBackwardError += minDist;
        checkedPoints++;
    }
    const avgBackwardError = totalBackwardError / checkedPoints;

    // Combine errors. We weight them equally.
    const totalAvgError = (avgForwardError + avgBackwardError) / 2;

    // Normalize score.
    // Stricter tolerance: 10% of radius.
    const maxToleratedError = radius * 0.1;

    // Use a non-linear falloff so small errors don't punish too much, but large ones do.
    // Score = 100 * e^(-k * error)
    // Let's stick to linear for predictability but stricter.

    let score = 100 * (1 - totalAvgError / maxToleratedError);

    return Math.max(0, Math.min(100, score));
}
