/**
 * OpenStreetMap water and bridge data, via the Overpass API.
 *
 * Needed because Radar's foot and bike profiles route along ferry ways in the
 * Thames (GitHub issue #47) and repairing that requires knowing where the water
 * and the crossings actually are.
 *
 * Only called for routes the cheap long-edge detector has already flagged, and
 * results are cached in Redis for a month, so most routes never touch Overpass.
 * Every failure path returns null: no water data means the previous behaviour,
 * not a broken route.
 */

import { Feature, FeatureCollection, Position } from "geojson";
import * as Sentry from "@sentry/nextjs";
import { RIVER_CROSSING } from "@/config";
import { getRedisClient } from "./redisClient";

/** Overpass answers 406 to requests without a User-Agent. */
const USER_AGENT = "routista/1.0 (https://www.routista.eu)";

/**
 * Overpass instances to ask, in order of preference.
 *
 * `OVERPASS_URLS` (comma-separated) replaces the list; the older single-URL
 * `OVERPASS_URL` pins one endpoint. Read per call so tests can stub them.
 *
 * @returns At least one interpreter URL.
 */
export function overpassEndpoints(): string[] {
    const list = (process.env.OVERPASS_URLS ?? "")
        .split(",")
        .map(url => url.trim())
        .filter(Boolean);
    if (list.length > 0) return list;
    if (process.env.OVERPASS_URL) return [process.env.OVERPASS_URL];
    return [...RIVER_CROSSING.overpassEndpoints];
}

/** Endpoints of a way, used to chain relation members into closed rings. */
const RING_JOIN_EPSILON = 1e-7;

interface OverpassNode {
    lat: number;
    lon: number;
}

interface OverpassElement {
    type: "way" | "relation" | "node";
    id: number;
    tags?: Record<string, string>;
    geometry?: OverpassNode[];
    members?: { type: string; role: string; geometry?: OverpassNode[] }[];
}

/**
 * In-process cache, so repeated routes in one lambda skip even Redis.
 *
 * Bounded, and insertion-ordered so the oldest entry goes first: responses too
 * large for Redis live only here, and a long-lived server covering many cities
 * would otherwise grow without limit.
 */
const memoryCache = new Map<string, FeatureCollection>();

/** Keys whose last lookup failed, with the time the memo expires. */
const failedLookups = new Map<string, number>();

/** Stores a response, evicting the oldest entries once the cache is full. */
function rememberInMemory(key: string, collection: FeatureCollection): void {
    memoryCache.delete(key);
    memoryCache.set(key, collection);

    while (memoryCache.size > RIVER_CROSSING.maxMemoryCacheEntries) {
        const oldest = memoryCache.keys().next().value;
        if (oldest === undefined) break;
        memoryCache.delete(oldest);
    }
}

/**
 * Fetches water polygons and road/foot bridges for a bounding box, with
 * caching and graceful failure.
 *
 * @param bbox - Bounding box as `[south, west, north, east]`.
 * @returns Water and bridge geometry, or null if it could not be fetched.
 */
