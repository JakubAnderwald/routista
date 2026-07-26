/**
 * Spur cleanup: removing out-and-back excursions from a routed polyline.
 *
 * Every waypoint Routista sends is a forced via-point, and they sit ~40 m
 * apart. Whenever one snaps to a driveway, a service road, a cul-de-sac or the
 * far carriageway of a divided road, Radar has to drive in and back out again —
 * a branch off the road that turns round and comes back through the same
 * branch, adding kilometres for nothing. Radar's directions API has no snap
 * radius, no bearings and no U-turn suppression, so the only place to fix it is
 * the geometry it returns.
 *
 * Two decisions define this module, and both came from measurement:
 *
 * 1. **An excursion is found by projecting onto the retained line, not by
 *    matching its points.** A spur that walks up one pavement and back down the
 *    other never revisits a coordinate, so matching points misses it entirely —
 *    which is why an earlier version left most of them in place.
 * 2. **An excursion is kept only when the shape needs it.** Not "how far did it
 *    stray", which cannot tell a pointless 300 m detour from a 300 m headland
 *    the outline really traces. The question that can is: if this were cut,
 *    would any requested waypoint be left stranded from the route?
 *
 * Pure and dependency-free, like `waterGeometry`: `routeQuality` measures with
 * the same function `radarService` cleans with, so the metric and the fix
 * cannot disagree.
 *
 * See `docs/technical/SPUR_CLEANUP.md` for the measurements behind the config.
 */

import { calculateDistance, distanceToSegmentMeters } from "./geoUtils";
import { GEO, SPUR_CLEANUP, TransportMode } from "@/config";

/** One excursion that left the route and rejoined it further on. */
export interface Spur {
    /** Index of the last point before it left. The cut keeps this one. */
    from: number;
    /** Index of the point that rejoined the line. The cut resumes here. */
    to: number;
    /**
     * Where on segment `from -> from + 1` it rejoined.
     *
     * Kept in the cleaned line so the route follows the road up to the point it
     * came back, rather than jumping to the segment's start.
     */
    rejoin: [number, number];
    /** Length of the removed excursion, in meters. */
    meters: number;
}

/** Tuning for `removeSpurs`. See `SPUR_CLEANUP` for what the numbers mean. */
export interface SpurCleanupOptions {
    /** How close the line must come to itself to count as rejoining. */
    snapMeters: number;
    /** Longest excursion that may be removed. */
    maxSpurMeters: number;
    /** How far a requested waypoint may be left from the route by a removal. */
    maxShapeLossMeters: number;
    /** Most geometry points a single excursion may contain. */
    maxSpurPoints: number;
    /** How many detect-and-cut passes to run. */
    maxPasses: number;
}

/** What `removeSpurs` produced. */
export interface SpurCleanupResult {
    /** The cleaned polyline as `[lat, lng]`. Contiguous, never longer than the input. */
    points: [number, number][];
    /** Every excursion that was removed. */
    spurs: Spur[];
    /** Total length of the removed excursions, in meters. */
    removedMeters: number;
}

/**
 * The cleanup settings for a transport mode.
 *
 * @param mode - Transport mode.
 * @returns Options for `removeSpurs`, falling back to cycling for unknown modes.
 */
export function spurCleanupOptionsFor(mode: TransportMode): SpurCleanupOptions {
    const fallback: TransportMode = "cycling-regular";
    const pick = (table: Record<TransportMode, number>) => table[mode] ?? table[fallback];

    return {
        snapMeters: SPUR_CLEANUP.snapMeters,
        maxSpurMeters: pick(SPUR_CLEANUP.maxSpurMeters),
        maxShapeLossMeters: pick(SPUR_CLEANUP.maxShapeLossMeters),
        maxSpurPoints: SPUR_CLEANUP.maxSpurPoints,
        maxPasses: SPUR_CLEANUP.maxPasses,
    };
}

