# Route Export Feature

Download your generated route for use in GPS devices and navigation apps.

## Overview

Once a route is generated, users can download it in standard GPS formats for use with their preferred navigation app or device.

## Supported Formats

### GPX (GPS Exchange Format)

| Property | Value |
|----------|-------|
| Extension | `.gpx` |
| MIME type | `application/gpx+xml` |
| Compatibility | Garmin, Strava, Komoot, Wahoo, most GPS devices |

**Structure:**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Routista">
  <trk>
    <name>Routista Route</name>
    <trkseg>
      <trkpt lat="51.505" lon="-0.09"></trkpt>
      <!-- ... more points ... -->
    </trkseg>
  </trk>
</gpx>
```

### Future Formats (Planned)

| Format | Extension | Use Case |
|--------|-----------|----------|
| KML | `.kml` | Google Earth, Google Maps |
| TCX | `.tcx` | Garmin Connect, training apps |

## Download Behavior

### Filename Format

```
routista-route-{timestamp}.gpx
```

Example: `routista-route-2025-01-15.gpx`

### Download Process

1. **Click Download** button on result page
2. **Generate GPX** from GeoJSON route data
3. **Create Blob** with proper MIME type
4. **Trigger download** via temporary `<a>` element
5. **Cleanup** revokes blob URL

## Using Downloaded Routes

### Strava
1. Open Strava web → Dashboard
2. Click "+" → "Upload activity"
3. Drag GPX file or "Choose Files"
4. Route appears as planned route

### Garmin Connect
1. Open Garmin Connect web
2. Training → Courses → Import
3. Upload GPX file
4. Sync to device

### Komoot
1. Open Komoot web or app
2. Plan → Import GPX
3. Route loads for editing/navigation

### Wahoo ELEMNT
1. Sync via Wahoo app
2. Or upload to Wahoo Cloud
3. Appears in Routes list

### Generic GPS Device
1. Connect device to computer
2. Copy GPX to device's GPX folder
3. Load route on device

## Implementation

### Key Files

| File | Purpose |
|------|---------|
| `src/lib/gpxGenerator.ts` | GPX XML generation, download trigger |
| `src/components/ResultMap.tsx` | Download button integration |

### API

```typescript
// Generate GPX string from route
function generateGPX(geoJson: FeatureCollection): string

// Trigger browser download
function downloadGPX(
    gpxContent: string, 
    filename?: string  // Default: "route.gpx"
): void
```

### Usage Example

```typescript
import { generateGPX, downloadGPX } from "@/lib/gpxGenerator";

// routeData is GeoJSON FeatureCollection from route generation
const gpxContent = generateGPX(routeData);
downloadGPX(gpxContent, "my-heart-route.gpx");
```

## GPX Compliance

The generated GPX files follow the [GPX 1.1 specification](https://www.topografix.com/gpx.asp):

- **Valid XML** with proper encoding declaration
- **Namespace** declared correctly
- **Track segment** (`<trkseg>`) contains all waypoints
- **Coordinates** in decimal degrees (WGS84)
- **Tested** with major GPS apps and devices

## Error Handling

| Error | Cause | Resolution |
|-------|-------|------------|
| Empty GPX | No route data | Ensure route generation completed |
| Download blocked | Browser popup blocker | Allow popups for site |
| File corrupt | Encoding issue | Check browser compatibility |

## Translations

Keys in `messages/*.json`:

```json
{
  "ResultMap": {
    "download": "Download GPX",
    "downloadSuccess": "Route downloaded!",
    "downloadError": "Download failed"
  }
}
```