export async function getWaterAndBridges(
    bbox: [number, number, number, number]
): Promise<FeatureCollection | null> {
    const key = cacheKeyFor(bbox);

    const inMemory = memoryCache.get(key);
    if (inMemory) {
        // Refresh its position so the busiest areas are the last to be evicted.
        rememberInMemory(key, inMemory);
        return inMemory;
    }

    const failedUntil = failedLookups.get(key);
    if (failedUntil !== undefined && failedUntil > nowSeconds()) {
        console.log(`[Overpass] Skipping ${key}, a recent lookup failed`);
        return null;
    }

    const redis = getRedisClient();
    if (redis) {
        try {
            const cached = await redis.get<FeatureCollection>(key);
            if (cached) {
                console.log(`[Overpass] Cache HIT for ${key}`);
                memoryCache.set(key, cached);
                return cached;
            }
        } catch (error) {
            console.log(
                `[Overpass] Cache read failed: ${error instanceof Error ? error.message : "unknown"}`
            );
        }
    }

    let collection: FeatureCollection;
    try {
        collection = await fetchWaterAndBridges(
            bbox,
            RIVER_CROSSING.overpassTimeoutMs,
            RIVER_CROSSING.overpassAttempts,
            overpassEndpoints()
        );
    } catch (error) {
        failedLookups.set(key, nowSeconds() + RIVER_CROSSING.overpassFailureMemoSeconds);
        const reason = error instanceof Error ? error.message : "unknown";
        // Hosts only: a keyed instance (Geofabrik and others) carries its API key in the path.
        const failures =
            error instanceof OverpassQueryError
                ? error.failures.map(f => ({ ...f, endpoint: hostOf(f.endpoint) }))
                : undefined;
        // Tag by the primary's failure, so the tag means the same as before the fallbacks.
        const tagged = failures?.[0]?.reason ?? reason;
        // Overpass being down must never break route generation.
        console.warn(`[Overpass] Fetch failed, routing without water data: ${reason}`);
        Sentry.captureMessage("Overpass fetch failed", {
            level: "warning",
            tags: { "overpass.failure": classifyOverpassFailure(tagged) },
            extra: { service: "overpassService", bbox, reason, failures },
        });
        return null;
    }

    console.log(
        `[Overpass] Fetched ${collection.features.length} features for ${key}`
    );
    failedLookups.delete(key);
    rememberInMemory(key, collection);

    const bytes = JSON.stringify(collection).length;
    if (redis && bytes <= RIVER_CROSSING.maxCachedDataBytes) {
        try {
            await redis.set(key, collection, { ex: RIVER_CROSSING.waterCacheTtlSeconds });
        } catch (error) {
            console.log(
                `[Overpass] Cache write failed: ${error instanceof Error ? error.message : "unknown"}`
            );
        }
    } else if (redis) {
        // Past the value size limit. Keeping it in memory is still worth it
        // for repeat requests hitting the same lambda.
        console.log(`[Overpass] ${bytes} bytes too large to share via Redis, memory only`);
    }

    return collection;
}

/**
 * Buckets an Overpass failure into a short Sentry tag, so the issue can be split by cause:
 * "timeout" (our abort), "http-429"/"http-504"/... (Overpass answered with an error),
 * "bad-response" (200 with an unparseable or malformed body), or "network".
 *
 * @param reason - One endpoint's failure (`"502: …"`) or a whole error message (`"… — 502: …"`).
 */
export function classifyOverpassFailure(reason: string): string {
    // Status first: a 504 body mentions "timeout" too.
    const status = /(?:^|— )(\d{3}):/.exec(reason);
    if (status) return `http-${status[1]}`;
    if (/aborted|AbortError|timeout/i.test(reason)) return "timeout";
    // Overpass answered 200 but the body was not usable JSON.
    if (/JSON|Unexpected (token|end)|bad response/i.test(reason)) return "bad-response";
    return "network";
}

/** Seconds since the epoch, for the failure memo. */
function nowSeconds(): number {
    return Math.floor(Date.now() / 1000);
}

/**
 * Cache key for a bounding box.
 *
 * Boxes are rounded outwards to a coarse grid so nearby routes share an entry;
 * rivers and bridges do not move.
 */
function cacheKeyFor(bbox: [number, number, number, number]): string {
    const grid = RIVER_CROSSING.waterCacheGridDegrees;
    const snapped = [
        Math.floor(bbox[0] / grid) * grid,
        Math.floor(bbox[1] / grid) * grid,
        Math.ceil(bbox[2] / grid) * grid,
        Math.ceil(bbox[3] / grid) * grid,
    ].map(value => value.toFixed(3));

    return `osm:water:v1:${snapped.join(",")}`;
}

/**
 * Fetches water polygons and road/foot bridges for a bounding box.
 *
 * @param bbox - Bounding box as `[south, west, north, east]`.
 * @param timeoutMs - Time budget for each attempt, shared by all endpoints.
 * @param attempts - How many times to try before giving up. The request path
 *   passes 1; fixture capture waits out a busy public instance.
 * @param endpoints - Overpass instances to race, in order of preference.
 *   Defaults to the primary alone, so captured fixtures come from the
 *   freshest data rather than whichever mirror answered first.
 * @returns FeatureCollection of water Polygons and bridge LineStrings.
 */