/**
 * Removes out-and-back excursions the requested shape does not need.
 *
 * Runs detect-and-cut until nothing more can go. Each pass walks the line and
 * flags every stretch that leaves it and comes back within `snapMeters`, then
 * cuts only those whose removal leaves every requested waypoint no worse off
 * than `maxShapeLossMeters` from the route.
 *
 * The result stays contiguous — the two ends of a cut are within `snapMeters`
 * of each other — and settles, so running it again finds nothing.
 *
 * @param points - Routed polyline as `[lat, lng]`.
 * @param waypoints - The shape the route was asked to follow, as `[lat, lng]`.
 *   An empty array removes every excursion, regardless of the shape.
 * @param options - Tuning, normally from `spurCleanupOptionsFor`.
 * @returns The cleaned polyline and what was taken out of it.
 */
export function removeSpurs(
    points: [number, number][],
    waypoints: [number, number][],
    options: SpurCleanupOptions
): SpurCleanupResult {
    if (points.length < 3 || options.snapMeters <= 0 || options.maxSpurMeters <= 0) {
        return { points: [...points], spurs: [], removedMeters: 0 };
    }

    let current = points;
    const spurs: Spur[] = [];
    let removedMeters = 0;

    for (let pass = 0; pass < options.maxPasses; pass++) {
        const candidates = findExcursions(current, options);
        if (candidates.length === 0) break;

        const grid = buildSegmentGrid(current, options.maxShapeLossMeters);
        const removable = candidates.filter(candidate =>
            shapeSurvivesWithout(current, waypoints, candidate, grid, options)
        );
        if (removable.length === 0) break;

        const { points: next, applied } = cut(current, removable);
        // A route that is entirely one excursion collapses to its start point,
        // which is no route and not a valid GeoJSON LineString either.
        if (next.length < 2) break;

        // Only what the cut actually took out: nested candidates can share a
        // start, and the outermost of those is the one that gets applied.
        for (const candidate of applied) {
            spurs.push(candidate);
            removedMeters += candidate.meters;
        }
        current = next;
    }

    return { points: current, spurs, removedMeters };
}

/**
 * Every stretch of the line that leaves it and comes back on itself.
 *
 * Walks the line keeping the part that has not doubled back. When the next
 * point lands within `snapMeters` of a *segment* of that part, everything since
 * is an excursion. Projecting onto segments rather than matching points is what
 * catches a spur that returns along the other side of the street.
 *
 * @param points - Polyline as `[lat, lng]`.
 * @param options - Tuning.
 * @returns Non-overlapping excursions as index ranges into `points`.
 */
function findExcursions(points: [number, number][], options: SpurCleanupOptions): Spur[] {
    const { snapMeters, maxSpurMeters, maxSpurPoints } = options;

    /** Indices into `points` of the part that has not doubled back. */
    const kept: number[] = [];
    /** Cumulative meters along `kept`. */
    const along: number[] = [];
    const found: Spur[] = [];

    const push = (index: number) => {
        const step =
            kept.length === 0 ? 0 : calculateDistance(points[kept[kept.length - 1]], points[index]);
        along.push((kept.length === 0 ? 0 : along[kept.length - 1]) + step);
        kept.push(index);
    };

    for (let i = 0; i < points.length; i++) {
        if (kept.length < 3) {
            push(i);
            continue;
        }

        const last = kept.length - 1;
        const tail = calculateDistance(points[kept[last]], points[i]);

        // The earliest segment this point rejoins, since that is the biggest
        // cut. Segments nearer than two back are the line's own tip.
        let join = -1;
        for (let k = last - 2; k >= 0; k--) {
            if (along[last] - along[k] + tail > maxSpurMeters) break;
            if (last - k > maxSpurPoints) break;
            const gap = distanceToSegmentMeters(points[i], points[kept[k]], points[kept[k + 1]]);
            if (gap <= snapMeters) join = k;
        }

        if (join < 0) {
            push(i);
            continue;
        }

        const rejoin = projectOnSegment(points[i], points[kept[join]], points[kept[join] + 1]);
        // What the cut actually saves: the route from where it came back,
        // around the excursion and up to the point that rejoined, less the one
        // short edge the cut leaves behind.
        const removed =
            along[last] -
            along[join] -
            calculateDistance(points[kept[join]], rejoin) +
            tail -
            calculateDistance(rejoin, points[i]);

        found.push({ from: kept[join], to: i, rejoin, meters: Math.max(0, removed) });

        while (kept.length > join + 1) {
            kept.pop();
            along.pop();
        }
    }

    return found;
}

