/**
 * The route quality invariants, shared by the offline and live suites.
 *
 * Each invariant is checked both ways. A scenario that does not list it under
 * `knownIssues` must satisfy it; a scenario that does must still *fail* it, so
 * a case cannot be quietly fixed and left on the list, and cannot regress into
 * the list unnoticed.
 */

import { expect } from "vitest";
import { ROUTE_QUALITY } from "@/config";
import { Scenario } from "../fixtures/scenarios";
import { ScenarioMetrics } from "./routeMeasurement";

/**
 * Longest single edge a walking or cycling route may contain.
 *
 * Bridge spans in the matrix reach 387 m, so this only catches ways no
 * pedestrian network has: ferries and road tunnels.
 */
export const MAX_EDGE_METERS = 400;

/**
 * Scenarios whose longest edge is a verified real crossing wider than that.
 *
 * Edge length alone cannot separate a wide bridge from a tunnel or a ferry —
 * that is what the water invariant is for — so where a span has been checked
 * against OSM and found genuine, the bound is raised to just above it. It stays
 * a bound: anything longer than the real structure still fails.
 */
export const WIDE_SPAN_METERS: Record<string, number> = {
    // Most Slasko-Dabrowski over the Wisla. The river is 235 m wide here and
    // Radar returns the whole structure and its approaches as one 489 m edge.
    // Verified against OSM: way 1028356267, bridge=yes, with bridged footway
    // sidewalks either side. The nearest ferry way, Prom Wilga, is 558 m away
    // and this route does not touch it.
    "warsaw-heart-foot": 500,

    // Erzsebet hid over the Duna, 451 m end to end. Verified against OSM: ways
    // 485689912 / 581325727 / 1346291144, bridge=yes, with bridged footways
    // either side. This scenario used to cross elsewhere at 387 m; the spur
    // cleanup removed the detour that took it there.
    "budapest-heart-foot": 470,
};

/** Bounds on how far a walking route may stray from the shape it was given. */
export const MAX_LENGTH_RATIO = 3.5;
export const MAX_SELF_OVERLAP_PERCENT = 60;

/**
 * Asserts a route crosses water rather than travelling along it.
 *
 * This is the invariant issue #47 is about. Every time a healthy route touches
 * water it gets straight back out, which is what a bridge is.
 *
 * @param scenario - Scenario under test.
 * @param metrics - Its measured metrics.
 */
export function checkWaterTravel(scenario: Scenario, metrics: ScenarioMetrics): void {
    if (metrics.maxContiguousWaterMeters === null) return;

    const known = scenario.knownIssues?.waterTravel;
    if (known) {
        expect(
            metrics.maxContiguousWaterMeters,
            `${scenario.id} no longer travels along water — remove knownIssues.waterTravel`
        ).toBeGreaterThanOrEqual(ROUTE_QUALITY.maxWaterCrossingMeters);
        return;
    }

    expect(metrics.maxContiguousWaterMeters).toBeLessThan(ROUTE_QUALITY.maxWaterCrossingMeters);
}

/**
 * Asserts a route contains no edge longer than a real street.
 *
 * Only meaningful for walking and cycling: driving legitimately has long edges
 * between motorway nodes.
 *
 * @param scenario - Scenario under test.
 * @param metrics - Its measured metrics.
 */
export function checkLongEdge(scenario: Scenario, metrics: ScenarioMetrics): void {
    if (scenario.mode === "driving-car") return;

    const bound = WIDE_SPAN_METERS[scenario.id] ?? MAX_EDGE_METERS;

    const known = scenario.knownIssues?.longEdge;
    if (known) {
        expect(
            metrics.maxEdgeMeters,
            `${scenario.id} no longer has an implausible edge — remove knownIssues.longEdge`
        ).toBeGreaterThanOrEqual(bound);
        return;
    }

    expect(metrics.maxEdgeMeters).toBeLessThan(bound);
}

/**
 * Asserts a walking route stays close to the shape it was asked to follow.
 *
 * Bounds are loose: dense waypoints on a street grid legitimately cost ~3x the
 * shape's length. The broken cases sat at 6.9-14.1x.
 *
 * @param scenario - Scenario under test.
 * @param metrics - Its measured metrics.
 */
export function checkFollowsShape(scenario: Scenario, metrics: ScenarioMetrics): void {
    if (scenario.mode !== "foot-walking") return;

    const known = scenario.knownIssues?.followsShape;
    if (known) {
        expect(
            metrics.lengthRatio,
            `${scenario.id} now follows its shape — remove knownIssues.followsShape`
        ).toBeGreaterThanOrEqual(MAX_LENGTH_RATIO);
        return;
    }

    expect(metrics.lengthRatio).toBeLessThan(MAX_LENGTH_RATIO);
    expect(metrics.selfOverlapPercent).toBeLessThan(MAX_SELF_OVERLAP_PERCENT);
}

/**
 * Asserts a route contains no out-and-back excursions.
 *
 * A spur is a branch off the road into a side street that turns round and comes
 * back through the same branch. They come from waypoints snapping to driveways
 * and cul-de-sacs, and 5-40% of every route's length used to be made of them.
 *
 * The bound is exact rather than a threshold because the cleanup is idempotent:
 * a route that has been through it reports zero by construction, so anything
 * above zero means the cleanup did not run or stopped working.
 *
 * @param scenario - Scenario under test.
 * @param metrics - Its measured metrics.
 */
export function checkNoSpurs(scenario: Scenario, metrics: ScenarioMetrics): void {
    const known = scenario.knownIssues?.spurs;
    if (known) {
        expect(
            metrics.spurCount,
            `${scenario.id} no longer has out-and-back spurs — remove knownIssues.spurs`
        ).toBeGreaterThan(0);
        return;
    }

    // A route with no geometry has no spurs either, so the count alone could
    // be satisfied by returning nothing at all.
    expect(metrics.lengthRatio).toBeGreaterThan(0);
    expect(metrics.spurCount).toBe(0);
}

/**
 * Runs every invariant against a scenario.
 *
 * @param scenario - Scenario under test.
 * @param metrics - Its measured metrics.
 */
export function checkAllInvariants(scenario: Scenario, metrics: ScenarioMetrics): void {
    checkWaterTravel(scenario, metrics);
    checkLongEdge(scenario, metrics);
    checkFollowsShape(scenario, metrics);
    checkNoSpurs(scenario, metrics);
}
