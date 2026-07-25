/**
 * Routing shapes over rivers via bridges.
 *
 * GitHub issue #47: Radar's foot and bike profiles route along the ferry ways
 * in the Thames, so any waypoint that lands in the water snaps onto that ferry
 * and the route travels down the middle of the river.
 *
 * The cure is to stop handing the router waypoints that sit in water. Every
 * unbroken run of in-water waypoints is re-anchored onto the nearest bridge
 * that actually crosses the water, so the shape keeps its extent and visibly
 * funnels over a crossing.
 *
 * Pure and dependency-free: water and bridge geometry are passed in, so this
 * can be tested against committed fixtures. `overpassService` supplies them at
 * runtime.
 */

import { Feature, FeatureCollection } from "geojson";
import { calculateDistance, distanceToSegmentMeters } from "./geoUtils";
import { isPointInWater, pathWaterMeters, pathWaterStats, WaterIndex } from "./waterGeometry";
import { RIVER_CROSSING } from "@/config";
import { GEO } from "@/config";

/** A bridge that crosses water, assembled from one or more OSM ways. */
export interface Bridge {
    /** Centreline as `[lat, lng]`, running bank to bank. */
    path: [number, number][];
    /** Length of the centreline in meters. */
    lengthMeters: number;
    /** OSM `highway` value, used to prefer bridges people can walk on. */
    highway: string;
    name?: string;
}

/** Bridges that cross water, ready for nearest-crossing queries. */
export interface BridgeIndex {
    bridges: Bridge[];
}

/** One repaired river crossing. */
export interface PlannedCrossing {
    /** Index in the original waypoint list where the in-water run started. */
    startIndex: number;
    /** How many in-water waypoints the bridge replaced. */
    replacedWaypoints: number;
    bridgeName?: string;
    /** Extra distance the diversion costs, in meters. */
    detourMeters: number;
    /** True when the shape dipped into the water and returned to the same bank. */
    sameBank: boolean;
}

/** Result of re-anchoring a shape's in-water sections onto bridges. */
export interface CrossingPlan {
    /** Waypoints to route, with in-water runs replaced by bridge crossings. */
    waypoints: [number, number][];
    crossings: PlannedCrossing[];
    /** In-water runs with no usable bridge nearby; these were dropped. */
    unbridgedRuns: number;
    /** Waypoints that started in water. */
    waypointsInWater: number;
}

/** Highway classes a pedestrian or cyclist can use, best first. */
const WALKABLE_HIGHWAYS = [
    "footway",
    "pedestrian",
    "path",
    "cycleway",
    "living_street",
    "residential",
    "unclassified",
    "tertiary",
    "secondary",
    "primary",
];

/**
 * Assembles OSM bridge ways into whole crossings and keeps the ones that
 * actually span water.
 *
 * OSM splits a single bridge into several ways, so ways are chained end to end
 * within a name group first. A crossing qualifies when both ends are on land
 * and some of the middle is over water — which is what a bridge is, and what
 * excludes flyovers and viaducts over dry ground.
 *
 * @param collection - GeoJSON carrying bridge LineStrings (`properties.kind === "bridge"`).
 * @param water - Water index the bridges are tested against.
 * @returns Index of water-crossing bridges.
 */
export function buildBridgeIndex(
    collection: FeatureCollection | null | undefined,
    water: WaterIndex
): BridgeIndex {
    const groups = new Map<string, Feature[]>();

    for (const feature of collection?.features ?? []) {
        if (feature.properties?.kind !== "bridge") continue;
        if (feature.geometry?.type !== "LineString") continue;

        // Ways of the same named bridge chain together; unnamed ways are kept
        // apart so unrelated ways meeting at a junction do not merge.
        const key = feature.properties.name
            ? `named:${feature.properties.name}`
            : `way:${groups.size}`;
        const group = groups.get(key);
        if (group) {
            group.push(feature);
        } else {
            groups.set(key, [feature]);
        }
    }

    const bridges: Bridge[] = [];

    for (const group of groups.values()) {
        const segments = group.map(feature =>
            (feature.geometry as { coordinates: number[][] }).coordinates.map(
                ([lng, lat]) => [lat, lng] as [number, number]
            )
        );

        for (const path of chainSegments(segments)) {
            if (path.length < 2) continue;
            if (isPointInWater(path[0], water)) continue;
            if (isPointInWater(path[path.length - 1], water)) continue;
            if (pathWaterMeters(path, water) < RIVER_CROSSING.minBridgeSpanMeters) continue;

            bridges.push({
                path,
                lengthMeters: pathLength(path),
                highway: String(group[0].properties?.highway ?? "unclassified"),
                name: group[0].properties?.name as string | undefined,
            });
        }
    }

    return { bridges };
}

