import { describe, it, expect } from "vitest";
import { removeSpurs, spurCleanupOptionsFor, SpurCleanupOptions } from "@/lib/routeCleanup";
import { calculateDistance, distanceToSegmentMeters } from "@/lib/geoUtils";
import { pathLengthMeters } from "@/lib/routeQuality";
import { SPUR_CLEANUP } from "@/config";
import { offsetEast, offsetNorth, straightLine } from "../utils/pathBuilders";

const WALKING = spurCleanupOptionsFor("foot-walking");

/** Walking settings with one bound overridden, for testing a guard alone. */
function withOption(overrides: Partial<SpurCleanupOptions>): SpurCleanupOptions {
    return { ...WALKING, ...overrides };
}

/**
 * A north-south line with an out-and-back planted at `atIndex`.
 *
 * `returnOffsetMeters` shifts the return leg sideways, so the excursion comes
 * back on the *other side of the street* rather than through the same points —
 * which is what a real pedestrian spur does, and what point-matching misses.
 */
function lineWithSpur(
    count: number,
    spacingM: number,
    atIndex: number,
    eastMeters: number,
    returnOffsetMeters = 0
): { path: [number, number][]; line: [number, number][] } {
    const line = straightLine(count, spacingM);
    const join = line[atIndex];
    const tip = offsetEast(join, eastMeters);
    const path = [
        ...line.slice(0, atIndex + 1),
        tip,
        offsetNorth(tip, returnOffsetMeters),
        offsetNorth(join, returnOffsetMeters),
        ...line.slice(atIndex + 1),
    ];
    return { path, line };
}

/**
 * Asserts two paths are the same line.
 *
 * Point-for-point equality is too brittle: a cut can land on a projection onto
 * a segment, which is the same place to well under a metre but not the same
 * float.
 */
function expectSamePath(actual: [number, number][], expected: [number, number][]): void {
    expect(actual).toHaveLength(expected.length);
    for (let i = 0; i < expected.length; i++) {
        expect(calculateDistance(actual[i], expected[i])).toBeLessThan(1);
    }
}

/** Longest edge in a path, in meters. */
function maxEdge(points: [number, number][]): number {
    let longest = 0;
    for (let i = 0; i < points.length - 1; i++) {
        longest = Math.max(longest, calculateDistance(points[i], points[i + 1]));
    }
    return longest;
}

describe("spurCleanupOptionsFor", () => {
    it("returns the configured bounds for each mode", () => {
        expect(spurCleanupOptionsFor("foot-walking")).toEqual({
            snapMeters: SPUR_CLEANUP.snapMeters,
            maxSpurMeters: SPUR_CLEANUP.maxSpurMeters["foot-walking"],
            maxShapeLossMeters: SPUR_CLEANUP.maxShapeLossMeters["foot-walking"],
            maxSpurPoints: SPUR_CLEANUP.maxSpurPoints,
            maxPasses: SPUR_CLEANUP.maxPasses,
        });
    });

    it("lets driving lose more of the shape than walking", () => {
        expect(spurCleanupOptionsFor("driving-car").maxShapeLossMeters).toBeGreaterThan(
            spurCleanupOptionsFor("foot-walking").maxShapeLossMeters
        );
    });
});

