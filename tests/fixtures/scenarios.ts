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
import { extractShapeFromImageNode } from "../utils/nodeImageProcessing";
import path from "path";

/**
 * A route quality invariant the suite checks.
 *
 * - `waterTravel` — the route may cross water but never travel along it
 * - `longEdge` — no edge longer than any real street
 * - `followsShape` — length ratio and self-overlap stay within bounds
 * - `spurs` — no branch off the road that turns round and comes straight back
 */
export type Invariant = "waterTravel" | "longEdge" | "followsShape" | "spurs";

export interface Scenario {
    /** Stable id; also the fixture filename. */
    id: string;
    /** Which water fixture applies, or null for the no-water controls. */
    city: CityName | null;
    /** Parametric outline, or a PNG under `public/` for the real pipeline. */
    shape: ShapeName | { image: string };
    /** Area centre as `[lat, lng]`. */
    center: [number, number];
    /** Area radius in meters. */
    radius: number;
    mode: TransportMode;
    /** Points in the generated shape, matching the browser's extraction count. */
    points: number;
    /** Why this scenario is in the matrix. */
    role: string;
    /**
     * Invariants this scenario is known to fail, and why.
     *
     * The suite asserts a listed issue is *still* present, so a scenario
     * cannot be quietly fixed and left here — and cannot regress unnoticed.
     */
    knownIssues?: Partial<Record<Invariant, string>>;
}

export type CityName = "london" | "paris" | "budapest" | "madrid" | "amsterdam";

/** Bounding boxes for the OSM water/bridge fixtures, as `[S, W, N, E]`. */
export const CITY_BBOXES: Record<CityName, [number, number, number, number]> = {
    london: [51.4930, -0.1180, 51.5230, -0.0620],
    paris: [48.8420, 2.3210, 48.8700, 2.3690],
    budapest: [47.4820, 19.0180, 47.5140, 19.0630],
    // No river through the centre, but plenty of ornamental fountains tagged
    // natural=water — the case that must not trigger the repair.
    madrid: [40.4020, -3.7200, 40.4320, -3.6880],
    // Canals everywhere: many narrow water bodies with many crossings.
    amsterdam: [52.3560, 4.8700, 52.3860, 4.9120],
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
        knownIssues: {
            waterTravel:
                "A fifth of the waypoints sit in the Thames and some runs have no bridge " +
                "within reach, so parts of the shape are still routed along the river. " +
                "Improved six-fold by the crossing repair (24.3 km of water down to 4.0 km).",
        },
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
        city: "madrid",
        shape: "heart",
        center: [40.4168, -3.7038],
        radius: 1000,
        mode: "foot-walking",
        points: 150,
        role: "Control: no river, but ornamental fountains tagged as water.",
        knownIssues: {
            longEdge:
                "Radar's foot profile routes through the Calle de Bailen road tunnel under " +
                "Plaza de Oriente (tunnel=yes, layer=-1), producing a 470 m straight edge " +
                "for a 40 m gap. Same class of defect as the Thames ferries — Radar using " +
                "ways pedestrians cannot — but a different way type, and not water, so the " +
                "river crossing repair correctly leaves it alone. Tracked separately.",
        },
    },
    {
        id: "madrid-square-foot",
        city: "madrid",
        shape: "square",
        center: [40.4168, -3.7038],
        radius: 800,
        mode: "foot-walking",
        points: 100,
        role: "Control: straight edges on a street grid, the easiest possible case.",
    },
    {
        id: "london-heart-image",
        city: "london",
        // The example users actually pick, through the real extraction path.
        shape: { image: "heart-v2.png" },
        center: [51.505, -0.09],
        radius: 1000,
        mode: "foot-walking",
        points: 150,
        role: "Fidelity: the reported case as the browser really produces it, from a PNG.",
    },
    {
        id: "london-dino-image",
        city: "london",
        // An irregular outline: uneven spacing and concavities, unlike a heart.
        shape: { image: "examples/dino.png" },
        center: [51.505, -0.09],
        radius: 1200,
        mode: "foot-walking",
        points: 150,
        role: "Fidelity: an irregular traced outline over the Thames.",
    },
    {
        id: "warsaw-heart-foot",
        // A 4.5 km radius spans ~81 km², over RIVER_CROSSING.maxDataAreaSqKm,
        // so the pipeline skips the water repair here and a Vistula fixture
        // would be a large file that changes nothing.
        city: null,
        shape: "heart",
        center: [52.2297, 21.0122],
        radius: 4500,
        mode: "foot-walking",
        points: 150,
        role: "The reported spur bug: 66.6 km for a 4.5 km-radius heart on foot.",
    },
    {
        id: "amsterdam-heart-foot",
        city: "amsterdam",
        shape: "heart",
        center: [52.3702, 4.8952],
        radius: 1000,
        mode: "foot-walking",
        points: 150,
        role: "Control: dozens of narrow canals, all bridged. Must not be over-repaired.",
    },
];

/**
 * Builds a scenario's waypoints exactly as the browser would: produce the
 * shape, then scale it onto the map area.
 *
 * Image-based scenarios go through the same extraction the browser uses, so
 * they carry the uneven spacing a traced outline really has.
 *
 * @param scenario - Scenario from `SCENARIOS`.
 * @returns Waypoints as `[lat, lng]`.
 */
export async function scenarioWaypoints(scenario: Scenario): Promise<[number, number][]> {
    const points =
        typeof scenario.shape === "string"
            ? generateShape(scenario.shape, scenario.points)
            : await extractShapeFromImageNode(
                  path.resolve(__dirname, "../../public", scenario.shape.image),
                  scenario.points
              );

    return scalePointsToGeo(points, scenario.center, scenario.radius);
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
