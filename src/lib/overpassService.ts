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

const OVERPASS_URL = process.env.OVERPASS_URL || "https://overpass-api.de/api/interpreter";

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

/** In-process cache, so repeated routes in one lambda skip even Redis. */
const memoryCache = new Map<string, FeatureCollection>();

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
    if (inMemory) return inMemory;

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
        collection = await fetchWaterAndBridges(bbox, RIVER_CROSSING.overpassTimeoutMs);
    } catch (error) {
        // Overpass being down must never break route generation.
        console.warn(
            `[Overpass] Fetch failed, routing without water data: ${error instanceof Error ? error.message : "unknown"}`
        );
        Sentry.captureMessage("Overpass fetch failed", {
            level: "warning",
            extra: { service: "overpassService", bbox },
        });
        return null;
    }

    console.log(
        `[Overpass] Fetched ${collection.features.length} features for ${key}`
    );
    memoryCache.set(key, collection);

    if (redis) {
        try {
            await redis.set(key, collection, { ex: RIVER_CROSSING.waterCacheTtlSeconds });
        } catch (error) {
            console.log(
                `[Overpass] Cache write failed: ${error instanceof Error ? error.message : "unknown"}`
            );
        }
    }

    return collection;
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
 * @param timeoutMs - Abort the request after this long.
 * @returns FeatureCollection of water Polygons and bridge LineStrings.
 */
export async function fetchWaterAndBridges(
    bbox: [number, number, number, number],
    timeoutMs = 90_000
): Promise<FeatureCollection> {
    const [south, west, north, east] = bbox;
    const area = `${south},${west},${north},${east}`;

    const query = `[out:json][timeout:90];
(
  way["natural"="water"](${area});
  relation["natural"="water"](${area});
  way["waterway"="riverbank"](${area});
  relation["waterway"="riverbank"](${area});
  way["bridge"]["highway"](${area});
);
out geom;`;

    const data = await runQuery(query, timeoutMs);
    return toFeatureCollection(data.elements ?? []);
}

/**
 * Runs an Overpass query, retrying when the public instance is busy.
 *
 * Overpass answers 429 when its query slots are full and 504 when a query
 * takes too long; both clear on their own after a short wait.
 */
async function runQuery(
    query: string,
    timeoutMs: number,
    attempts = 4
): Promise<{ elements: OverpassElement[] }> {
    let lastError = "";

    for (let attempt = 1; attempt <= attempts; attempt++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const response = await fetch(OVERPASS_URL, {
                method: "POST",
                // Overpass answers 406 to requests without a User-Agent.
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "User-Agent": "routista/1.0 (https://www.routista.eu)",
                    Accept: "application/json",
                },
                body: `data=${encodeURIComponent(query)}`,
                signal: controller.signal,
            });

            if (response.ok) {
                return (await response.json()) as { elements: OverpassElement[] };
            }

            lastError = `${response.status}: ${(await response.text()).slice(0, 200)}`;
            if (response.status !== 429 && response.status !== 504) break;
        } catch (error) {
            lastError = error instanceof Error ? error.message : String(error);
        } finally {
            clearTimeout(timer);
        }

        const backoffMs = 5_000 * attempt;
        console.log(`[overpass] attempt ${attempt} failed (${lastError}); retrying in ${backoffMs}ms`);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
    }

    throw new Error(`Overpass error after ${attempts} attempts — ${lastError}`);
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
