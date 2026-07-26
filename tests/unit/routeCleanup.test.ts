import { describe, it, expect } from "vitest";
import { removeSpurs, spurCleanupOptionsFor, SpurCleanupOptions } from "@/lib/routeCleanup";
import { calculateDistance } from "@/lib/geoUtils";
import { pathLengthMeters } from "@/lib/routeQuality";
import { SPUR_CLEANUP } from "@/config";
import { offsetEast, offsetNorth, straightLine } from "../utils/pathBuilders";

const WALKING = spurCleanupOptionsFor("foot-walking");

/** Walking settings with one bound overridden, for testing a guard in isolation. */
function withOption(overrides: Partial<SpurCleanupOptions>): SpurCleanupOptions {
    return { ...WALKING, ...overrides };
}

/**
 * A north-south line with an out-and-back planted at `atIndex`.
 *
 * The excursion steps `eastMeters` off the line and returns to the very point
 * it left from, which is what Radar produces when a waypoint snapped to a side
 * street: the same OSM nodes, traversed in reverse.
 */
function lineWithSpur(
    count: number,
    spacingM: number,
    atIndex: number,
    eastMeters: number
): { path: [number, number][]; line: [number, number][] } {
    const line = straightLine(count, spacingM);
    const join = line[atIndex];
    const path = [
        ...line.slice(0, atIndex + 1),
        offsetEast(join, eastMeters),
        join,
        ...line.slice(atIndex + 1),
    ];
    return { path, line };
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
            maxDeviationMeters: SPUR_CLEANUP.maxDeviationMeters["foot-walking"],
            maxSpurPoints: SPUR_CLEANUP.maxSpurPoints,
        });
    });

    it("gives driving a looser deviation bound than walking", () => {
        expect(spurCleanupOptionsFor("driving-car").maxDeviationMeters).toBeGreaterThan(
            spurCleanupOptionsFor("foot-walking").maxDeviationMeters
        );
    });
});

