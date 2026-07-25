/**
 * Routing configuration
 * 
 * Contains transport mode definitions, tolerances, and presets
 * for route generation.
 */

export type TransportMode = "foot-walking" | "cycling-regular" | "driving-car";

/**
 * Transport mode definitions with Radar API mapping
 */
export const TRANSPORT_MODES = [
    { id: "foot-walking" as const, radarMode: "foot" },
    { id: "cycling-regular" as const, radarMode: "bike" },
    { id: "driving-car" as const, radarMode: "car" },
] as const;

/**
 * Mode mapping for Radar API
 */
export const MODE_TO_RADAR: Record<TransportMode, string> = {
    "foot-walking": "foot",
    "cycling-regular": "bike",
    "driving-car": "car",
};

/**
 * Douglas-Peucker simplification tolerances (in degrees)
 * 
 * Lower tolerance = more points preserved = better shape fidelity
 * Values: ~0.0001° ≈ 11m at equator, ~7m at 50° latitude
 * 
 * IMPORTANT: Previously tolerances were 5-10x higher causing severe
 * over-simplification for open shapes. See GitHub issue #5.
 */
export const SIMPLIFICATION_TOLERANCES: Record<TransportMode, number> = {
    "driving-car": 0.0004,     // ~30-45m - car needs roads, can't follow every detail
    "cycling-regular": 0.0001, // ~7-11m - bikes can use more paths, preserve more detail
    "foot-walking": 0.00005,   // ~4-6m - foot is most flexible, preserve fine detail
};

/**
 * Route length presets per transport mode
 * Used in AreaSelector for quick size selection
 */
export const MODE_PRESETS: Record<TransportMode, { id: string; radius: number; desc: string }[]> = {
    "foot-walking": [
        { id: "short", radius: 600, desc: "~2 km" },
        { id: "medium", radius: 1500, desc: "~5 km" },
        { id: "long", radius: 3000, desc: "~10 km" },
    ],
    "cycling-regular": [
        { id: "short", radius: 1500, desc: "~5 km" },
        { id: "medium", radius: 3000, desc: "~10 km" },
        { id: "long", radius: 6000, desc: "~20 km" },
    ],
    "driving-car": [
        { id: "short", radius: 3000, desc: "~10 km" },
        { id: "medium", radius: 6000, desc: "~20 km" },
        { id: "long", radius: 10000, desc: "~40 km" },
    ],
};

/**
 * Tolerance in meters for matching radius to preset
 */
export const PRESET_TOLERANCE_METERS = 50;

/**
 * Route quality measurement thresholds.
 *
 * See `docs/technical/ISSUE_47_BASELINE.md` for the measurements behind these.
 */
export const ROUTE_QUALITY = {
    /**
     * Longest plausible single edge in a returned route, per mode.
     *
     * An edge longer than this is not a street. Measured across the scenario
     * matrix: healthy walking routes top out at 171 m (a long straight street
     * with no intermediate nodes), the longest legitimate bridge span is 323 m
     * over the Danube, and Thames ferry ways produce edges of 563-849 m.
     */
    longEdgeThresholdMeters: {
        "foot-walking": 250,
        "cycling-regular": 250,
        "driving-car": 400,
    } as Record<TransportMode, number>,

    /**
     * Longest unbroken run through water that can still be a bridge.
     *
     * Edge length alone cannot tell a long bridge from a ferry, but duration
     * in the water can: the widest crossing in the matrix is 382 m over the
     * Danube, while routes that travel along the Thames stay in the water for
     * 1.3-7.4 km at a stretch.
     */
    maxWaterCrossingMeters: 500,

    /** Two parts of a route within this distance count as retracing each other. */
    selfOverlapToleranceMeters: 20,

    /**
     * Minimum along-route separation before an overlap counts. Stops adjacent
     * geometry from being reported as a spur.
     */
    selfOverlapMinGapMeters: 150,

    /** routed/straight ratio above which a single leg is considered a detour. */
    badLegRatio: 3,
} as const;

