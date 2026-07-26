/**
 * Water polygon geometry.
 *
 * Pure functions for asking "is this point in the water?" and "how much of
 * this route runs through water?". Built for GitHub issue #47, where Radar's
 * foot and bike profiles route along ferry ways in the middle of the Thames.
 *
 * Water polygons come from OpenStreetMap (see `scripts/capture-route-fixtures.ts`).
 * Nothing here touches the network, so it can run against committed fixtures.
 */

import { FeatureCollection, Feature, Position } from "geojson";
import { calculateDistance, distanceToSegmentMeters } from "./geoUtils";

/** Bounding box as `[minLat, minLng, maxLat, maxLng]`. */
export type BoundingBox = [number, number, number, number];

/** A single water body: one outer ring plus any island holes. */
export interface WaterPolygon {
    /** Rings as `[lat, lng]`. Index 0 is the outer ring, the rest are holes. */
    rings: [number, number][][];
    bbox: BoundingBox;
}

/** Pre-indexed water bodies, ready for point and segment queries. */
export interface WaterIndex {
    polygons: WaterPolygon[];
    bbox: BoundingBox | null;
}

/** How a route interacts with water. */
export interface RouteWaterStats {
    /** Total length of route that runs inside water, in meters. */
    totalWaterMeters: number;
    /**
     * Longest unbroken run through water, in meters. A bridge is a short
     * perpendicular crossing; a ferry line along a river is long. This is the
     * metric that distinguishes the two.
     */
    maxContiguousWaterMeters: number;
    /** Number of separate runs through water. */
    crossings: number;
}

/** Options shared by the point-in-water queries. */
export interface WaterQueryOptions {
    /**
     * Treat points within this distance of a polygon edge as being in water.
     * Defaults to 0, i.e. a plain even-odd test where points exactly on the
     * boundary may fall either side.
     */
    boundaryToleranceMeters?: number;
}

/** Distance between successive samples when measuring a segment, in meters. */
const SAMPLE_STEP_METERS = 10;

/**
 * Builds a queryable index from GeoJSON water polygons.
 *
 * Accepts a FeatureCollection that may also contain non-polygon features (the
 * fixture files carry bridge LineStrings alongside the water); those are
 * ignored. GeoJSON `[lng, lat]` order is flipped to `[lat, lng]`.
 *
 * @param collection - GeoJSON containing Polygon and/or MultiPolygon features.
 * @returns Index with per-polygon bounding boxes for fast rejection.
 */
export function buildWaterIndex(collection: FeatureCollection | null | undefined): WaterIndex {
    const polygons: WaterPolygon[] = [];

    for (const feature of collection?.features ?? []) {
        for (const rings of polygonRingsOf(feature)) {
            const converted = rings
                .map(ring => ring.map(([lng, lat]) => [lat, lng] as [number, number]))
                .filter(ring => ring.length >= 3);

            if (converted.length === 0) continue;
            polygons.push({ rings: converted, bbox: ringBoundingBox(converted[0]) });
        }
    }

    return { polygons, bbox: mergeBoundingBoxes(polygons.map(p => p.bbox)) };
}

/**
 * Tests whether a point lies inside any water body.
 *
 * @param point - Point as `[lat, lng]`.
 * @param index - Index from `buildWaterIndex`.
 * @param options - Optional boundary tolerance.
 * @returns True if the point is in water.
 */
export function isPointInWater(
    point: [number, number],
    index: WaterIndex,
    options: WaterQueryOptions = {}
): boolean {
    const tolerance = options.boundaryToleranceMeters ?? 0;

    for (const polygon of index.polygons) {
        if (!bboxContains(polygon.bbox, point, tolerance)) continue;

        if (tolerance > 0 && polygon.rings.some(ring => distanceToRingMeters(point, ring) <= tolerance)) {
            return true;
        }

        // Inside the outer ring but inside a hole means dry land (an island).
        if (!pointInRing(point, polygon.rings[0])) continue;
        if (polygon.rings.slice(1).some(hole => pointInRing(point, hole))) continue;

        return true;
    }

    return false;
}

/**
 * Length of the part of a straight segment that runs through water.
 *
 * Sampled every `SAMPLE_STEP_METERS`, so the result is accurate to about that
 * step. Good enough to tell a 300 m bridge from a 3 km run down a river.
 *
 * @param from - Segment start as `[lat, lng]`.
 * @param to - Segment end as `[lat, lng]`.
 * @param index - Index from `buildWaterIndex`.
 * @param options - Optional boundary tolerance.
 * @returns Meters of the segment inside water.
 */
export function segmentWaterMeters(
    from: [number, number],
    to: [number, number],
    index: WaterIndex,
    options: WaterQueryOptions = {}
): number {
    let meters = 0;
    for (const sample of sampleSegment(from, to)) {
        if (isPointInWater(sample.point, index, options)) {
            meters += sample.meters;
        }
    }
    return meters;
}

/**
 * Measures how much of a route runs through water, and in what runs.
 *
 * @param route - Route GeoJSON, typically from `getRadarRoute`.
 * @param index - Index from `buildWaterIndex`.
 * @param options - Optional boundary tolerance.
 * @returns Total water length, longest unbroken run, and run count.
 */
