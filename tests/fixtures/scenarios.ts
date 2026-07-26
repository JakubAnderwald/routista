/**
 * Route quality scenario matrix for GitHub issue #47 ("rivers break paths").
 *
 * Each scenario is a shape, a place, and a transport mode. Together they cover
 * the broken cases (London / Thames), cases that already work and must not
 * regress (Paris, Budapest), and no-water controls (Madrid, north London).
 *
 * `scripts/capture-route-fixtures` records real Radar responses for these into
 * `tests/fixtures/radar/`, and OSM water polygons into `tests/fixtures/water/`,
 * so the integration suite runs offline.
 */

import { TransportMode } from "@/config";
import { scalePointsToGeo } from "@/lib/geoUtils";
import { generateShape, ShapeName } from "../utils/shapes";

export interface Scenario {
    /** Stable id; also the fixture filename. */
    id: string;
    /** Which water fixture applies, or null for the no-water controls. */
    city: CityName | null;
    shape: ShapeName;
    /** Area centre as `[lat, lng]`. */
    center: [number, number];
    /** Area radius in meters. */
    radius: number;
    mode: TransportMode;
    /** Points in the generated shape, matching the browser's extraction count. */
    points: number;
    /** Why this scenario is in the matrix. */
    role: string;
}

export type CityName = "london" | "paris" | "budapest";

/** Bounding boxes for the OSM water/bridge fixtures, as `[S, W, N, E]`. */
export const CITY_BBOXES: Record<CityName, [number, number, number, number]> = {
    london: [51.4930, -0.1180, 51.5230, -0.0620],
    paris: [48.8420, 2.3210, 48.8700, 2.3690],
    budapest: [47.4820, 19.0180, 47.5140, 19.0630],
};

export const SCENARIOS: Scenario[] = [
    {
        id: "london-heart-foot",
        city: "london",
        shape: "heart",
        center: [51.505, -0.09],
        radius: 1000,
        mode: "foot-walking",
        points: 150,
        role: "The reported bug: heart over the Thames, walking.",
    },
    {
        id: "london-heart-foot-sparse",
        city: "london",
        shape: "heart",
        center: [51.505, -0.09],
        radius: 1000,
        mode: "foot-walking",
        points: 40,
        role: "Same bug at coarser spacing, to show it is not a density artifact.",
    },
    {
        id: "london-heart-bike",
        city: "london",
        shape: "heart",
        center: [51.505, -0.09],
        radius: 1000,
        mode: "cycling-regular",
        points: 150,
        role: "Cycling uses the same ferry ways and is worse than walking.",
    },
    {
        id: "london-star-on-river",
        city: "london",
        shape: "star",
        center: [51.5075, -0.09],
        radius: 500,
        mode: "foot-walking",
        points: 100,
        role: "Shape centred on the river, so most waypoints land in water.",
    },
    {
        id: "london-heart-car",
        city: "london",
        shape: "heart",
        center: [51.505, -0.09],
        radius: 1000,
        mode: "driving-car",
        points: 150,
        role: "Control: driving never enters the water and must stay unchanged.",
    },
    {
        id: "london-heart-north",
        city: "london",
        shape: "heart",
        center: [51.515, -0.09],
        radius: 600,
        mode: "foot-walking",
        points: 100,
        role: "Control: same city, clear of the river.",
    },
    {
        id: "paris-heart-foot",
        city: "paris",
        shape: "heart",
        center: [48.856, 2.345],
        radius: 1000,
        mode: "foot-walking",
        points: 40,
        role: "Control: the Seine is already crossed cleanly and must not regress.",
    },
    {
        id: "budapest-heart-foot",
        city: "budapest",
        shape: "heart",
        center: [47.4979, 19.0402],
        radius: 1500,
        mode: "foot-walking",
        points: 40,
        role: "Wide river, mild case: one long edge today.",
    },
    {
        id: "madrid-heart-foot",
        city: null,
        shape: "heart",
        center: [40.4168, -3.7038],
        radius: 1000,
        mode: "foot-walking",
        points: 150,
        role: "Control: no water at all, sets the healthy baseline.",
    },
    {
        id: "madrid-square-foot",
        city: null,
        shape: "square",
        center: [40.4168, -3.7038],
        radius: 800,
        mode: "foot-walking",
        points: 100,
        role: "Control: straight edges on a street grid, the easiest possible case.",
    },
];

/**
 * Builds a scenario's waypoints exactly as the browser would: generate the
 * shape, then scale it onto the map area.
 *
 * @param scenario - Scenario from `SCENARIOS`.
 * @returns Waypoints as `[lat, lng]`.
 */
export function scenarioWaypoints(scenario: Scenario): [number, number][] {
    return scalePointsToGeo(
        generateShape(scenario.shape, scenario.points),
        scenario.center,
        scenario.radius
    );
}

/**
 * Looks up a scenario by id.
 *
 * @param id - Scenario id.
 * @returns The scenario.
 * @throws If no scenario has that id.
 */
export function scenarioById(id: string): Scenario {
    const scenario = SCENARIOS.find(s => s.id === id);
    if (!scenario) throw new Error(`Unknown scenario: ${id}`);
    return scenario;
}
