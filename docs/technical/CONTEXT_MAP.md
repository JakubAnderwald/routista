# Agent Context Map

This file maps concepts and features to their source of truth in the codebase. Use this to quickly locate the relevant files for a task without searching.

## 🗺️ Concept Index

| Concept | Primary File(s) | Description |
| :--- | :--- | :--- |
| **Dev Setup** | `docs/technical/DEV_SETUP.md` | Complete environment setup guide with API keys, tools, troubleshooting. |
| **Routing Logic** | `src/lib/routeGenerator.ts` | Calls Radar API, handles batching, stitching, and error handling. |
| **Shape Extraction** | `src/lib/imageProcessing.ts`, `src/lib/imageProcessingCore.ts` | Canvas wrapper + platform-agnostic algorithms (Otsu, boundary tracing). |
| **Geo Calculations** | `src/lib/geoUtils.ts` | Distance, scaling, simplification, and accuracy scoring. Pure functions. |
| **Main UI Flow** | `src/app/[locale]/create/CreateClient.tsx` | State machine for the "Create" wizard (Upload -> Area -> Mode -> Result). |
| **Map Visualization** | `src/components/ResultMap.tsx` | Displays the generated route and original shape on Leaflet. |
| **Image Upload** | `src/components/ImageUpload.tsx` | Handles file drop and preview. **See Testing Note below.** |
| **Area Selection** | `src/components/AreaSelector.tsx` | Map interface for choosing center point and radius. |
| **GPX Export** | `src/lib/gpxGenerator.ts` | Converts Route data to GPX XML format. |
| **Social Sharing** | `src/components/ShareModal.tsx`, `src/lib/shareImageGenerator.ts` | Branded image generation for social media. See `docs/features/SHARE.md`. |
| **Strava Integration** | `src/components/StravaButton.tsx`, `src/lib/stravaService.ts`, `src/app/api/strava/` | Direct route upload to Strava. **Currently disabled** pending Routes API access. Debug instrumentation in place (Issue #44). See `docs/features/STRAVA_INTEGRATION.md`. |
| **Route Caching** | `src/lib/radarService.ts` | Caches routes in Upstash Redis (24h TTL). |
| **Cache Management** | `scripts/flush-route-cache.ts` | Flush route cache after routing logic changes. |
| **Rate Limiting** | `middleware.ts`, `src/lib/rateLimit.ts` | IP-based rate limiting (10 req/min) using Upstash Redis. |
| **Error Tracking** | `sentry.*.config.ts`, `src/app/global-error.tsx` | Sentry SDK for client/server/edge error capture. |
| **Product Analytics** | `src/lib/analytics.ts`, `src/components/PostHogProvider.tsx` | PostHog analytics with typed events and automatic pageview tracking. |
| **Testing Hooks** | `src/app/[locale]/create/CreateClient.tsx` | Contains hidden `data-testid` controls and `window.__routistaTestHelpers`. |
| **Unit Tests** | `tests/unit/*.test.ts` | Pure function tests for `src/lib/` modules. Run with `npm test`. |
| **Test Coverage** | `vitest.config.ts` | Coverage config. Run `npm run test:coverage` for reports. |
| **Code Quality (SonarCloud)** | `sonar-project.properties`, `.github/workflows/security.yml` | Static analysis, coverage tracking. Dashboard: sonarcloud.io |
| **Code Quality (CodeRabbit)** | `.coderabbit.yaml` | AI-powered PR code reviews. Free for open source. |
| **Translations** | `messages/[locale].json` | i18n strings for all pages. Supported locales: `en` (English), `de` (German), `pl` (Polish), `da` (Danish). |
| **Page Structure** | `src/app/[locale]/[page]/page.tsx` | All pages support dynamic locale routing via Next.js App Router with next-intl. |
| **Page Layouts** | `src/app/[locale]/layout.tsx` | Root layout that sets up i18n providers and metadata. |
| **UI Variant Config** | `src/config.ts`, `src/components/ABTestProvider.tsx` | Feature flag for UI variant (A or B). See `docs/features/UI_VARIANTS.md`. |
| **App Configuration** | `src/config.ts`, `src/config/` | Centralized config: routing tolerances, API settings, geo constants, image processing, feature toggles (`stravaEnabled`, `uiVariant`). |
| **Deployment & Hosting** | `docs/technical/ARCHITECTURE.md` (Deployment section) | Vercel setup, environments (Production/Preview), env vars. |

## 📂 File Tree & Purpose

### Configuration (`src/config/`)
*   `routing.ts`: Transport modes, simplification tolerances, route presets.
*   `image.ts`: Image processing constants (dimensions, thresholds).
*   `api.ts`: Radar API settings, cache TTL, rate limiting.
*   `geo.ts`: Geographic constants (earth radius, accuracy settings).
*   `../config.ts`: Main entry point, re-exports all config modules.

### Core Logic (`src/lib/`)
*   `routeGenerator.ts`: **CRITICAL**. The "brain" that finds the route (client-side wrapper).
*   `radarService.ts`: **CRITICAL**. Server-side service that proxies Radar API calls. Includes route caching.
*   `rateLimit.ts`: Rate limiting helper using Upstash Redis.
*   `geoUtils.ts`: **CRITICAL**. Math heavy. Handles coordinate geometry.
*   `imageProcessingCore.ts`: **CRITICAL**. Platform-agnostic shape extraction algorithms (Otsu, boundary tracing).
*   `imageProcessing.ts`: **CRITICAL**. Browser wrapper for image processing (uses Canvas API + core).
*   `gpxGenerator.ts`: Utility for file export.
*   `shareImageGenerator.ts`: Branded image generation for social sharing. Uses `leaflet-image` + Canvas API.
*   `stravaService.ts`: Strava OAuth and API integration. Token management, route upload.
*   `analytics.ts`: Type-safe PostHog analytics wrapper. See Analytics Events below.

### Infrastructure (root)
*   `middleware.ts`: Rate limiting for `/api/radar/*` routes, i18n routing.
*   `sentry.client.config.ts`: Client-side Sentry initialization.
*   `sentry.server.config.ts`: Server-side Sentry initialization.
*   `sentry.edge.config.ts`: Edge runtime Sentry initialization.
*   `next.config.ts`: Next.js config wrapped with Sentry.

### Analytics (`src/lib/`, `src/components/`)
*   `analytics.ts`: Type-safe event tracking with localhost protection and timing utilities.
*   `PostHogProvider.tsx`: PostHog initialization and pageview tracking for App Router.
*   `SupportButton.tsx`: Client component for Buy Me a Coffee with analytics tracking.

### Documentation (`docs/`)
*   `README.md`: Documentation index and overview.
*   `features/`: Feature-specific documentation (user-facing features).
*   `technical/`: Technical documentation (architecture, testing, debugging).

### Tests (`tests/`)
*   `routeAccuracy.test.ts`: Integration tests - end-to-end route generation accuracy.
*   `unit/`: Unit tests for pure functions in `src/lib/`.
    *   `gpxGenerator.test.ts`: GPX XML generation tests.
    *   `geoUtils.test.ts`: Distance, route length, simplification tests.
    *   `imageProcessingCore.test.ts`: Otsu algorithm, boundary tracing tests.
    *   `stravaService.test.ts`: Strava mode mapping tests.
    *   `shareImageGenerator.test.ts`: Mobile detection, platform URL tests.
    *   `radarService.test.ts`: Coordinate hashing tests.
    *   `rateLimit.test.ts`: Rate limiting logic tests.
    *   `routeGenerator.test.ts`: Route generation client tests.
    *   `utils.test.ts`: Utility function tests.
    *   `analytics.test.ts`: Analytics service tests (tracking, localhost, timing).
*   `components/`: Component tests using React Testing Library.
    *   `ImageUpload.test.tsx`: File upload, drag-drop, preview tests.
    *   `ModeSelector.test.tsx`: Transport mode selection tests.
    *   `ShareModal.test.tsx`: Social sharing modal tests.
    *   `StravaButton.test.tsx`: Strava OAuth and upload tests.
*   `api/`: API route tests.
    *   `radar-autocomplete.test.ts`: Autocomplete endpoint tests.
    *   `radar-directions.test.ts`: Directions endpoint tests.
    *   `strava-callback.test.ts`: OAuth callback tests.
    *   `strava-upload.test.ts`: Route upload tests.
*   `utils/nodeImageProcessing.ts`: Node.js wrapper for image processing (uses Sharp + core).
*   `e2e/`: E2E test templates.

### Components (`src/components/`)
*   `CreateClient.tsx`: **CRITICAL**. The main page logic. Has UI variant conditional rendering.
*   `ImageUpload.tsx`: Drag-and-drop UI.
*   `AreaSelector.tsx`: Interactive map for area picking. Mode props optional (variant B).
*   `ResultMap.tsx`: Final output display. Exposes `getMap()` ref for sharing.
*   `ModeSelector.tsx`: Walking/Cycling/Driving cards. Used in variant A only.
*   `ShareModal.tsx`: Social sharing UI. Platform selection, copy/download/share actions.
*   `StravaButton.tsx`: Strava connect/upload button. OAuth popup flow, upload status.
*   `ABTestProvider.tsx`: UI variant context provider. See `docs/features/UI_VARIANTS.md`.
*   `SupportButton.tsx`: Buy Me a Coffee button with analytics tracking.

### Pages (`src/app/`)
*   `[locale]/create/page.tsx`: Wrapper for `CreateClient`.
*   `[locale]/page.tsx`: Landing page.

## 📊 Analytics Events

The following custom events are tracked via PostHog (see `src/lib/analytics.ts`):

| Event | Trigger Location | Properties |
| :--- | :--- | :--- |
| `wizard_started` | `CreateClient.tsx` mount | - |
| `shape_selected` | Image upload, example select, shape draw | `source`, `point_count` |
| `area_selected` | Generate button click | `radius_meters`, `transport_mode` |
| `generation_request` | Start of route generation | `point_count`, `radius_meters`, `transport_mode` |
| `generation_result` | Route generation complete | `status`, `latency_ms`, `route_length_km?`, `accuracy_percent?`, `error_message?` |
| `gpx_exported` | Download button click | `route_length_km`, `accuracy_percent`, `transport_mode` |
| `social_share` | Share modal actions | `platform`, `action` |
| `support_click` | Buy Me a Coffee button | `location` |

**Note**: Events are skipped on localhost to keep production data clean.

## 🤖 Agent Instructions

### Testing & Automation
*   **NEVER** try to interact with the OS file picker.
*   **ALWAYS** use the hidden test controls in `CreateClient.tsx` for image uploads.
*   **USE** `window.__routistaTestHelpers.loadTestImage()` or `loadImageFromDataURL()`.
*   **REFER** to `docs/technical/TESTING_STRATEGY.md` for the full testing guide.

### Architecture
*   **Data Flow**: Image -> Points (0-1) -> Scaled Geo Points (Lat/Lng) -> Route (LineString).
*   **State**: Local state in `CreateClient.tsx` drives the wizard.

### Context7 MCP - Up-to-date Library Docs
Use Context7 MCP for current documentation on project dependencies:

| Library | Context7 ID | Use Case |
| :--- | :--- | :--- |
| next-intl | `/amannn/next-intl` | i18n, useTranslations, App Router i18n |
| Leaflet | `/leaflet/leaflet` | Map rendering, markers, events |
| Next.js | `/vercel/next.js` | App Router, server components |
| Tailwind CSS | `tailwindcss.com/docs` | Utility classes, config |
| Lucide | `/lucide-icons/lucide` | Icon names, React usage |

**Usage**: `mcp_context7_get-library-docs` with `context7CompatibleLibraryID` and `topic`.

## 📚 Documentation Structure

### Feature Documentation (`docs/features/`)
User-facing feature descriptions with implementation details:

| Document | Feature |
| :--- | :--- |
| `IMAGE_UPLOAD.md` | Image upload, shape extraction |
| `AREA_SELECTION.md` | Map-based location selection |
| `TRANSPORT_MODES.md` | Walking, cycling, driving modes |
| `ROUTE_GENERATION.md` | Shape-to-route matching algorithm |
| `ROUTE_EXPORT.md` | GPX download functionality |
| `SHARE.md` | Social media sharing |
| `STRAVA_INTEGRATION.md` | Direct Strava route upload |
| `UI_VARIANTS.md` | A/B test variants configuration |

### Technical Documentation (`docs/technical/`)
Architecture and developer guides:

| Document | Purpose |
| :--- | :--- |
| `DEV_SETUP.md` | **Start here** - Complete dev environment setup |
| `ARCHITECTURE.md` | System overview, data flow, infrastructure |
| `TESTING_STRATEGY.md` | Test pyramid, coverage requirements, browser automation |
| `DEBUGGING.md` | Console logs, troubleshooting |
| `CONTEXT_MAP.md` | This file - concept-to-file mapping |