export async function fetchWaterAndBridges(
    bbox: [number, number, number, number],
    timeoutMs = 90_000,
    attempts = 4,
    endpoints: readonly string[] = overpassEndpoints().slice(0, 1)
): Promise<FeatureCollection> {
    const [south, west, north, east] = bbox;
    const area = `${south},${west},${north},${east}`;

    // Overpass keeps working until its own timeout, so align it with the
    // client abort rather than leaving the server busy long after we gave up.
    const serverTimeout = Math.max(10, Math.ceil(timeoutMs / 1000));
    const query = `[out:json][timeout:${serverTimeout}];
(
  way["natural"="water"](${area});
  relation["natural"="water"](${area});
  way["waterway"="riverbank"](${area});
  relation["waterway"="riverbank"](${area});
  way["bridge"]["highway"](${area});
);
out geom;`;

    // Converted inside the race, so a malformed answer counts against the endpoint
    // that sent it and a healthy fallback can still win.
    return runQuery(query, endpoints, timeoutMs, attempts, data => toFeatureCollection(data.elements));
}

/** A usable Overpass answer. */
export interface OverpassResponse {
    elements: OverpassElement[];
}

/** Why one endpoint did not produce a usable answer. */
export interface OverpassEndpointFailure {
    /** Interpreter URL that was asked. */
    endpoint: string;
    /** `"<status>: <body>"` for an HTTP error, otherwise the error message. */
    reason: string;
    /** HTTP status, when the endpoint answered with an error. */
    status?: number;
}

/** Thrown when no endpoint produced a usable answer within the attempt's budget. */
export class OverpassQueryError extends Error {
    /**
     * @param failures - One entry per endpoint, in the order they were configured.
     */
    constructor(readonly failures: OverpassEndpointFailure[]) {
        super(
            `Overpass failed on ${failures.length} endpoint(s) — ` +
                failures.map(f => `${hostOf(f.endpoint)}: ${f.reason}`).join("; ")
        );
        this.name = "OverpassQueryError";
    }

    /**
     * Whether another attempt could help: the old single-endpoint rule, where
     * busy (429), slow (504) and network failures clear on their own but other
     * HTTP errors, such as a 400 for a bad query, will not.
     */
    get retryable(): boolean {
        return this.failures.some(f => f.status === undefined || f.status === 429 || f.status === 504);
    }
}

/** An endpoint failure that carries the HTTP status it answered with. */
class EndpointHttpError extends Error {
    constructor(readonly status: number, body: string) {
        super(`${status}: ${body.slice(0, 200)}`);
    }
}

/** How long an HTTP error body may take to arrive before the failure is reported without it. */
const ERROR_BODY_WAIT_MS = 1_000;

/** Remarks Overpass adds to a 200 whose query did not finish; the elements are then partial. */
const RUNTIME_ERROR_REMARK = /runtime error|timed out|out of memory/i;

/** Host part of an endpoint URL, for compact log and error messages. */
function hostOf(endpoint: string): string {
    try {
        return new URL(endpoint).host;
    } catch {
        return endpoint;
    }
}

/**
 * Runs an Overpass query, retrying when every endpoint was busy.
 *
 * Overpass answers 429 when its query slots are full and 504 when a query
 * takes too long; both clear on their own after a short wait.
 */
async function runQuery<T>(
    query: string,
    endpoints: readonly string[],
    timeoutMs: number,
    attempts: number,
    parse: (data: OverpassResponse) => T
): Promise<T> {
    let lastError: OverpassQueryError | undefined;

    for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
            return await queryWithFallback(query, endpoints, timeoutMs, RIVER_CROSSING.overpassHedgeDelayMs, parse);
        } catch (error) {
            lastError = error as OverpassQueryError;
        }

        if (attempt === attempts || !lastError.retryable) break;

        const backoffMs = 5_000 * attempt;
        console.log(`[overpass] attempt ${attempt} failed (${lastError.message}); retrying in ${backoffMs}ms`);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
    }

    throw lastError;
}

/**
 * Asks several Overpass instances for the same query and takes the first
 * usable answer.
 *
 * The first endpoint starts at once. The next one starts as soon as the
 * previous fails, or after `hedgeDelayMs` without an answer, whichever comes
 * first. When one answers, the others are aborted so they stop using their
 * server. Everything is aborted once `budgetMs` has passed.
 *
 * @param query - Overpass QL query.
 * @param endpoints - Interpreter URLs, in order of preference.
 * @param budgetMs - Time limit for the whole race.
 * @param hedgeDelayMs - How long an endpoint may stay silent before the next is asked too.
 * @param parse - Converts a response. It runs before the race is decided, so
 *   an answer it rejects counts as that endpoint failing ("bad response").
 * @returns The first response that parsed.
 * @throws OverpassQueryError with each endpoint's failure if none produced one.
 */