describe("removeSpurs", () => {
    it("removes an out-and-back the shape does not ask for", () => {
        const { path, line } = lineWithSpur(10, 40, 4, 60);

        const result = removeSpurs(path, line, WALKING);

        expectSamePath(result.points, line);
        expect(result.spurs).toHaveLength(1);
        expect(result.removedMeters).toBeGreaterThan(100);
    });

    it("removes a spur that comes back on the other side of the street", () => {
        // 10 m to the side: no point of the return leg matches a point of the
        // outbound one, so point-matching sees nothing and projection sees it.
        const { path, line } = lineWithSpur(10, 40, 4, 60, 10);

        const result = removeSpurs(path, line, WALKING);

        expect(result.spurs).toHaveLength(1);
        expect(pathLengthMeters(result.points)).toBeLessThan(pathLengthMeters(path) - 100);
        expect(result.points.length).toBeLessThan(path.length);
    });

    it("keeps an out-and-back the shape genuinely traces", () => {
        // The shape runs down the spur and back, so cutting it would strand
        // those waypoints — a traced pier, headland or dead-end street.
        const { path } = lineWithSpur(10, 40, 4, 300);
        const join = straightLine(10, 40)[4];
        const shape = [
            ...straightLine(5, 40),
            offsetEast(join, 150),
            offsetEast(join, 300),
            ...straightLine(10, 40).slice(5),
        ];

        const result = removeSpurs(path, shape, WALKING);

        expect(result.spurs).toEqual([]);
        expect(result.points).toEqual(path);
    });

    it("removes a long spur when the shape does not follow it", () => {
        // Same 300 m excursion, but the shape stays on the line. Length alone
        // must not save it — that was the old, wrong criterion.
        const { path, line } = lineWithSpur(10, 40, 4, 300);

        const result = removeSpurs(path, line, WALKING);

        expect(result.spurs).toHaveLength(1);
        expectSamePath(result.points, line);
    });

    it("removes several spurs in one call", () => {
        const line = straightLine(24, 40);
        const path: [number, number][] = [];
        for (const [index, point] of line.entries()) {
            path.push(point);
            if (index % 5 === 3) path.push(offsetEast(point, 45), point);
        }

        const result = removeSpurs(path, line, WALKING);

        expectSamePath(result.points, line);
        expect(result.spurs.length).toBeGreaterThanOrEqual(4);
    });

    it("keeps interacting spurs on real geometry", () => {
        // Two excursions close enough that the second rejoins where the first
        // was cut. Nothing may be projected onto a chord the cut did not emit,
        // so every returned point must lie on the line that was passed in.
        const line = straightLine(12, 40);
        const first = line[4];
        const second = line[5];
        const path: [number, number][] = [
            ...line.slice(0, 5),
            offsetEast(first, 50),
            offsetNorth(offsetEast(first, 50), 12),
            offsetNorth(first, 12),
            second,
            offsetEast(second, 45),
            offsetNorth(offsetEast(second, 45), 10),
            offsetNorth(second, 10),
            ...line.slice(6),
        ];

        const result = removeSpurs(path, line, WALKING);

        expect(result.spurs.length).toBeGreaterThanOrEqual(2);
        expect(pathLengthMeters(result.points)).toBeLessThan(pathLengthMeters(path));
        for (const point of result.points) {
            let onPath = false;
            for (let i = 0; i < path.length - 1 && !onPath; i++) {
                onPath = distanceToSegmentMeters(point, path[i], path[i + 1]) < 0.5;
            }
            expect(onPath).toBe(true);
        }
    });

    it("reports exactly the length it removed", () => {
        // The diagnostic is what the response and the baseline report, so it
        // has to equal what the route actually lost.
        const line = straightLine(30, 40);
        const path: [number, number][] = [];
        for (const [index, point] of line.entries()) {
            path.push(point);
            if (index % 3 === 1) path.push(offsetEast(point, 45), offsetNorth(point, 8));
        }

        const result = removeSpurs(path, line, WALKING);

        expect(result.removedMeters).toBeCloseTo(
            pathLengthMeters(path) - pathLengthMeters(result.points),
            0
        );
    });

    it("leaves a route that never doubles back untouched", () => {
        const line = straightLine(50, 40);

        const result = removeSpurs(line, line, WALKING);

        expect(result.points).toEqual(line);
        expect(result.spurs).toEqual([]);
        expect(result.removedMeters).toBe(0);
    });

    it("keeps a closed loop whose last point is its first", () => {
        const corner = straightLine(1, 0)[0];
        const side = 400;
        const loop: [number, number][] = [
            corner,
            offsetNorth(corner, side),
            offsetEast(offsetNorth(corner, side), side),
            offsetEast(corner, side),
            corner,
        ];

        const result = removeSpurs(loop, loop, WALKING);

        expect(result.points).toEqual(loop);
        expect(result.spurs).toEqual([]);
    });

    it("keeps a figure-of-eight that legitimately revisits a junction", () => {
        const junction = straightLine(1, 0)[0];
        const side = 400;
        const path: [number, number][] = [
            junction,
            offsetNorth(junction, side),
            offsetEast(offsetNorth(junction, side), side),
            offsetEast(junction, side),
            junction,
            offsetNorth(junction, -side),
            offsetEast(offsetNorth(junction, -side), -side),
            offsetEast(junction, -side),
            junction,
        ];

        const result = removeSpurs(path, path, WALKING);

        expect(result.points).toEqual(path);
        expect(result.spurs).toEqual([]);
    });

    it("settles — a second call finds nothing", () => {
        const line = straightLine(30, 40);
        const path: [number, number][] = [];
        for (const [index, point] of line.entries()) {
            path.push(point);
            if (index % 3 === 1) path.push(offsetEast(point, 40), point);
        }

        const once = removeSpurs(path, line, WALKING);
        const twice = removeSpurs(once.points, line, WALKING);

        expect(twice.spurs).toEqual([]);
        expect(twice.points).toEqual(once.points);
    });

    it("never lengthens the route and stays on the geometry it was given", () => {
        const { path, line } = lineWithSpur(30, 40, 12, 50);

        const result = removeSpurs(path, line, WALKING);

        expect(pathLengthMeters(result.points)).toBeLessThan(pathLengthMeters(path));
        expect(result.points.length).toBeLessThanOrEqual(path.length);
        // Every point is either one of the originals or a projection onto one
        // of its segments — so the route never leaves the road it was routed on.
        for (const point of result.points) {
            let onPath = false;
            for (let i = 0; i < path.length - 1 && !onPath; i++) {
                onPath = distanceToSegmentMeters(point, path[i], path[i + 1]) < 0.5;
            }
            expect(onPath).toBe(true);
        }
    });

    it("grows the longest edge by at most the snap radius", () => {
        const { path, line } = lineWithSpur(30, 40, 12, 50);

        const result = removeSpurs(path, line, WALKING);

        expect(maxEdge(result.points)).toBeLessThanOrEqual(maxEdge(path) + WALKING.snapMeters);
    });

    it("removes everything when given no shape to protect", () => {
        const { path, line } = lineWithSpur(10, 40, 4, 300);

        const result = removeSpurs(path, [], WALKING);

        expectSamePath(result.points, line);
    });

    it("leaves a route that is entirely one excursion alone", () => {
        // Two waypoints a few metres apart, served by walking up a pavement and
        // back. Cutting this would leave a single point, which is no route and
        // not a valid GeoJSON LineString either.
        const start = straightLine(1, 0)[0];
        const path: [number, number][] = [start, offsetNorth(start, 30), start];

        const result = removeSpurs(path, [], WALKING);

        expect(result.points.length).toBeGreaterThanOrEqual(2);
        expect(result.spurs).toEqual([]);
    });

    it("never returns a polyline too short to be a LineString", () => {
        const start = straightLine(1, 0)[0];
        const candidates: [number, number][][] = [
            [start, offsetNorth(start, 30), start],
            [start, offsetEast(start, 20), offsetNorth(start, 20), start],
            [start, offsetNorth(start, 60), offsetNorth(start, 30), start],
        ];

        for (const path of candidates) {
            expect(removeSpurs(path, [], WALKING).points.length).toBeGreaterThanOrEqual(2);
        }
    });

    it("handles empty, single-point and two-point routes", () => {
        expect(removeSpurs([], [], WALKING)).toEqual({ points: [], spurs: [], removedMeters: 0 });
        expect(removeSpurs(straightLine(1, 10), [], WALKING).points).toHaveLength(1);
        expect(removeSpurs(straightLine(2, 10), [], WALKING).points).toHaveLength(2);
    });

    it("does nothing when the bounds are switched off", () => {
        const { path } = lineWithSpur(10, 40, 4, 60);

        expect(removeSpurs(path, [], withOption({ snapMeters: 0 })).points).toEqual(path);
        expect(removeSpurs(path, [], withOption({ maxSpurMeters: 0 })).points).toEqual(path);
    });

    it("stays fast on a route far longer than any real one", () => {
        const line = straightLine(6_000, 12);
        const path: [number, number][] = [];
        for (const [index, point] of line.entries()) {
            path.push(point);
            if (index % 4 === 2) path.push(offsetEast(point, 30), point);
        }

        const started = performance.now();
        const result = removeSpurs(path, line, WALKING);
        const elapsed = performance.now() - started;

        expect(result.spurs.length).toBeGreaterThan(1000);
        expect(elapsed).toBeLessThan(10_000);
    });
});