/**
 * The point on segment `v -> w` closest to `p`.
 *
 * Uses the same local equirectangular projection as `distanceToSegmentMeters`,
 * which is exact enough over the tens of metres this is used for.
 *
 * @param p - The point being projected.
 * @param v - Segment start as `[lat, lng]`.
 * @param w - Segment end as `[lat, lng]`.
 * @returns The closest point on the segment, as `[lat, lng]`.
 */
function projectOnSegment(
    p: [number, number],
    v: [number, number],
    w: [number, number]
): [number, number] {
    const metersPerLng = (40075000 * Math.cos((v[0] * Math.PI) / 180)) / 360;

    const x = (p[1] - v[1]) * metersPerLng;
    const y = (p[0] - v[0]) * GEO.metersPerLatDegree;
    const dx = (w[1] - v[1]) * metersPerLng;
    const dy = (w[0] - v[0]) * GEO.metersPerLatDegree;

    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared === 0) return [v[0], v[1]];

    const t = Math.min(1, Math.max(0, (x * dx + y * dy) / lengthSquared));
    return [v[0] + (w[0] - v[0]) * t, v[1] + (w[1] - v[1]) * t];
}

/**
 * Whether the shape still gets what it asked for once an excursion is cut.
 *
 * Only waypoints the excursion was serving can be affected, so those are the
 * only ones checked: for each, the distance to the line without the excursion
 * must be within `maxShapeLossMeters`, or no worse than it already was. That
 * second clause matters — a waypoint the router never reached in the first
 * place must not keep an excursion alive.
 *
 * @param points - The polyline the excursion indexes into.
 * @param waypoints - The requested shape.
 * @param spur - The excursion under consideration.
 * @param grid - Segment index over `points`.
 * @param options - Tuning.
 * @returns True when the excursion can go.
 */
function shapeSurvivesWithout(
    points: [number, number][],
    waypoints: [number, number][],
    spur: Spur,
    grid: SegmentGrid,
    options: SpurCleanupOptions
): boolean {
    if (waypoints.length === 0) return true;

    const limit = options.maxShapeLossMeters;
    const reach = options.maxSpurMeters + limit;

    for (const waypoint of waypoints) {
        // A waypoint far from where the excursion starts cannot be relying on
        // it: `maxSpurMeters` bounds how far the excursion can reach.
        if (calculateDistance(waypoint, points[spur.from]) > reach) continue;

        const served = distanceToRange(waypoint, points, spur.from, spur.to);
        if (served > limit) continue; // It was not being served here anyway.

        if (distanceWithoutSpur(waypoint, points, spur, grid) > limit) return false;
    }

    return true;
}

/** Distance from a point to the segments of `points` in `[from, to)`. */
function distanceToRange(
    p: [number, number],
    points: [number, number][],
    from: number,
    to: number
): number {
    let best = Infinity;
    const end = Math.min(to, points.length - 1);
    for (let i = from; i < end; i++) {
        const d = distanceToSegmentMeters(p, points[i], points[i + 1]);
        if (d < best) best = d;
    }
    return best;
}

/**
 * Distance from a point to the polyline once an excursion is cut out.
 *
 * The two ends of the cut are within `snapMeters` of each other, so the join
 * they collapse to is included as a segment in its own right.
 */
function distanceWithoutSpur(
    p: [number, number],
    points: [number, number][],
    spur: Spur,
    grid: SegmentGrid
): number {
    let best = distanceToSegmentMeters(p, points[spur.from], points[spur.to]);

    for (const i of grid.near(p)) {
        if (i >= spur.from && i < spur.to) continue;
        const d = distanceToSegmentMeters(p, points[i], points[i + 1]);
        if (d < best) best = d;
    }
    return best;
}