/**
 * Replaces every run of in-water waypoints with a crossing over the nearest
 * suitable bridge.
 *
 * Closed shapes are rotated to start on land first, so a run that straddles
 * the seam — which is exactly where the reported heart-over-London breaks — is
 * handled as one run rather than two.
 *
 * @param waypoints - Shape waypoints as `[lat, lng]`.
 * @param water - Water index for the area.
 * @param bridges - Bridge index from `buildBridgeIndex`.
 * @returns The waypoints to route, plus what was changed.
 */
export function planCrossings(
    waypoints: [number, number][],
    water: WaterIndex,
    bridges: BridgeIndex
): CrossingPlan {
    const empty: CrossingPlan = {
        waypoints,
        crossings: [],
        unbridgedRuns: 0,
        waypointsInWater: 0,
    };
    if (waypoints.length < 2) return empty;

    const closed =
        calculateDistance(waypoints[0], waypoints[waypoints.length - 1]) <
        GEO.closedLoopThresholdMeters;
    // A closed ring repeats its first point; work on the open sequence.
    const ring = closed ? waypoints.slice(0, -1) : waypoints;

    const inWater = ring.map(point => isPointInWater(point, water));
    const waypointsInWater = inWater.filter(Boolean).length;
    if (waypointsInWater === 0) return empty;
    if (waypointsInWater === inWater.length) {
        // The whole shape sits in the water; there is nothing to anchor to.
        return { ...empty, waypointsInWater };
    }

    const rotation = closed ? inWater.indexOf(false) : 0;
    const rotated = rotate(ring, rotation);
    const rotatedInWater = rotate(inWater, rotation);

    const output: [number, number][] = [];
    const crossings: PlannedCrossing[] = [];
    let unbridgedRuns = 0;
    let index = 0;

    while (index < rotated.length) {
        if (!rotatedInWater[index]) {
            output.push(rotated[index]);
            index++;
            continue;
        }

        let end = index;
        while (end + 1 < rotated.length && rotatedInWater[end + 1]) end++;

        // The land waypoints either side of the run. For a rotated closed ring
        // the run can never start at 0, and a run that reaches the end wraps
        // back to the first point.
        const before = output[output.length - 1] ?? rotated[0];
        const after = rotated[end + 1] ?? (closed ? rotated[0] : rotated[rotated.length - 1]);

        const bridge = chooseBridge(before, after, rotated.slice(index, end + 1), bridges, water);

        if (bridge) {
            output.push(...bridge.crossing);
            crossings.push({
                startIndex: (index + rotation) % ring.length,
                replacedWaypoints: end - index + 1,
                bridgeName: bridge.bridge.name,
                detourMeters: Math.round(bridge.detourMeters),
                sameBank: bridge.sameBank,
            });
        } else {
            // Nothing to cross on: drop the run and let the router connect the
            // two banks however it can.
            unbridgedRuns++;
        }

        index = end + 1;
    }

    const deduped = dedupeAdjacent(output);
    const result = closed && deduped.length > 0 ? [...deduped, deduped[0]] : deduped;

    return {
        waypoints: result.length >= 2 ? result : waypoints,
        crossings,
        unbridgedRuns,
        waypointsInWater,
    };
}

/** A chosen crossing: which bridge, the waypoints to route, and what it costs. */
export interface ChosenCrossing {
    bridge: Bridge;
    /** Waypoints replacing the in-water run. */
    crossing: [number, number][];
    /** Extra distance the diversion adds, in meters. */
    detourMeters: number;
    /** True when the shape dips into the water and returns to the same bank. */
    sameBank: boolean;
}