export function queryWithFallback<T = OverpassResponse>(
    query: string,
    endpoints: readonly string[],
    budgetMs: number,
    hedgeDelayMs: number,
    parse: (data: OverpassResponse) => T = data => data as T
): Promise<T> {
    return new Promise((resolve, reject) => {
        const failures: (OverpassEndpointFailure | undefined)[] = endpoints.map(() => undefined);
        const controllers: AbortController[] = [];
        const startedAt = Date.now();
        let started = 0;
        let settled = false;
        let hedgeTimer: ReturnType<typeof setTimeout> | undefined;

        const settle = (outcome: () => void) => {
            if (settled) return;
            settled = true;
            clearTimeout(deadline);
            clearTimeout(hedgeTimer);
            for (const controller of controllers) controller.abort();
            outcome();
        };

        const fail = () =>
            reject(
                new OverpassQueryError(
                    endpoints.map((endpoint, i) => failures[i] ?? {
                        endpoint,
                        reason: i < started ? `timeout after ${budgetMs}ms` : "not tried",
                    })
                )
            );

        const startNext = () => {
            clearTimeout(hedgeTimer);
            if (settled || started >= endpoints.length) return;

            const index = started++;
            const endpoint = endpoints[index];
            const controller = new AbortController();
            controllers.push(controller);
            if (started < endpoints.length) hedgeTimer = setTimeout(startNext, hedgeDelayMs);

            queryEndpoint(endpoint, query, controller.signal)
                .then(data => {
                    // Already decided: skip converting an answer nobody will use.
                    if (settled) throw new Error("superseded");
                    try {
                        return parse(data);
                    } catch (error) {
                        // Parseable JSON in an unexpected shape: Overpass's fault, not the network's.
                        const message = error instanceof Error ? error.message : String(error);
                        throw new Error(`bad response — ${message}`);
                    }
                })
                .then(
                    parsed =>
                        settle(() => {
                            if (index > 0) {
                                const primary = failures[0]?.reason ?? `no answer after ${Date.now() - startedAt}ms`;
                                console.log(`[Overpass] Served by ${hostOf(endpoint)} (primary: ${primary})`);
                            }
                            resolve(parsed);
                        }),
                    error => {
                        if (settled) return;
                        failures[index] = {
                            endpoint,
                            reason: error instanceof Error ? error.message : String(error),
                            status: error instanceof EndpointHttpError ? error.status : undefined,
                        };
                        if (failures.every(Boolean)) settle(fail);
                        else startNext();
                    }
                );
        };

        // Only read by settle(), which never runs before this line: every caller is async.
        const deadline = setTimeout(() => settle(fail), budgetMs);
        startNext();
    });
}

/**
 * Sends a query to one Overpass instance.
 *
 * A 200 only counts when its body is the expected JSON and the query ran to
 * completion: Overpass reports a query that hit its own timeout or memory
 * limit as a 200 with a `remark` and partial (often no) elements, and caching
 * that would hide the water for a month.
 *
 * @throws EndpointHttpError for an HTTP error, or an Error for anything else.
 */
async function queryEndpoint(endpoint: string, query: string, signal: AbortSignal): Promise<OverpassResponse> {
    const response = await fetch(endpoint, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": USER_AGENT,
            Accept: "application/json",
        },
        body: `data=${encodeURIComponent(query)}`,
        signal,
    });

    if (!response.ok) {
        // Keep the status even if the error body cannot be read: it is what Sentry is tagged by.
        const body = await readErrorBody(response, ERROR_BODY_WAIT_MS);
        throw new EndpointHttpError(response.status, body);
    }

    const data = (await response.json()) as { elements?: unknown; remark?: unknown };
    if (typeof data?.remark === "string" && RUNTIME_ERROR_REMARK.test(data.remark)) {
        throw new Error(`bad response — ${data.remark.slice(0, 200)}`);
    }
    if (!Array.isArray(data?.elements)) {
        throw new Error("bad response — no elements array");
    }
    return data as OverpassResponse;
}

/**
 * Reads an error body for the failure message, giving up after `ms`.
 *
 * The status alone is enough to hand over to the next endpoint, so a body
 * that stalls must not hold that up.
 */
