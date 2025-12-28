# Debugging Guide

## Console Logging

The application includes comprehensive logging to track the shape-to-route pipeline. Open browser DevTools (F12) → Console to see logs.

### Log Prefixes

| Prefix | Source File | What It Shows |
|--------|-------------|---------------|
| `[extractShapeFromImage]` | `imageProcessing.ts` | Image processing, boundary tracing, uniform point sampling |
| `[geoUtils]` | `geoUtils.ts` | Geo coordinate simplification (Douglas-Peucker) |
| `[RadarService]` | `radarService.ts` | API calls, chunking, route stitching |
| `[CreateClient]` | `CreateClient.tsx` | Overall flow, input/output stats |

### Typical Log Flow

```
[extractShapeFromImage] Found component 1 with 2847 boundary points at 45,120
[extractShapeFromImage] Found 1 total component(s)
[extractShapeFromImage] Combined path has 2847 points
[extractShapeFromImage] Sampled 151 points (requested: 150)

[CreateClient] Starting route generation...
[CreateClient] Input: 151 shape points, center: [51.5050, -0.0900], radius: 2000m, mode: cycling-regular
[CreateClient] Scaled to 151 geo points

[geoUtils] simplifyPoints: 151 → 118 points (closed: true, tolerance: 0.0001 → 0.000005)

[RadarService] Simplification: 151 → 118 points (tolerance: 0.0001, mode: cycling-regular)
[RadarService] Routing 45 waypoints in 5 chunk(s)
[RadarService] Processing chunk 1/5 with 11 points
[RadarService] Processing chunk 2/5 with 11 points
...
[RadarService] Route generated: 1247 route points, 8.45km, 28min

[CreateClient] Route complete: 8.45km, 87% accuracy
```

### Diagnosing Poor Accuracy

If accuracy is low (< 80%), check the logs for:

1. **Over-simplification**: Look at point counts through the pipeline
   - `extractShapeFromImage`: Should output ~151 points (150 + 1 to close loop)
   - `geoUtils simplifyPoints`: Should preserve at least 50% of input points
   - If points drop to < 10, the shape is being over-simplified

2. **Shape type detection**: Check "closed loop" vs "open shape"
   - Closed shapes (stars, hearts) get stricter simplification tolerance
   - Open shapes (letters, symbols) also get strict tolerance (fixed in issue #5)

3. **Chunk failures**: Check if all chunks process successfully
   - Missing chunks will cause gaps in the route

### Example: Debugging Issue #5 (Poor Accuracy)

The issue showed 70% accuracy for an open shape. Logs revealed:
```
[geoUtils] simplifyPoints: 45 → 3 points (closed: false, tolerance: 0.0005 → 0.0005)
```
The problem: Open shapes weren't getting adjusted tolerance, causing over-simplification to just 3 points. Fixed by applying tolerance/10 to open shapes.

## Radar API

### Mocking Responses
The `radarService.ts` file returns a mock response if no Radar API key is configured.
- **To enable mocking:** Remove `NEXT_PUBLIC_RADAR_LIVE_PK` and `NEXT_PUBLIC_RADAR_TEST_PK` from `.env.local`
- **Mock behavior:** Returns a straight line connecting the input points (as if flying) instead of following roads.

### Common API Issues
- **429 Too Many Requests:** The free tier has limits. Wait a minute or check your Radar dashboard.
- **Route not found:** Points may be too far apart or in non-navigable areas. Try a different location or transportation mode.
- **Chunk failures:** If one chunk fails, the entire route fails. Check console for specific error messages.

## Caching (Upstash Redis)

### Cache Logs
Look for these log messages in Vercel logs or local console:

| Log Message | Meaning |
|-------------|---------|
| `[RadarService] Cache HIT for key: ...` | Route served from cache (no API call) |
| `[RadarService] Cache MISS for key: ...` | Route not cached, calling Radar API |
| `[RadarService] Cached result with key: ...` | Successfully stored route in cache |
| `[RadarService] Redis not configured...` | No Redis env vars, caching disabled |

### Cache Key Format
```
route:{mode}:{hash}
```
- `mode`: `foot-walking`, `cycling-regular`, or `driving-car`
- `hash`: djb2 hash of coordinates (5 decimal precision)

### Debugging Cache Issues
1. **Cache not working locally:** Pull env vars with `npx vercel env pull .env.local`
2. **Same route not caching:** Coordinates must match exactly (5 decimal places)
3. **Check Redis directly:** Use Upstash console to inspect keys

## Rate Limiting

### Rate Limit Logs
| Log Message | Meaning |
|-------------|---------|
| `[RateLimit] ALLOWED {ip}: {count}/{limit}` | Request allowed |
| `[RateLimit] BLOCKED {ip}: {count}/{limit}` | Request blocked (429 returned) |
| `[RateLimit] Redis not configured...` | No Redis, rate limiting disabled |

### Testing Rate Limits
Make 11 requests in 1 minute from the same IP. The 11th should return:
```json
{
  "error": "Too many requests",
  "message": "Rate limit exceeded. Please try again later.",
  "retryAfter": 1234567890
}
```

## Sentry Error Tracking

### Verifying Sentry Works
1. Check Sentry dashboard for "Session Started" events after page load
2. Trigger an error (e.g., generate route with bad params)
3. Check Sentry Issues for the error with stack trace

### Rate Limit Blocks in Sentry
Blocked requests appear as warnings with level "warning" and message "Rate limit exceeded". Check `extra` data for IP and path.

### Disabling Sentry Locally
Remove `NEXT_PUBLIC_SENTRY_DSN` from `.env.local` — Sentry SDK no-ops gracefully.

## Visualization

### Debugging Shape Alignment
When debugging accuracy issues, it helps to see what the algorithm sees:
- **Original Shape:** Rendered as a semi-transparent overlay (usually red/blue) on the map.
- **Matched Route:** Rendered as a solid line (usually blue/purple).
- **Discrepancies:** Look for areas where the route takes a long detour. This usually indicates a lack of roads in that specific area.

## Testing Geometric Functions
The core logic in `src/lib/geoUtils.ts` is pure and can be tested without the browser.
- Run `npm test` to execute the Vitest suite.
- Add new test cases in `tests/` if you encounter edge cases.

## Point Sampling and Simplification

The pipeline uses uniform sampling followed by Douglas-Peucker simplification:

1. **Image Processing** (`imageProcessing.ts`): Uniform sampling with `numPoints` parameter
   - Samples evenly-spaced points along the traced boundary
   - Default: 150 points (configurable)
   - Ensures consistent point count regardless of boundary complexity

2. **Geo Coordinates** (`radarService.ts` via `geoUtils.ts`): Douglas-Peucker algorithm
   - Mode-specific tolerances (in degrees):
     - `driving-car`: 0.0004° (~30-45m)
     - `cycling-regular`: 0.0001° (~7-11m)
     - `foot-walking`: 0.00005° (~4-6m)
   - Additional adjustment in `simplifyPoints`:
     - Closed loops: tolerance / 20
     - Open shapes: tolerance / 10