/**
 * Picks the bridge that gets from `before` to `after` for the least extra
 * distance, and returns the waypoints that route over it.
 *
 * A bridge only qualifies if the shape can reach its near end without crossing
 * water. When `before` and `after` are on opposite banks the far end has to
 * reach `after` the same way; when they are on the same bank — a shape that
 * dips into the river and comes back — the crossing goes over and back, so the
 * shape keeps its extent.
 *
 * @param before - Land waypoint before the in-water run.
 * @param after - Land waypoint after the in-water run.
 * @param run - The in-water waypoints being replaced.
 * @param bridges - Candidate bridges.
 * @param water - Water index, used to check the approaches stay on land.
 * @param maxDetourMeters - Reject crossings that add more than this.
 * @returns The chosen crossing, or null if no bridge fits.
 */
export function chooseBridge(
    before: [number, number],
    after: [number, number],
    run: [number, number][],
    bridges: BridgeIndex,
    water: WaterIndex,
    maxDetourMeters: number = RIVER_CROSSING.maxBridgeDetourMeters
): ChosenCrossing | null {
    if (run.length === 0) return null;

    const tolerance = RIVER_CROSSING.approachWaterToleranceMeters;
    const centre = centroid(run);
    const direct = calculateDistance(before, after);
    const sameBank = !crossesWater(before, after, water, tolerance);

    let best: ChosenCrossing | null = null;
    let bestCost = Infinity;

    for (const bridge of bridges.bridges) {
        if (nearestDistanceTo(centre, bridge.path) > RIVER_CROSSING.maxBridgeSearchMeters) {
            continue;
        }

        const forward = bridge.path;
        const backward = [...bridge.path].reverse();
        const entryFirst =
            calculateDistance(before, forward[0]) <= calculateDistance(before, backward[0]);
        const oriented = entryFirst ? forward : backward;
        const entry = oriented[0];
        const exit = oriented[oriented.length - 1];

        // The shape has to be able to walk to the bridge head. A bridge whose
        // near end is across the water is not the crossing we need.
        if (crossesWater(before, entry, water, tolerance)) continue;

        // Both ends of the span, so the router has to use the bridge rather
        // than find its own way across. A shape that dips into the river and
        // comes back goes over and back, turning round past the far abutment
        // so the return leg is a second crossing rather than one long run
        // through the water.
        const crossing: [number, number][] = sameBank
            ? [entry, extendBeyondWater(oriented, water), entry]
            : [entry, exit];

        if (!sameBank && crossesWater(exit, after, water, tolerance)) continue;

        const travelled =
            calculateDistance(before, entry) +
            bridge.lengthMeters * (sameBank ? 2 : 1) +
            calculateDistance(sameBank ? entry : exit, after);

        // Prefer bridges people can actually walk over; a motorway bridge is a
        // last resort rather than a disqualification.
        const rank = WALKABLE_HIGHWAYS.indexOf(bridge.highway);
        const penalty = rank === -1 ? RIVER_CROSSING.unwalkableBridgePenaltyMeters : rank * 5;
        const cost = travelled + penalty;

        if (cost < bestCost) {
            bestCost = cost;
            best = { bridge, crossing, detourMeters: Math.max(0, travelled - direct), sameBank };
        }
    }

    if (!best) return null;
    if (best.detourMeters > maxDetourMeters) return null;

    return best;
}

/**
 * Works out what to pin between two waypoints whose route travels on water.
 *
 * There are two reasons a leg ends up on the water, and they need opposite
 * repairs. If the straight line between the waypoints never touches water, the
 * router has wandered off to a pier for no reason, and a single point on land
 * between them takes that freedom away. If the line does cross water, the leg
 * needs a real bridge.
 *
 * @param from - First waypoint.
 * @param to - Second waypoint.
 * @param bridges - Candidate bridges.
 * @param water - Water index for the area.
 * @returns Waypoints to insert between the two, or an empty array if none fit.
 */
