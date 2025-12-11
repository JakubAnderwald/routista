# Debugging Guide

## Console Logging

The application includes comprehensive logging to track the shape-to-route pipeline. Open browser DevTools (F12) → Console to see logs.

### Log Prefixes

| Prefix | Source File | What It Shows |
|--------|-------------|---------------|
| `[extractShapeFromImage]` | `imageProcessing.ts` | Image processing, boundary tracing, pixel-level simplification |
| `[geoUtils]` | `geoUtils.ts` | Geo coordinate simplification (Douglas-Peucker) |
| `[RadarService]` | `radarService.ts` | API calls, chunking, route stitching |
| `[CreateClient]` | `CreateClient.tsx` | Overall flow, input/output stats |

### Typical Log Flow

```
[extractShapeFromImage] Found component 1 with 2847 boundary points at 45,120
[extractShapeFromImage] Found 1 total component(s)
[extractShapeFromImage] Combined path has 2847 points
[extractShapeFromImage] Simplification: 2847 → 89 points (epsilon: 5px)
[extractShapeFromImage] Shape bounds: x=[45, 755], y=[23, 677]
[extractShapeFromImage] Shape type: closed loop (start-end distance: 0.3%)
[extractShapeFromImage] Final output: 89 normalized points

[CreateClient] Starting route generation...
[CreateClient] Input: 89 shape points, center: [51.5050, -0.0900], radius: 2000m, mode: cycling-regular
[CreateClient] Scaled to 89 geo points

[geoUtils] simplifyPoints: 89 → 45 points (closed: true, tolerance: 0.0001 → 0.000005)

[RadarService] Simplification: 89 → 45 points (tolerance: 0.0001, mode: cycling-regular)
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
   - `extractShapeFromImage`: Should output 30-150 points for typical shapes
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

## Simplification Tolerances

The Douglas-Peucker algorithm runs twice:

1. **Image Processing** (`imageProcessing.ts`): epsilon = 5 pixels
   - Removes noise from boundary tracing
   - Typical reduction: 1000+ points → 50-150 points

2. **Geo Coordinates** (`radarService.ts` via `geoUtils.ts`):
   - Mode-specific tolerances (in degrees):
     - `driving-car`: 0.0004° (~30-45m)
     - `cycling-regular`: 0.0001° (~7-11m)
     - `foot-walking`: 0.00005° (~4-6m)
   - Additional adjustment in `simplifyPoints`:
     - Closed loops: tolerance / 20
     - Open shapes: tolerance / 10
