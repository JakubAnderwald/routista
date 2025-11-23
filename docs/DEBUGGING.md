# Debugging Guide

## OpenRouteService (ORS) API

### Mocking Responses
The `routeGenerator.ts` file contains logic to mock the API response if the `NEXT_PUBLIC_ORS_API_KEY` environment variable is missing.
- **To enable mocking:** Simply remove or comment out the API key in your `.env.local` file.
- **Mock behavior:** Returns a straight line connecting the input points (as if flying) instead of following roads.

### Common API Issues
- **429 Too Many Requests:** The free tier of ORS has limits. If you hit this, wait a minute or check your dashboard.
- **Route not found:** If points are too far apart or in non-navigable areas (e.g., middle of the ocean), ORS might fail. Try increasing the number of points or moving the area.

## Visualization

### Debugging Shape Alignment
When debugging accuracy issues, it is helpful to see exactly what the algorithm sees.
- **Original Shape:** Rendered as a semi-transparent overlay (usually red/blue) on the map.
- **Matched Route:** Rendered as a solid line (usually blue/purple).
- **Discrepancies:** Look for areas where the route takes a long detour. This usually indicates a lack of roads in that specific area.

## Testing Geometric Functions
The core logic in `src/lib/geoUtils.ts` is pure and can be tested without the browser.
- Run `npm test` to execute the Vitest suite.
- Add new test cases in `tests/` if you encounter edge cases (e.g., shapes crossing the anti-meridian, though this is currently not fully supported).