export function crossingWaypointsBetween(
    from: [number, number],
    to: [number, number],
    bridges: BridgeIndex,
    water: WaterIndex
): [number, number][] {
    const lerp = (t: number): [number, number] => [
        from[0] + (to[0] - from[0]) * t,
        from[1] + (to[1] - from[1]) * t,
    ];

    if (!crossesWater(from, to, water, RIVER_CROSSING.approachWaterToleranceMeters)) {
        // Nothing in the way; hold the route to the direct line.
        for (const t of [0.5, 0.34, 0.66, 0.25, 0.75]) {
            const candidate = lerp(t);
            if (!isPointInWater(candidate, water)) return [candidate];
        }
        return [];
    }

    // A ferry is worse than any bridge, so accept a longer diversion here than
    // when planning the shape.
    return (
        chooseBridge(from, to, [lerp(0.5)], bridges, water, RIVER_CROSSING.maxRepairDetourMeters)
            ?.crossing ?? []
    );
}

/**
 * Pins a bridge into any leg whose route still travels along water.
 *
 * Moving waypoints out of the water is not always enough: Radar will divert to
 * a pier and back even when both ends of a leg are on dry land. Naming the
 * crossing takes that freedom away.
 *
 * @param waypoints - The waypoints that were routed.
 * @param legPaths - Routed geometry per leg, keyed by the leg's start index.
 * @param water - Water index for the area.
 * @param bridges - Bridge index for the area.
 * @param longEdgeThresholdMeters - Longest plausible edge for the mode.
 * @returns Waypoints with crossings inserted, and how many legs were repaired.
 */
export function repairWaterLegs(
    waypoints: [number, number][],
    legPaths: Map<number, [number, number][]>,
    water: WaterIndex,
    bridges: BridgeIndex,
    longEdgeThresholdMeters: number
): { waypoints: [number, number][]; repaired: number } {
    const insertions: { index: number; points: [number, number][] }[] = [];

    for (const [index, path] of legPaths) {
        if (insertions.length >= RIVER_CROSSING.maxPostRouteRepairs) break;

        const from = waypoints[index];
        const to = waypoints[index + 1];
        if (!from || !to) continue;

        // Two ways a leg gives itself away. Total water, not the longest run,
        // because ferry excursions weave past piers and islands which breaks
        // one long stretch into several short ones. And a single edge over
        // water longer than any street, which catches short legs whose total
        // never reaches the threshold.
        const stats = pathWaterStats(path, water);
        const ferried =
            stats.totalWaterMeters >= RIVER_CROSSING.maxLegWaterMeters ||
            hasLongWaterEdge(path, longEdgeThresholdMeters, water);
        if (!ferried) continue;

        const crossing = crossingWaypointsBetween(from, to, bridges, water);
        if (crossing.length > 0) insertions.push({ index, points: crossing });
    }

    if (insertions.length === 0) return { waypoints, repaired: 0 };

    // Back to front, so earlier indices stay valid.
    const repaired = [...waypoints];
    for (const insertion of insertions.sort((a, b) => b.index - a.index)) {
        repaired.splice(insertion.index + 1, 0, ...insertion.points);
    }

    return { waypoints: repaired, repaired: insertions.length };
}

/**
 * True when a straight line between two points actually traverses water.
 *
 * Measured on the longest unbroken stretch rather than the total: waypoints sit
 * on embankments, so a line along the bank grazes the polygon repeatedly
 * without ever crossing, while a line to the far side goes through the whole
 * width of the river in one go.
 */
function crossesWater(
    from: [number, number],
    to: [number, number],
    water: WaterIndex,
    toleranceMeters: number
): boolean {
    return pathWaterStats([from, to], water).maxContiguousWaterMeters > toleranceMeters;
}

/**
 * True when a path contains a single edge over water longer than any street.
 *
 * This is the ferry signature: real pedestrian networks have no 300 m edges,
 * least of all over a river.
 */
function hasLongWaterEdge(
    path: [number, number][],
    thresholdMeters: number,
    water: WaterIndex
): boolean {
    for (let i = 0; i < path.length - 1; i++) {
        if (calculateDistance(path[i], path[i + 1]) <= thresholdMeters) continue;

        const midpoint: [number, number] = [
            (path[i][0] + path[i + 1][0]) / 2,
            (path[i][1] + path[i + 1][1]) / 2,
        ];
        if (isPointInWater(midpoint, water)) return true;
    }
    return false;
}