async function readErrorBody(response: Response, ms: number): Promise<string> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const giveUp = new Promise<string>(resolve => {
        timer = setTimeout(() => resolve(""), ms);
    });
    try {
        return await Promise.race([response.text().catch(() => ""), giveUp]);
    } finally {
        clearTimeout(timer);
    }
}

/** Turns raw Overpass elements into water Polygons and bridge LineStrings. */
function toFeatureCollection(elements: OverpassElement[]): FeatureCollection {
    const features: Feature[] = [];

    for (const element of elements) {
        const tags = element.tags ?? {};

        if (tags.bridge && tags.highway) {
            const line = toPositions(element.geometry);
            if (line.length >= 2) {
                features.push({
                    type: "Feature",
                    properties: { kind: "bridge", highway: tags.highway, name: tags.name },
                    geometry: { type: "LineString", coordinates: line },
                });
            }
            continue;
        }

        if (!isWater(tags)) continue;

        for (const rings of waterRingsOf(element)) {
            features.push({
                type: "Feature",
                properties: { kind: "water", name: tags.name },
                geometry: { type: "Polygon", coordinates: rings },
            });
        }
    }

    return { type: "FeatureCollection", features };
}

/** True for the tag combinations OSM uses to map open water. */
function isWater(tags: Record<string, string>): boolean {
    return tags.natural === "water" || tags.waterway === "riverbank";
}

/**
 * Extracts closed rings from a water element. Ways are a single ring;
 * relations are multipolygons whose members have to be chained first.
 *
 * Anything that does not come out closed is discarded rather than closed by
 * force: inventing the missing edge would turn an incomplete outline into a
 * polygon covering land that is not water.
 */
function waterRingsOf(element: OverpassElement): Position[][][] {
    if (element.type === "way") {
        const ring = toPositions(element.geometry);
        return isClosed(ring) ? [[ring]] : [];
    }

    const outer = assembleRings(
        (element.members ?? [])
            .filter(m => m.role !== "inner")
            .map(m => toPositions(m.geometry))
            .filter(line => line.length >= 2)
    );
    const inner = assembleRings(
        (element.members ?? [])
            .filter(m => m.role === "inner")
            .map(m => toPositions(m.geometry))
            .filter(line => line.length >= 2)
    );

    // Holes are attached to the first outer ring that contains their first
    // point; anything unmatched is dropped rather than guessed at.
    return outer.map(ring => [ring, ...inner.filter(hole => ringContains(ring, hole[0]))]);
}

/** Chains open way segments end-to-end into closed rings. */
function assembleRings(segments: Position[][]): Position[][] {
    const remaining = segments.map(segment => [...segment]);
    const rings: Position[][] = [];

    while (remaining.length > 0) {
        let ring = remaining.shift()!;
        let extended = true;

        while (extended && !isClosed(ring)) {
            extended = false;

            for (let i = 0; i < remaining.length; i++) {
                const candidate = remaining[i];
                const tail = ring[ring.length - 1];

                if (samePoint(tail, candidate[0])) {
                    ring = [...ring, ...candidate.slice(1)];
                } else if (samePoint(tail, candidate[candidate.length - 1])) {
                    ring = [...ring, ...[...candidate].reverse().slice(1)];
                } else {
                    continue;
                }

                remaining.splice(i, 1);
                extended = true;
                break;
            }
        }

        if (isClosed(ring)) rings.push(ring);
    }

    return rings;
}

/** Even-odd test used only to attach holes to their outer ring. */
function ringContains(ring: Position[], point: Position): boolean {
    const [x, y] = point;
    let inside = false;

    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];

        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
            inside = !inside;
        }
    }

    return inside;
}

/** Overpass geometry to GeoJSON `[lng, lat]` positions. */
function toPositions(geometry: OverpassNode[] | undefined): Position[] {
    return (geometry ?? []).filter(Boolean).map(node => [node.lon, node.lat] as Position);
}

function isClosed(ring: Position[]): boolean {
    return ring.length >= 4 && samePoint(ring[0], ring[ring.length - 1]);
}

function samePoint(a: Position, b: Position): boolean {
    return Math.abs(a[0] - b[0]) < RING_JOIN_EPSILON && Math.abs(a[1] - b[1]) < RING_JOIN_EPSILON;
}
