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
 * Spur cleanup — removing out-and-back excursions from a returned route.
 *
 * Waypoints sit ~40 m apart and every one is a forced via-point, so whenever a
 * waypoint's nearest way is a driveway, a service road, a cul-de-sac or the far
 * carriageway of a divided road, Radar has to drive in and back out again.
 * Enter plus exit is a spur, and Radar's directions API offers no snap radius,
 * no bearings and no U-turn suppression to prevent it. So they are spliced out
 * of the geometry afterwards, by `src/lib/routeCleanup.ts`.
 *
 * Measured over the recorded scenario matrix, these settings remove 5-40% of
 * routed length — 355 excursions on `london-heart-foot`, longest 62 m — while
 * the worst distance from any shape point to the route grows by at most ~30 m.
 * See `docs/technical/SPUR_CLEANUP.md`.
 */
export const SPUR_CLEANUP = {
    /**
     * How close two points must be to count as the same place.
     *
     * Radar returns OSM nodes, so a retraced street comes back through
     * coordinates that are identical to six decimals. This only has to absorb
     * rounding, and staying tight bounds the edge the splice creates: joining
     * across the gap can lengthen a single edge by at most this much.
     */
    snapMeters: 8,

    /**
     * Longest excursion that may be spliced out.
     *
     * A safety belt rather than the tuning knob: with the deviation guard on,
     * sweeping this between 150 m and 400 m barely changes what is removed,
     * because real features are rejected on deviation long before length.
     */
    maxSpurMeters: {
        "foot-walking": 250,
        "cycling-regular": 250,
        "driving-car": 400,
    } as Record<TransportMode, number>,

    /**
     * Farthest an excursion may stray from the point it rejoins at before it
     * counts as a genuine feature of the shape rather than a snapping artifact.
     *
     * This is the control that matters. With it off, the Paris control loses a
     * real part of the heart: the worst shape point-to-route distance jumps
     * from 33 m to 274 m. At 35 m it stays at 65 m, and 15-40% of the length is
     * still removed. Anything the shape genuinely traces — a pier, a headland,
     * a dead-end street the outline runs down — strays much further than this
     * and survives, as do the same-bank bridge crossings the river repair
     * deliberately creates (`riverCrossing.ts`), which are 130-380 m wide.
     *
     * Driving is looser: its waypoints are ~80 m apart and the two carriageways
     * of a divided road are ~30 m apart, so 35 m would refuse to remove the
     * wrong-side-of-the-road detour that is the commonest car spur. 45 m is the
     * largest value that keeps every scenario's accuracy score within 2 points
     * of its pre-cleanup baseline; 60 m removes another 3.3 km from
     * `london-heart-car` but costs it a third point.
     */
    maxDeviationMeters: {
        "foot-walking": 35,
        "cycling-regular": 35,
        "driving-car": 45,
    } as Record<TransportMode, number>,

    /**
     * Most geometry points a single excursion may contain.
     *
     * Purely a complexity guard, set far above anything `maxSpurMeters` allows
     * in practice (a 250 m excursion of 12 m edges is ~20 points). It keeps the
     * deviation scan bounded even if a route arrives with a dense run of
     * near-coincident points.
     */
    maxSpurPoints: 512,
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