/**
 * Finds a turnaround point just past the far end of a bridge, clear of the
 * water.
 *
 * OSM bridge ways end at the abutment, which usually still sits inside the
 * water polygon. Turning round there would make the outbound and return legs
 * one unbroken run through the water, so the far end is extrapolated along the
 * bridge's own bearing until it is on dry land with a margin to spare.
 *
 * @param path - Bridge centreline, oriented entry to exit.
 * @param water - Water index for the area.
 * @returns A point past the exit that is on land, or the exit if none is found.
 */
function extendBeyondWater(path: [number, number][], water: WaterIndex): [number, number] {
    const exit = path[path.length - 1];
    const previous = path[path.length - 2] ?? path[0];

    const span = calculateDistance(previous, exit);
    if (span === 0) return exit;

    const stepLat = ((exit[0] - previous[0]) / span) * RIVER_CROSSING.turnaroundStepMeters;
    const stepLng = ((exit[1] - previous[1]) / span) * RIVER_CROSSING.turnaroundStepMeters;

    const steps = Math.ceil(
        RIVER_CROSSING.maxTurnaroundMeters / RIVER_CROSSING.turnaroundStepMeters
    );
    let clearSteps = 0;

    for (let i = 1; i <= steps; i++) {
        const candidate: [number, number] = [exit[0] + stepLat * i, exit[1] + stepLng * i];
        if (isPointInWater(candidate, water)) {
            clearSteps = 0;
            continue;
        }

        clearSteps++;
        // Two clear steps in a row, so we are past the bank rather than over a
        // gap between water polygons.
        if (clearSteps >= 2) return candidate;
    }

    return exit;
}

/** Chains open line segments end to end wherever their endpoints meet. */
function chainSegments(segments: [number, number][][]): [number, number][][] {
    const remaining = segments.map(segment => [...segment]);
    const chains: [number, number][][] = [];

    while (remaining.length > 0) {
        let chain = remaining.shift()!;
        let extended = true;

        while (extended) {
            extended = false;

            for (let i = 0; i < remaining.length; i++) {
                const candidate = remaining[i];
                const head = chain[0];
                const tail = chain[chain.length - 1];

                if (touches(tail, candidate[0])) {
                    chain = [...chain, ...candidate.slice(1)];
                } else if (touches(tail, candidate[candidate.length - 1])) {
                    chain = [...chain, ...[...candidate].reverse().slice(1)];
                } else if (touches(head, candidate[candidate.length - 1])) {
                    chain = [...candidate.slice(0, -1), ...chain];
                } else if (touches(head, candidate[0])) {
                    chain = [...[...candidate].reverse().slice(0, -1), ...chain];
                } else {
                    continue;
                }

                remaining.splice(i, 1);
                extended = true;
                break;
            }
        }

        chains.push(chain);
    }

    return chains;
}

/** True when two points are the same OSM node, within rounding. */
function touches(a: [number, number], b: [number, number]): boolean {
    return Math.abs(a[0] - b[0]) < 1e-7 && Math.abs(a[1] - b[1]) < 1e-7;
}

/** Total length of a path in meters. */
function pathLength(path: [number, number][]): number {
    let total = 0;
    for (let i = 0; i < path.length - 1; i++) {
        total += calculateDistance(path[i], path[i + 1]);
    }
    return total;
}

/** Shortest distance from a point to any part of a path, in meters. */
function nearestDistanceTo(point: [number, number], path: [number, number][]): number {
    let closest = Infinity;
    for (let i = 0; i < path.length - 1; i++) {
        closest = Math.min(closest, distanceToSegmentMeters(point, path[i], path[i + 1]));
    }
    return path.length === 1 ? calculateDistance(point, path[0]) : closest;
}

/** Average position of a set of points. */
function centroid(points: [number, number][]): [number, number] {
    const sum = points.reduce((acc, [lat, lng]) => [acc[0] + lat, acc[1] + lng], [0, 0]);
    return [sum[0] / points.length, sum[1] / points.length];
}

/** Rotates an array so it starts at `offset`. */
function rotate<T>(items: T[], offset: number): T[] {
    if (offset <= 0) return items;
    return [...items.slice(offset), ...items.slice(0, offset)];
}

/** Drops consecutive duplicate waypoints left behind by a replacement. */
function dedupeAdjacent(points: [number, number][]): [number, number][] {
    return points.filter(
        (point, i) => i === 0 || calculateDistance(points[i - 1], point) > 1
    );
}
