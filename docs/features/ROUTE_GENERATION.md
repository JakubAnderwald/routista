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
Stitch Segments Together
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
| Overlap between chunks | 1 point (for continuity) |

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

### 5. Segment Stitching

Route segments from each chunk merged:

- Remove duplicate points at boundaries
- Verify continuity
- Combine into single LineString

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

