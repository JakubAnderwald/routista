/**
 * Shared scenario measurement for the route quality suites.
 *
 * The offline suite feeds this recorded Radar responses and the live suite
 * lets it reach the real API, so both measure identically.
 */

import { getRadarRoute } from "@/lib/radarService";
import { calculateRouteAccuracy } from "@/lib/geoUtils";
import { summarizeRoute } from "@/lib/routeQuality";
import { routeWaterStats } from "@/lib/waterGeometry";
import { ROUTE_QUALITY } from "@/config";
import { Scenario, scenarioWaypoints } from "../fixtures/scenarios";
import { loadWaterIndex } from "./radarFixtures";

/** Metrics recorded per scenario, rounded so baselines diff cleanly. */
export interface ScenarioMetrics {
    /** Routed length divided by the requested shape's length. */
    lengthRatio: number;
    /** Longest single edge in the route geometry. */
    maxEdgeMeters: number;
    /** Edges longer than the mode's implausible-edge threshold. */
    longEdgeCount: number;
    /** Total length of those edges. */
    longEdgeMeters: number;
    /** Percentage of the route that retraces itself. */
    selfOverlapPercent: number;
    /** Legs whose routed/straight ratio exceeds the detour threshold. */
    badLegCount: number;
    /** Highest routed/straight ratio across all legs. */
    worstLegRatio: number;
    /** The score shown to users, from `calculateRouteAccuracy`. */
    accuracyPercent: number;
    /** Metres of route inside water, or null for scenarios with no water data. */
    waterMeters: number | null;
    /** Separate runs through water. */
    waterCrossings: number | null;
    /** Longest unbroken run through water — a bridge is short, a ferry is not. */
    maxContiguousWaterMeters: number | null;
}

/**
 * Routes a scenario and measures the result.
 *
 * Callers are responsible for pointing `fetch` at recorded fixtures or the
 * live API before calling this.
 *
 * @param scenario - Scenario from the matrix.
 * @returns Rounded metrics for the generated route.
 */
export async function measureScenario(scenario: Scenario): Promise<ScenarioMetrics> {
    const waypoints = scenarioWaypoints(scenario);
    const route = await getRadarRoute({ coordinates: waypoints, mode: scenario.mode });

    const quality = summarizeRoute(
        route,
        waypoints,
        ROUTE_QUALITY.longEdgeThresholdMeters[scenario.mode]
    );
    const water = scenario.city ? routeWaterStats(route, loadWaterIndex(scenario.city)) : null;

    return {
        lengthRatio: round(quality.lengthRatio, 2),
        maxEdgeMeters: Math.round(quality.maxEdgeMeters),
        longEdgeCount: quality.longEdges.count,
        longEdgeMeters: Math.round(quality.longEdges.meters),
        selfOverlapPercent: Math.round(quality.selfOverlapFraction * 100),
        badLegCount: quality.badLegCount,
        worstLegRatio: round(quality.worstLegRatio, 1),
        accuracyPercent: Math.round(calculateRouteAccuracy(waypoints, route, scenario.radius)),
        waterMeters: water ? Math.round(water.totalWaterMeters) : null,
        waterCrossings: water ? water.crossings : null,
        maxContiguousWaterMeters: water ? Math.round(water.maxContiguousWaterMeters) : null,
    };
}

/**
 * Scenarios that still travel along water.
 *
 * The river crossing repair fixed the reported case and its variants. What
 * remains is the deliberately extreme one: a star centred in the middle of the
 * Thames, where a fifth of the waypoints are in the water and some in-water
 * runs have no bridge close enough to reach. It improved six-fold — 24.3 km in
 * the water down to 4.0 km — but still travels along the river in places, so
 * it stays here to stop that silently getting worse.
 *
 * See `docs/technical/ISSUE_47_BASELINE.md`.
 */
export const KNOWN_BROKEN = new Set(["london-star-on-river"]);

function round(value: number, digits: number): number {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
}
