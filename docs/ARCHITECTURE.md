# Architecture Documentation

## System Overview
Routista is a client-side heavy Next.js application that leverages external APIs for mapping and routing. The core logic resides in the browser to ensure user privacy and responsiveness.

## Data Flow

1.  **Image Upload** (`ImageUpload.tsx`)
    *   User uploads an image.
    *   Image is drawn to an off-screen Canvas.
    *   `imageProcessing.ts` extracts the shape as a series of normalized coordinates (0-1).

3.  **Shape Editor** (`ShapeEditor.tsx`)
    *   **Manual Drawing**: Allows users to draw a polygon on a blank canvas.
    *   **Overlay Editing**: Allows users to edit the automatically extracted shape (move points, drag corners) overlaid on the original image.
    *   **Simplification**: Shapes extracted from images are simplified using the Douglas-Peucker algorithm to reduce noise (points on straight lines) while preserving key vertices.

4.  **Area Selection** (`AreaSelector.tsx`)
    *   User selects a center point (lat/lng) and a radius (meters).
    *   `geoUtils.ts` scales the normalized shape points to real-world coordinates based on this center and radius.

5.  **Route Generation** (`routeGenerator.ts`)
    *   The scaled points are simplified (Ramer-Douglas-Peucker) to reduce API load.
    *   Points are sent to the internal API route (`/api/radar/directions`).
    *   The API route proxies the request to the Radar API in chunks to respect limits and avoid CORS.
    *   Radar returns navigable paths between the points.
    *   Segments are stitched together to form a continuous `LineString`.

6.  **Visualization** (`ResultMap.tsx`)
    *   The original shape (scaled) and the generated route are overlaid on a Leaflet map.
    *   Accuracy is calculated by comparing the two shapes.

## Core Components

### Frontend (`src/components`)
*   **Map Components**: Wrappers around `react-leaflet` to handle map state and interactions.
*   **UI Components**: Reusable UI elements (Buttons, Inputs) styled with Tailwind CSS.
*   **`ShapeEditor.tsx`**: A vector-based editor for creating and modifying polygon shapes using SVG. Handles point manipulation (add, drag, delete) and aspect ratio locking.

### Libraries (`src/lib`)
*   **`geoUtils.ts`**: Pure functions for geographic calculations (distance, scaling, accuracy).
*   **`routeGenerator.ts`**: Handles interaction with the ORS API and response processing.
*   **`imageProcessing.ts`**: Canvas manipulation, edge detection, and uniform point sampling for consistent shape extraction.

## Key Algorithms

### Shape Matching
The system doesn't "search" for a shape in the road network in the traditional sense. Instead, it:
1.  **Projects** the desired shape onto the map.
2.  **Snaps** the shape's points to the nearest road using the routing engine.
3.  **Routes** between these snapped points.

### Accuracy Calculation (`calculateRouteAccuracy`)
To objectively measure how well the route matches the shape, we use a bidirectional error metric:
1.  **Forward Error**: Average distance from each point on the *original shape* to the nearest segment of the *route*.
2.  **Backward Error**: Average distance from sampled points on the *route* to the nearest point on the *original shape*.

This prevents "cheating" where a route could just be a single point (low forward error for that point, but high backward error for the rest of the shape) or a massive scribble (low forward error, high backward error).

## State Management
State is primarily managed in the parent page (`src/app/create/page.tsx` or similar) and passed down via props. There is no global state management library (Redux/Zustand) as the application flow is linear and simple.

## Infrastructure & Scalability

### Route Caching (Upstash Redis)
- Routes are cached by hashing coordinates + mode into a cache key
- Cache TTL: 24 hours
- Reduces Radar API calls for identical requests
- Graceful fallback: App works without Redis configured

**Files:** `src/lib/radarService.ts`

### Rate Limiting
- IP-based rate limiting: 10 requests per minute per IP
- Implemented in middleware using sliding window algorithm
- Returns 429 with `Retry-After` header when exceeded
- Blocked requests logged to Sentry

**Files:** `middleware.ts`, `src/lib/rateLimit.ts`

### Error Tracking (Sentry)
- Client, server, and edge runtime error capture
- Global error boundary for React errors
- API route errors captured with context
- Rate limit blocks logged as warnings

**Files:** `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`, `src/app/global-error.tsx`

### Environment Variables
| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_RADAR_LIVE_PK` | Radar API key (production) |
| `NEXT_PUBLIC_RADAR_TEST_PK` | Radar API key (fallback/testing) |
| `KV_REST_API_URL` / `UPSTASH_REDIS_REST_URL` | Redis endpoint for caching |
| `KV_REST_API_TOKEN` / `UPSTASH_REDIS_REST_TOKEN` | Redis auth token |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry error tracking |
| `SENTRY_AUTH_TOKEN` | Source map uploads |
| `SENTRY_ORG` / `SENTRY_PROJECT` | Sentry project identifiers |

## Deployment & Hosting

### Platform
- **Hosting**: Vercel (Hobby plan)
- **CI/CD**: Vercel Git Integration (no GitHub Actions)
- **Repository**: Connected via Vercel Dashboard, auto-deploys on push

### Environments

| Environment | Branch | URL | Purpose |
|-------------|--------|-----|---------|
| Production | `main` | routista.eu | Live user traffic |
| Preview | Any other branch | `routista-git-<branch>-*.vercel.app` | Testing before merge |

### Preview Deployments
- Automatically created for every push to non-main branches
- Each preview gets a unique URL accessible from any device (including mobile)
- Environment variables can have different values per environment (configured in Vercel Dashboard)
- PR comments from Vercel bot include preview URL

### Environment-Specific Configuration
Configure different values for Production vs Preview in Vercel Dashboard:
- **Vercel Dashboard** → Project → Settings → Environment Variables
- Each variable can have separate values for: Production, Preview, Development

## Automated Browser Testing

Routista includes infrastructure to support automated end-to-end testing with browser automation tools (Puppeteer, Playwright, Antigravity). Since traditional image upload requires OS file picker dialogs that cannot be automated, the application provides:

### Programmatic Image Upload
- Hidden test controls in `CreateClient.tsx` allow loading test images from the `public/` folder without file picker interaction
- The `loadTestImage` helper function fetches images and processes them through the normal upload flow
- Test images available: `star.png`, `heart.png`, `circle.png`

### Test Identifiers
- All interactive UI elements have `data-testid` attributes for reliable selection
- Status indicators expose application state (current step, image loaded, route generated, etc.)
- These elements are hidden (`display: none`) but accessible to automation tools

### Documentation
For complete details on automated testing, including:
- Available test controls and their usage
- Complete list of `data-testid` attributes
- Full E2E test example code
- Best practices and debugging tips

See [`AUTOMATED_TESTING.md`](file:///Users/jakubanderwald/code/routista.antigravity/docs/AUTOMATED_TESTING.md)

**Note:** Test controls are present in all builds (including production) to enable agent-based testing workflows.
