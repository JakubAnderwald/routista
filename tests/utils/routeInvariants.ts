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

    const known = scenario.knownIssues?.longEdge;
    if (known) {
        expect(
            metrics.maxEdgeMeters,
            `${scenario.id} no longer has an implausible edge — remove knownIssues.longEdge`
        ).toBeGreaterThanOrEqual(MAX_EDGE_METERS);
        return;
    }

    expect(metrics.maxEdgeMeters).toBeLessThan(MAX_EDGE_METERS);
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
 * Runs every invariant against a scenario.
 *
 * @param scenario - Scenario under test.
 * @param metrics - Its measured metrics.
 */
export function checkAllInvariants(scenario: Scenario, metrics: ScenarioMetrics): void {
    checkWaterTravel(scenario, metrics);
    checkLongEdge(scenario, metrics);
    checkFollowsShape(scenario, metrics);
}
