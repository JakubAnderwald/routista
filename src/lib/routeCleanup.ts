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
 * Pure and dependency-free, like `waterGeometry`: `routeQuality` measures with
 * the same function `radarService` cleans with, so the metric and the fix
 * cannot disagree.
 *
 * See `docs/technical/SPUR_CLEANUP.md` for the measurements behind the config.
 */

import { calculateDistance } from "./geoUtils";
import { GEO, SPUR_CLEANUP, TransportMode } from "@/config";

/** One excursion that left the route and rejoined it a few points later. */
export interface Spur {
    /** Index in the cleaned polyline of the point it left from and rejoined at. */
    joinIndex: number;
    /** The points that were removed, as `[lat, lng]`. */
    points: [number, number][];
    /** Length of the removed excursion, in meters. */
    meters: number;
    /** Farthest the excursion got from the point it rejoined at, in meters. */
    deviationMeters: number;
}

/** Tuning for `removeSpurs`. See `SPUR_CLEANUP` for what the numbers mean. */
export interface SpurCleanupOptions {
    /** How close two points must be to count as the same place. */
    snapMeters: number;
    /** Longest excursion that may be removed. */
    maxSpurMeters: number;
    /** Farthest an excursion may stray from its join before it is a real feature. */
    maxDeviationMeters: number;
    /** Most geometry points a single excursion may contain. */
    maxSpurPoints: number;
}

/** What `removeSpurs` produced. */
export interface SpurCleanupResult {
    /** The cleaned polyline as `[lat, lng]`. Contiguous, and never longer than the input. */
    points: [number, number][];
    /** Every excursion that was removed, in the order they were found. */
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
    return {
        snapMeters: SPUR_CLEANUP.snapMeters,
        maxSpurMeters: SPUR_CLEANUP.maxSpurMeters[mode] ?? SPUR_CLEANUP.maxSpurMeters[fallback],
        maxDeviationMeters:
            SPUR_CLEANUP.maxDeviationMeters[mode] ?? SPUR_CLEANUP.maxDeviationMeters[fallback],
        maxSpurPoints: SPUR_CLEANUP.maxSpurPoints,
    };
}

/**
 * Splices out-and-back excursions out of a routed polyline.
 *
 * Walks the route once. Whenever the next point lands back on a point the route
 * already passed through, the geometry in between is an excursion: it left and
 * came back without getting anywhere. It is removed when it is short enough to
 * be a snapping artifact rather than a feature — bounded both by its length and
 * by how far it strayed from the point it rejoined at.
 *
 * The result stays contiguous: the join point is kept and the route carries on
 * from there, so the only new edge is at most `snapMeters` longer than the one
 * it replaces. Removal is idempotent — the pass re-tests each newly formed
 * adjacency as it goes, so running it twice finds nothing the second time.
 *
 * @param points - Routed polyline as `[lat, lng]`.
 * @param options - Tuning, normally from `spurCleanupOptionsFor`.
 * @returns The cleaned polyline and what was taken out of it.
 */
export function removeSpurs(
    points: [number, number][],
    options: SpurCleanupOptions
): SpurCleanupResult {
    const { snapMeters, maxSpurMeters, maxDeviationMeters, maxSpurPoints } = options;

    if (points.length < 3 || snapMeters <= 0 || maxSpurMeters <= 0) {
        return { points: [...points], spurs: [], removedMeters: 0 };
    }

    // Grid cells one snap radius across, sized at the route's own latitude so
    // they stay roughly square. Same sizing as routeQuality's point grid.
    const midLat = points[Math.floor(points.length / 2)][0];
    const latPerCell = snapMeters / GEO.metersPerLatDegree;
    const lngPerCell =
        snapMeters / (GEO.metersPerLatDegree * Math.max(Math.cos((midLat * Math.PI) / 180), 0.01));

    /** Retained polyline. */
    const out: [number, number][] = [];
    /** Cumulative meters along `out`, so an excursion's length is a subtraction. */
    const along: number[] = [];
    /** Grid cell of each retained point, so truncation can evict without a scan. */
    const cellKeys: string[] = [];
    /** Cell key to the indices in `out` it holds, always ascending. */
    const grid = new Map<string, number[]>();

    const spurs: Spur[] = [];
    let removedMeters = 0;

    const cellOf = (p: [number, number]): [number, number] => [
        Math.floor(p[0] / latPerCell),
        Math.floor(p[1] / lngPerCell),
    ];

    const push = (p: [number, number]): void => {
        const index = out.length;
        along.push(index === 0 ? 0 : along[index - 1] + calculateDistance(out[index - 1], p));
        out.push(p);

        const [row, col] = cellOf(p);
        const key = `${row}:${col}`;
        cellKeys.push(key);
        const bucket = grid.get(key);
        if (bucket) {
            bucket.push(index);
        } else {
            grid.set(key, [index]);
        }
    };

    /** Indices of retained points in the 3x3 cell neighbourhood around `p`. */
    const neighbours = (p: [number, number]): number[] => {
        const [row, col] = cellOf(p);
        const found: number[] = [];
        for (let dRow = -1; dRow <= 1; dRow++) {
            for (let dCol = -1; dCol <= 1; dCol++) {
                const bucket = grid.get(`${row + dRow}:${col + dCol}`);
                if (bucket) found.push(...bucket);
            }
        }
        return found;
    };

    for (const point of points) {
        if (out.length === 0) {
            push(point);
            continue;
        }

        const last = out.length - 1;
        const tail = calculateDistance(out[last], point);

        // The earliest point this one rejoins, since that is the biggest splice.
        // Anything at or past `last` is the route's own tip, not a rejoin.
        let join = -1;
        for (const candidate of neighbours(point)) {
            if (candidate >= last) continue;
            if (join >= 0 && candidate >= join) continue;
            if (last - candidate > maxSpurPoints) continue;
            if (along[last] - along[candidate] + tail > maxSpurMeters) continue;
            if (calculateDistance(point, out[candidate]) > snapMeters) continue;
            join = candidate;
        }

        if (join < 0) {
            push(point);
            continue;
        }

        // How far the excursion actually got. A snapping artifact turns round
        // within a few tens of meters; a traced pier or headland does not.
        let deviationMeters = 0;
        for (let i = join + 1; i <= last; i++) {
            const strayed = calculateDistance(out[join], out[i]);
            if (strayed > deviationMeters) deviationMeters = strayed;
            if (deviationMeters > maxDeviationMeters) break;
        }

        if (deviationMeters > maxDeviationMeters) {
            push(point);
            continue;
        }

        const meters = along[last] - along[join] + tail;
        spurs.push({
            joinIndex: join,
            points: out.slice(join + 1),
            meters,
            deviationMeters,
        });
        removedMeters += meters;

        // Truncate back to the join. Buckets hold ascending indices and this
        // removes the highest index first, so the entry to drop is always the
        // last one in its bucket.
        for (let i = last; i > join; i--) {
            const bucket = grid.get(cellKeys[i]);
            if (bucket) {
                bucket.pop();
                if (bucket.length === 0) grid.delete(cellKeys[i]);
            }
            out.pop();
            along.pop();
            cellKeys.pop();
        }

        // `point` itself is dropped: it is within `snapMeters` of the join,
        // which stays, so the route carries on from there.
    }

    return { points: out, spurs, removedMeters };
}
