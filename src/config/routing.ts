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

/**
 * River crossing repair — GitHub issue #47.
 *
 * Radar's foot and bike profiles route along ferry ways in the Thames, so
 * waypoints that land in water have to be moved onto a bridge before routing.
 * See `docs/technical/ISSUE_47_BASELINE.md`.
 */
export const RIVER_CROSSING = {
    /** Modes whose routing graph contains ferries, and so need the repair. */
    affectedModes: ["foot-walking", "cycling-regular"] as TransportMode[],

    /** How far from an in-water section a bridge may be to be considered. */
    maxBridgeSearchMeters: 1500,

    /**
     * Water a bridge must actually span to count as a crossing.
     *
     * OSM tags plenty of short structures as `bridge=yes` — an 8 m footway
     * over the corner of a dock is not a way across the Thames, and picking
     * one leaves the router to find its own way over, which puts it back on
     * the ferry.
     */
    minBridgeSpanMeters: 25,

    /**
     * Water a straight line from the shape to the bridge head may clip before
     * that bridge is treated as being on the wrong bank.
     *
     * Measured on the longest unbroken stretch of water the line touches.
     * Waypoints often sit right on an embankment, so an approach along the
     * bank grazes the polygon; a genuine wrong-bank approach crosses a whole
     * river, 130 m at the narrowest in the scenario matrix.
     */
    approachWaterToleranceMeters: 30,

    /**
     * Extra distance a diversion may add before the shape is better served by
     * simply dropping the in-water waypoints.
     */
    maxBridgeDetourMeters: 2500,

    /**
     * Detour a repair may add once a leg is known to be using a ferry. More
     * generous than `maxBridgeDetourMeters`: at that point any bridge beats
     * travelling down the river.
     */
    maxRepairDetourMeters: 6000,

    /**
     * Cost added to bridges with no pedestrian-friendly `highway` class, in
     * meters. Large enough to lose to any reasonable walkable bridge, small
     * enough to still win against no crossing at all.
     */
    unwalkableBridgePenaltyMeters: 400,

    /** Step size when searching past a bridge for the turnaround point. */
    turnaroundStepMeters: 20,

    /** How far past a bridge to look for dry land before giving up. */
    maxTurnaroundMeters: 300,

    /** Padding around the shape when asking OSM for water and bridges. */
    dataPaddingMeters: 1500,

    /** How many legs may be repaired in a single pass. */
    maxPostRouteRepairs: 8,

    /**
     * How many times to re-route and re-check. Pinning one crossing can push
     * the router onto a ferry somewhere else, so one pass is not always enough.
     */
    maxRepairPasses: 3,

    /**
     * Water a single routed leg may travel through before a bridge is pinned
     * into it. Above this it is travelling along the river, not crossing it.
     */
    maxLegWaterMeters: 500,

    /**
     * Largest area worth asking OSM about, in square kilometres.
     *
     * Measured in central London, water and bridge data runs at roughly
     * 0.02 MB/km²: a 1 km walking route needs 0.7 MB, while a 6 km cycling
     * route over the same city needs 3.8 MB and takes longer to fetch than
     * the timeout allows. Past this the repair is skipped rather than stalling
     * the request for data that will not arrive, or will not fit in the cache.
     */
    maxDataAreaSqKm: 60,

    /**
     * Abort a single Overpass attempt after this long. Route generation waits
     * at most `overpassAttempts` of these, so keep the two in step.
     */
    overpassTimeoutMs: 15_000,

    /**
     * Attempts on the request path. One: a route must not wait on a retry
     * ladder. Fixture capture passes a higher count of its own, where a slow
     * public Overpass is worth waiting out.
     */
    overpassAttempts: 1,

    /**
     * How long a failed Overpass lookup is remembered, in seconds. Without
     * this, every request during an outage pays the full timeout again.
     */
    overpassFailureMemoSeconds: 60,

    /** Entries kept in the per-process OSM cache before the oldest is dropped. */
    maxMemoryCacheEntries: 16,

    /**
     * Largest OSM payload worth putting in Redis, in bytes. Bigger responses
     * still work and stay in the per-lambda memory cache; they just are not
     * shared, rather than failing the write on a value size limit.
     */
    maxCachedDataBytes: 800_000,

    /** How long OSM water and bridge geometry stays cached. Rivers do not move. */
    waterCacheTtlSeconds: 30 * 24 * 60 * 60,

    /**
     * Grid the water cache key snaps to, in degrees (~1.1 km). Nearby routes
     * share a cache entry rather than each fetching their own box.
     */
    waterCacheGridDegrees: 0.01,
} as const;