export function routeWaterStats(
    route: FeatureCollection | null | undefined,
    index: WaterIndex,
    options: WaterQueryOptions = {}
): RouteWaterStats {
    const stats: RouteWaterStats = {
        totalWaterMeters: 0,
        maxContiguousWaterMeters: 0,
        crossings: 0,
    };

    let run = 0;
    const endRun = () => {
        if (run <= 0) return;
        stats.crossings++;
        stats.maxContiguousWaterMeters = Math.max(stats.maxContiguousWaterMeters, run);
        run = 0;
    };

    for (const feature of route?.features ?? []) {
        if (feature.geometry?.type !== "LineString") continue;

        const points = feature.geometry.coordinates.map(
            ([lng, lat]) => [lat, lng] as [number, number]
        );

        for (let i = 0; i < points.length - 1; i++) {
            for (const sample of sampleSegment(points[i], points[i + 1])) {
                if (isPointInWater(sample.point, index, options)) {
                    stats.totalWaterMeters += sample.meters;
                    run += sample.meters;
                } else {
                    endRun();
                }
            }
        }
        endRun();
    }

    endRun();
    return stats;
}

/**
 * Bounding box around a set of points, padded by a margin in meters.
 *
 * @param points - Points as `[lat, lng]`.
 * @param paddingMeters - Margin to add on every side.
 * @returns Bounding box, or null when there are no points.
 */
export function boundingBoxOf(
    points: [number, number][],
    paddingMeters = 0
): BoundingBox | null {
    if (points.length === 0) return null;

    let minLat = Infinity;
    let minLng = Infinity;
    let maxLat = -Infinity;
    let maxLng = -Infinity;

    for (const [lat, lng] of points) {
        minLat = Math.min(minLat, lat);
        maxLat = Math.max(maxLat, lat);
        minLng = Math.min(minLng, lng);
        maxLng = Math.max(maxLng, lng);
    }

    if (paddingMeters <= 0) return [minLat, minLng, maxLat, maxLng];

    const latPad = paddingMeters / 111320;
    const midLat = (minLat + maxLat) / 2;
    const lngPad = paddingMeters / (111320 * Math.max(Math.cos((midLat * Math.PI) / 180), 0.01));

    return [minLat - latPad, minLng - lngPad, maxLat + latPad, maxLng + lngPad];
}

/** Extracts polygon ring sets from a feature, handling Polygon and MultiPolygon. */
function polygonRingsOf(feature: Feature): Position[][][] {
    const geometry = feature?.geometry;
    if (geometry?.type === "Polygon") return [geometry.coordinates];
    if (geometry?.type === "MultiPolygon") return geometry.coordinates;
    return [];
}

/** Even-odd ray casting against a single ring. Ring points are `[lat, lng]`. */
function pointInRing(point: [number, number], ring: [number, number][]): boolean {
    const [lat, lng] = point;
    let inside = false;

    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [latI, lngI] = ring[i];
        const [latJ, lngJ] = ring[j];

        const straddles = latI > lat !== latJ > lat;
        if (straddles && lng < ((lngJ - lngI) * (lat - latI)) / (latJ - latI) + lngI) {
            inside = !inside;
        }
    }

    return inside;
}

/** Shortest distance from a point to a ring's edges, in meters. */
function distanceToRingMeters(point: [number, number], ring: [number, number][]): number {
    let closest = Infinity;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        closest = Math.min(closest, distanceToSegmentMeters(point, ring[j], ring[i]));
    }
    return closest;
}

/**
 * Splits a segment into samples of at most `SAMPLE_STEP_METERS`, each carrying
 * its midpoint and the length it represents.
 */
function sampleSegment(
    from: [number, number],
    to: [number, number]
): { point: [number, number]; meters: number }[] {
    const length = calculateDistance(from, to);
    if (length === 0) return [];

    const steps = Math.max(1, Math.ceil(length / SAMPLE_STEP_METERS));
    const stepMeters = length / steps;
    const samples: { point: [number, number]; meters: number }[] = [];

    for (let i = 0; i < steps; i++) {
        const t = (i + 0.5) / steps;
        samples.push({
            point: [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t],
            meters: stepMeters,
        });
    }

    return samples;
}

/** Bounding box of a ring of `[lat, lng]` points. */
function ringBoundingBox(ring: [number, number][]): BoundingBox {
    return boundingBoxOf(ring) ?? [0, 0, 0, 0];
}

/** True when a point falls inside a bounding box, expanded by a margin. */
function bboxContains(bbox: BoundingBox, point: [number, number], paddingMeters: number): boolean {
    const [minLat, minLng, maxLat, maxLng] = bbox;
    const latPad = paddingMeters / 111320;
    const lngPad = paddingMeters / (111320 * Math.max(Math.cos((point[0] * Math.PI) / 180), 0.01));

    return (
        point[0] >= minLat - latPad &&
        point[0] <= maxLat + latPad &&
        point[1] >= minLng - lngPad &&
        point[1] <= maxLng + lngPad
    );
}

/** Smallest bounding box containing all the given boxes. */
function mergeBoundingBoxes(boxes: BoundingBox[]): BoundingBox | null {
    if (boxes.length === 0) return null;

    return boxes.reduce<BoundingBox>(
        (merged, box) => [
            Math.min(merged[0], box[0]),
            Math.min(merged[1], box[1]),
            Math.max(merged[2], box[2]),
            Math.max(merged[3], box[3]),
        ],
        [Infinity, Infinity, -Infinity, -Infinity]
    );
}