describe("removeSpurs", () => {
    it("removes an out-and-back and restores the line it branched off", () => {
        const { path, line } = lineWithSpur(10, 20, 4, 15);

        const result = removeSpurs(path, WALKING);

        expect(result.points).toEqual(line);
        expect(result.spurs).toHaveLength(1);
        expect(result.spurs[0].joinIndex).toBe(4);
        expect(result.spurs[0].deviationMeters).toBeCloseTo(15, 0);
        expect(result.spurs[0].meters).toBeCloseTo(30, 0);
        expect(result.removedMeters).toBeCloseTo(30, 0);
    });

    it("removes several spurs in one pass", () => {
        const line = straightLine(20, 20);
        const path: [number, number][] = [];
        for (const [index, point] of line.entries()) {
            path.push(point);
            if (index % 5 === 3) path.push(offsetEast(point, 12), point);
        }

        const result = removeSpurs(path, WALKING);

        expect(result.points).toEqual(line);
        expect(result.spurs).toHaveLength(4);
    });

    it("unwinds a spur that itself has a spur on it", () => {
        const line = straightLine(8, 20);
        const join = line[3];
        const tip = offsetEast(join, 12);
        const path: [number, number][] = [
            ...line.slice(0, 4),
            tip,
            offsetNorth(tip, 10),
            tip,
            join,
            ...line.slice(4),
        ];

        const result = removeSpurs(path, WALKING);

        expect(result.points).toEqual(line);
        expect(result.spurs).toHaveLength(2);
    });

    it("leaves a route that never doubles back untouched", () => {
        const line = straightLine(50, 20);

        const result = removeSpurs(line, WALKING);

        expect(result.points).toEqual(line);
        expect(result.spurs).toEqual([]);
        expect(result.removedMeters).toBe(0);
    });

    it("keeps an out-and-back that strays too far to be a snapping artifact", () => {
        // A pier or a dead-end street the shape genuinely traces.
        const { path } = lineWithSpur(10, 20, 4, WALKING.maxDeviationMeters + 20);

        const result = removeSpurs(path, WALKING);

        expect(result.points).toEqual(path);
        expect(result.spurs).toEqual([]);
    });

    it("keeps an out-and-back longer than the length bound", () => {
        const { path } = lineWithSpur(10, 20, 4, 15);

        const result = removeSpurs(path, withOption({ maxSpurMeters: 20 }));

        expect(result.points).toEqual(path);
        expect(result.spurs).toEqual([]);
    });

    it("keeps a closed loop whose last point is its first", () => {
        const corner = straightLine(1, 0)[0];
        const side = 300;
        const loop: [number, number][] = [
            corner,
            offsetNorth(corner, side),
            offsetEast(offsetNorth(corner, side), side),
            offsetEast(corner, side),
            corner,
        ];

        const result = removeSpurs(loop, WALKING);

        expect(result.points).toEqual(loop);
        expect(result.spurs).toEqual([]);
    });

    it("keeps a figure-of-eight that legitimately revisits a junction", () => {
        const junction = straightLine(1, 0)[0];
        const side = 300;
        const northLoop: [number, number][] = [
            offsetNorth(junction, side),
            offsetEast(offsetNorth(junction, side), side),
            offsetEast(junction, side),
        ];
        const southLoop: [number, number][] = [
            offsetNorth(junction, -side),
            offsetEast(offsetNorth(junction, -side), -side),
            offsetEast(junction, -side),
        ];
        const path = [junction, ...northLoop, junction, ...southLoop, junction];

        const result = removeSpurs(path, WALKING);

        expect(result.points).toEqual(path);
        expect(result.spurs).toEqual([]);
    });

    it("is idempotent — a second pass finds nothing", () => {
        const line = straightLine(30, 20);
        const path: [number, number][] = [];
        for (const [index, point] of line.entries()) {
            path.push(point);
            if (index % 3 === 1) path.push(offsetEast(point, 10), point);
        }

        const once = removeSpurs(path, WALKING);
        const twice = removeSpurs(once.points, WALKING);

        expect(twice.spurs).toEqual([]);
        expect(twice.points).toEqual(once.points);
    });

    it("never lengthens the route and never invents a point", () => {
        const { path } = lineWithSpur(30, 20, 12, 14);

        const result = removeSpurs(path, WALKING);

        expect(pathLengthMeters(result.points)).toBeLessThan(pathLengthMeters(path));
        expect(result.points.length).toBeLessThanOrEqual(path.length);
        for (const point of result.points) {
            expect(path).toContainEqual(point);
        }
    });

    it("grows the longest edge by at most the snap radius", () => {
        const { path } = lineWithSpur(30, 20, 12, 14);

        const result = removeSpurs(path, WALKING);

        expect(maxEdge(result.points)).toBeLessThanOrEqual(maxEdge(path) + WALKING.snapMeters);
    });

    it("keeps the route contiguous across a splice", () => {
        const { path } = lineWithSpur(10, 20, 4, 15);

        const result = removeSpurs(path, WALKING);

        for (let i = 0; i < result.points.length - 1; i++) {
            expect(calculateDistance(result.points[i], result.points[i + 1])).toBeLessThanOrEqual(
                maxEdge(path) + WALKING.snapMeters
            );
        }
    });

    it("leaves a route that is entirely one excursion alone", () => {
        // Two waypoints a few metres apart, served by walking up a pavement and
        // back. Splicing this would leave a single point, which is no route and
        // not a valid GeoJSON LineString either.
        const start = straightLine(1, 0)[0];
        const path: [number, number][] = [start, offsetNorth(start, 10), start];

        const result = removeSpurs(path, WALKING);

        expect(result.points).toEqual(path);
        expect(result.spurs).toEqual([]);
        expect(result.removedMeters).toBe(0);
    });

    it("never returns a polyline too short to be a LineString", () => {
        const start = straightLine(1, 0)[0];
        const candidates: [number, number][][] = [
            [start, offsetNorth(start, 10), start],
            [start, offsetEast(start, 6), offsetNorth(start, 6), start],
            [start, offsetNorth(start, 30), offsetNorth(start, 15), start],
        ];

        for (const path of candidates) {
            const result = removeSpurs(path, WALKING);
            expect(result.points.length).toBeGreaterThanOrEqual(2);
        }
    });

    it("handles empty, single-point and two-point routes", () => {
        expect(removeSpurs([], WALKING)).toEqual({ points: [], spurs: [], removedMeters: 0 });
        expect(removeSpurs(straightLine(1, 10), WALKING).points).toHaveLength(1);
        expect(removeSpurs(straightLine(2, 10), WALKING).points).toHaveLength(2);
    });

    it("does nothing when the bounds are switched off", () => {
        const { path } = lineWithSpur(10, 20, 4, 15);

        expect(removeSpurs(path, withOption({ snapMeters: 0 })).points).toEqual(path);
        expect(removeSpurs(path, withOption({ maxSpurMeters: 0 })).points).toEqual(path);
    });

    it("stays fast on a route far longer than any real one", () => {
        const line = straightLine(10_000, 12);
        const path: [number, number][] = [];
        for (const [index, point] of line.entries()) {
            path.push(point);
            if (index % 4 === 2) path.push(offsetEast(point, 9), point);
        }

        const started = performance.now();
        const result = removeSpurs(path, WALKING);
        const elapsed = performance.now() - started;

        expect(result.points).toEqual(line);
        expect(elapsed).toBeLessThan(1000);
    });
});
