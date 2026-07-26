# Route Generation Feature

Transform shape points into a navigable real-world route.

## Overview

The route generation process takes normalized shape points, scales them to geographic coordinates, and uses the Radar routing API to find navigable paths between the points.

## Process Flow

```
Shape Points (0-1)
    ↓
Scale to Geo Coordinates (lat/lng)
    ↓
Simplify (Douglas-Peucker)
    ↓
Chunk into API Batches
    ↓
Call Radar Directions API
    ↓
Repair River Crossings (foot/bike only, when needed)
    ↓
Stitch Segments Together
    ↓
Remove Out-and-Back Spurs
    ↓
Return GeoJSON LineString
```

## Detailed Steps

### 1. Geo Scaling

Normalized points (0-1 range) scaled to real coordinates:

```typescript
scalePointsToGeo(
    points: [number, number][],   // Normalized 0-1
    center: [number, number],      // Map center [lat, lng]
    radiusMeters: number           // Area radius
): [number, number][]              // Geographic coordinates
```

### 2. Simplification

Douglas-Peucker algorithm reduces point count while preserving shape:

- Mode-specific tolerance (walking = tightest, driving = loosest)
- Closed loops get stricter tolerance (÷20)
- Open shapes also get adjusted tolerance (÷10)
- Typically reduces 150 points to 50-100

### 3. Chunking

Radar API has waypoint limits. Coordinates split into chunks:

| Setting | Value |
|---------|-------|
| Max waypoints per request | 25 |
| Waypoints per chunk | 11 (`RADAR_API.chunkSize` + 1) |
| Overlap between chunks | Exactly 1 point, which stitching drops |

### 4. API Calls

Each chunk sent to `/api/radar/directions`:

```typescript
POST /api/radar/directions
{
    "coordinates": [[lat, lng], ...],
    "mode": "foot-walking"
}
```

Server proxies to Radar API, handles auth, and caches results.

### 4b. River Crossing Repair (walking and cycling)

Radar's foot and bike profiles route along the ferry ways in the Thames, so a shape drawn over
London used to travel down the middle of the river instead of using a bridge (issue #47).

When a routing pass returns an edge longer than any real street, water polygons and bridges are
fetched from OpenStreetMap and:

1. every run of waypoints inside water is replaced with a crossing over the nearest suitable
   bridge, and
2. any leg that still travels on water has a crossing pinned into it.

Driving is unaffected: its routing graph has no waterways.

What this does **not** promise:

- **The long edge is a heuristic, not proof of a ferry.** It only says the router left the
  pedestrian network. Madrid trips it via a road tunnel, which is not water — so OSM gets
  fetched and nothing is repaired. That is the intended outcome, not a failure.
- **A run with no reachable bridge stays unresolved.** If nothing crosses the water within
  range, or every crossing costs more than the diversion cap, those waypoints are dropped and
  the router connects the banks however it can.
- **Not every OSM response is shared via Redis.** Responses over 800 KB stay in the calling
  process only, and areas over 60 km² are not fetched at all.
- **If OSM data cannot be fetched, the route is returned exactly as Radar produced it** —
  including when Overpass is slow, down, or the area is too large.

See `docs/technical/ISSUE_47_BASELINE.md` for the measurements.

### 5. Segment Stitching

Route segments from each chunk merged:

- Remove duplicate points at boundaries
- Verify continuity
- Combine into single LineString

### 6. Spur Removal

Every waypoint is a forced via-point, so one that snapped to a driveway or a cul-de-sac made the
router go in and come straight back out. Those out-and-backs are spliced out of the stitched
geometry, which shortens routes by 6-61%.

An excursion is kept only when the shape needs it: if cutting it would leave a requested waypoint
further than `maxShapeLossMeters` from the route — 60 m walking and cycling, 100 m driving — it
stays. So a detour into a cul-de-sac goes, and a headland the outline really traces does not.

`properties.summary.distance` describes the cleaned geometry; Radar's own total is kept beside it
as `routedDistance`, and `properties.legs` still describe the route before cleanup.

See `docs/technical/SPUR_CLEANUP.md`.

## Accuracy Calculation

After route generation, accuracy is calculated:

```typescript
function calculateRouteAccuracy(
    originalPoints: [number, number][],  // Scaled shape
    routeData: FeatureCollection,         // Generated route
    radiusMeters: number
): number  // 0-100 percentage
```

**Bidirectional Error Metric:**
1. **Forward Error**: Distance from shape points to nearest route segment
2. **Backward Error**: Distance from route samples to nearest shape point

Prevents gaming (e.g., single point route or random scribble).

## Implementation

### Key Files

| File | Purpose |
|------|---------|
| `src/lib/routeGenerator.ts` | Client-side wrapper, calls API |
| `src/lib/radarService.ts` | Server-side Radar proxy, caching, chunking |
| `src/lib/geoUtils.ts` | Scaling, simplification, accuracy |
| `src/app/api/radar/directions/route.ts` | API route handler |
| `src/config/routing.ts` | Tolerances, chunk sizes |

### Client API

```typescript
interface RouteGenerationOptions {
    coordinates: [number, number][];  // [lat, lng] array
    mode: string;                      // TransportMode
}

async function generateRoute(
    options: RouteGenerationOptions
): Promise<FeatureCollection>
```

### Server API

```typescript
POST /api/radar/directions
Content-Type: application/json

{
    "coordinates": [[51.505, -0.09], ...],
    "mode": "cycling-regular"
}

Response: GeoJSON FeatureCollection with LineString
```

## Caching

Routes cached in Upstash Redis:

| Setting | Value |
|---------|-------|
| Cache key | `route:{mode}:{hash}` |
| Hash | djb2 of coordinates (5 decimal precision) |
| TTL | 24 hours |
| Fallback | API call if cache miss or Redis unavailable |

## Rate Limiting

| Setting | Value |
|---------|-------|
| Limit | 10 requests/minute per IP |
| Algorithm | Sliding window |
| Response | 429 with `Retry-After` header |

## Error Handling

| Error | Cause | Resolution |
|-------|-------|------------|
| "At least 2 coordinates required" | Empty or single point | Check shape extraction |
| "Route not found" | No roads between points | Try different location |
| "Rate limit exceeded" | Too many requests | Wait and retry |
| Chunk failure | API timeout or error | Automatic retry (1x) |

## Performance

| Metric | Target |
|--------|--------|
| Shape scaling | < 10ms |
| Simplification | < 50ms |
| API round-trip (cached) | < 100ms |
| API round-trip (uncached) | < 5s per chunk |
| Total generation | < 30s typical |

## Debugging

Enable console logs to see the pipeline:

```
[CreateClient] Starting route generation...
[CreateClient] Input: 151 shape points, center: [51.5, -0.09], radius: 2000m
[geoUtils] simplifyPoints: 151 → 98 points
[RadarService] Routing 98 waypoints in 4 chunk(s)
[RadarService] Processing chunk 1/4 with 25 points
...
[RadarService] Route generated: 847 points, 6.2km
[CreateClient] Route complete: 6.2km, 85% accuracy
```

See `docs/technical/DEBUGGING.md` for detailed debugging guide.