/**
 * Rebuilds the line with a set of excursions taken out.
 *
 * Each cut keeps everything up to the segment the line came back to, then the
 * point on that segment where it came back, then carries on from the point that
 * rejoined. So the route stays on real road geometry and the one edge the cut
 * creates is no longer than `snapMeters`.
 *
 * Nested excursions can share a start; the outermost wins, and anything already
 * consumed is skipped.
 *
 * @param points - The polyline.
 * @param spurs - Excursions to remove.
 * @returns The polyline without them, and the ones actually taken out.
 */
function cut(
    points: [number, number][],
    spurs: Spur[]
): { points: [number, number][]; applied: Spur[] } {
    const ordered = [...spurs].sort((a, b) => a.from - b.from || b.to - a.to);

    const out: [number, number][] = [];
    // The rejoin point and the point that rejoined are within snapMeters of each
    // other by definition, and often the same place, so drop the duplicate.
    const push = (p: [number, number]) => {
        if (out.length > 0 && calculateDistance(out[out.length - 1], p) < 1) return;
        out.push(p);
    };

    const applied: Spur[] = [];
    let i = 0;
    for (const spur of ordered) {
        if (spur.from < i || spur.to <= i) continue;
        while (i <= spur.from) push(points[i++]);
        push(spur.rejoin);
        i = spur.to;
        applied.push(spur);
    }
    while (i < points.length) push(points[i++]);

    return { points: out, applied };
}

/** Segment index over a polyline, so a nearest-segment query stays local. */
interface SegmentGrid {
    /** Segment indices whose geometry passes near `p`. */
    near(p: [number, number]): number[];
}

/**
 * Buckets every segment into the grid cells it passes through.
 *
 * Cells are sized so that the 3x3 neighbourhood around a query point always
 * covers at least `radiusMeters` in every direction, which is all the shape
 * loss test needs to look at. Long segments are walked cell by cell rather than
 * bucketed by their endpoints, so a 500 m bridge is still found from its middle.
 *
 * @param points - The polyline.
 * @param radiusMeters - Longest distance a query has to resolve.
 * @returns The index.
 */
function buildSegmentGrid(points: [number, number][], radiusMeters: number): SegmentGrid {
    const cellMeters = Math.max(radiusMeters, 25);
    const midLat = points[Math.floor(points.length / 2)][0];
    const latPerCell = cellMeters / GEO.metersPerLatDegree;
    const lngPerCell =
        cellMeters / (GEO.metersPerLatDegree * Math.max(Math.cos((midLat * Math.PI) / 180), 0.01));

    const cells = new Map<string, number[]>();
    const key = (lat: number, lng: number) =>
        `${Math.floor(lat / latPerCell)}:${Math.floor(lng / lngPerCell)}`;

    const add = (lat: number, lng: number, index: number) => {
        const id = key(lat, lng);
        const bucket = cells.get(id);
        if (bucket) {
            if (bucket[bucket.length - 1] !== index) bucket.push(index);
        } else {
            cells.set(id, [index]);
        }
    };

    for (let i = 0; i < points.length - 1; i++) {
        const [aLat, aLng] = points[i];
        const [bLat, bLng] = points[i + 1];
        const steps = Math.max(
            1,
            Math.ceil(Math.max(Math.abs(bLat - aLat) / latPerCell, Math.abs(bLng - aLng) / lngPerCell))
        );
        for (let s = 0; s <= steps; s++) {
            const t = s / steps;
            add(aLat + (bLat - aLat) * t, aLng + (bLng - aLng) * t, i);
        }
    }

    return {
        near(p: [number, number]): number[] {
            const row = Math.floor(p[0] / latPerCell);
            const col = Math.floor(p[1] / lngPerCell);
            const found: number[] = [];
            for (let dRow = -1; dRow <= 1; dRow++) {
                for (let dCol = -1; dCol <= 1; dCol++) {
                    const bucket = cells.get(`${row + dRow}:${col + dCol}`);
                    if (bucket) found.push(...bucket);
                }
            }
            return found;
        },
    };
}
