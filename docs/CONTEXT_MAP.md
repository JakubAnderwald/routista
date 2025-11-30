# Agent Context Map

This file maps concepts and features to their source of truth in the codebase. Use this to quickly locate the relevant files for a task without searching.

## 🗺️ Concept Index

| Concept | Primary File(s) | Description |
| :--- | :--- | :--- |
| **Routing Logic** | `src/lib/routeGenerator.ts` | Calls Radar API, handles batching, stitching, and error handling. |
| **Shape Extraction** | `src/lib/imageProcessing.ts` | Canvas logic to turn images into point arrays. |
| **Geo Calculations** | `src/lib/geoUtils.ts` | Distance, scaling, simplification, and accuracy scoring. Pure functions. |
| **Main UI Flow** | `src/app/[locale]/create/CreateClient.tsx` | State machine for the "Create" wizard (Upload -> Area -> Mode -> Result). |
| **Map Visualization** | `src/components/ResultMap.tsx` | Displays the generated route and original shape on Leaflet. |
| **Image Upload** | `src/components/ImageUpload.tsx` | Handles file drop and preview. **See Testing Note below.** |
| **Area Selection** | `src/components/AreaSelector.tsx` | Map interface for choosing center point and radius. |
| **GPX Export** | `src/lib/gpxGenerator.ts` | Converts Route data to GPX XML format. |
| **Testing Hooks** | `src/app/[locale]/create/CreateClient.tsx` | Contains hidden `data-testid` controls and `window.__routistaTestHelpers`. |
| **Translations** | `messages/[locale].json` | i18n strings for all pages. Supported locales: `en` (English), `de` (German), `pl` (Polish), `da` (Danish). |
| **Page Structure** | `src/app/[locale]/[page]/page.tsx` | All pages support dynamic locale routing via Next.js App Router with next-intl. |
| **Page Layouts** | `src/app/[locale]/layout.tsx` | Root layout that sets up i18n providers and metadata. |

## 📂 File Tree & Purpose

### Core Logic (`src/lib/`)
*   `routeGenerator.ts`: **CRITICAL**. The "brain" that finds the route.
*   `geoUtils.ts`: **CRITICAL**. Math heavy. Handles coordinate geometry.
*   `imageProcessing.ts`: **CRITICAL**. Computer vision lite.
*   `gpxGenerator.ts`: Utility for file export.

### Components (`src/components/`)
*   `CreateClient.tsx`: **CRITICAL**. The main page logic.
*   `ImageUpload.tsx`: Drag-and-drop UI.
*   `AreaSelector.tsx`: Interactive map for area picking.
*   `ResultMap.tsx`: Final output display.
*   `ModeSelector.tsx`: Walking/Cycling/Driving cards.

### Pages (`src/app/`)
*   `[locale]/create/page.tsx`: Wrapper for `CreateClient`.
*   `[locale]/page.tsx`: Landing page.

## 🤖 Agent Instructions

### Testing & Automation
*   **NEVER** try to interact with the OS file picker.
*   **ALWAYS** use the hidden test controls in `CreateClient.tsx` for image uploads.
*   **USE** `window.__routistaTestHelpers.loadTestImage()` or `loadImageFromDataURL()`.
*   **REFER** to `docs/AUTOMATED_TESTING.md` for the full protocol.

### Architecture
*   **Data Flow**: Image -> Points (0-1) -> Scaled Geo Points (Lat/Lng) -> Route (LineString).
*   **State**: Local state in `CreateClient.tsx` drives the wizard.
