# Area Selection Feature

Choose the geographic location and size for your shape-based route.

## Overview

Users select where in the world to place their shape by choosing a center point and radius. The shape will be scaled to fit within this area.

## User Flow

1. **Map displays** with default location (London) or user's last selection
2. **Search bar** allows typing a location name (autocomplete via Radar API)
3. **Pan/zoom map** to refine center point
4. **Select radius** via presets or fine-tune slider
5. **Blue circle** visualizes the area where the route will be placed

## Controls

### Location Search

- **Autocomplete**: Live suggestions as user types
- **API**: Radar Places Autocomplete
- **Debounce**: 300ms delay before API call

### Route Length Presets

Presets vary by transport mode (adapts to realistic distances):

#### Walking
| Preset | Radius | Approx Distance |
|--------|--------|-----------------|
| Short | 500m | ~2 km |
| Medium | 1000m | ~4 km |
| Long | 2000m | ~8 km |

#### Cycling
| Preset | Radius | Approx Distance |
|--------|--------|-----------------|
| Short | 1500m | ~6 km |
| Medium | 3000m | ~12 km |
| Long | 5000m | ~20 km |

#### Driving
| Preset | Radius | Approx Distance |
|--------|--------|-----------------|
| Short | 5000m | ~20 km |
| Medium | 10000m | ~40 km |
| Long | 20000m | ~80 km |

### Fine-Tune Slider

- **Range**: 500m – 10,000m
- **Step**: 100m increments
- **Display**: Shows current radius in meters

## Area Constraints

| Constraint | Value | Reason |
|------------|-------|--------|
| Min radius | 500m | Need enough roads for matching |
| Max radius | 10,000m | API limits & processing time |
| Default center | London [51.505, -0.09] | Recognizable default |
| Default radius | 1000m | Good starting size |

## UI Variants

The AreaSelector component supports two UI variants:

### Variant A (4 steps)
- Area selection is a separate step
- Mode is selected on the next screen
- `mode` prop is not provided

### Variant B (3 steps) - Default
- Area + mode combined on one screen
- Mode selector appears below the map
- `mode` and `onModeChange` props provided

See `docs/features/UI_VARIANTS.md` for details.

## Implementation

### Key Files

| File | Purpose |
|------|---------|
| `src/components/AreaSelector.tsx` | Map interface, search, radius controls |
| `src/components/Map.tsx` | Leaflet wrapper (dynamic import for SSR) |
| `src/config/routing.ts` | Mode presets, tolerance values |
| `src/app/api/radar/autocomplete/route.ts` | Search API proxy |

### Component API

```typescript
interface AreaSelectorProps {
    onAreaSelect: (center: [number, number], radius: number) => void;
    initialCenter?: [number, number];
    initialRadius?: number;
    // Optional - when provided, mode selector shown (Variant B)
    mode?: TransportMode | null;
    onModeChange?: (mode: TransportMode) => void;
}
```

### Geo Scaling

When the user proceeds, the normalized shape points (0-1) are scaled to real coordinates:

```typescript
function scalePointsToGeo(
    points: [number, number][],    // Normalized 0-1
    center: [number, number],       // [lat, lng]
    radiusMeters: number
): [number, number][]               // [lat, lng] array
```

## Error Handling

| Error | User Message | Cause |
|-------|--------------|-------|
| Search failed | "Couldn't find location" | Network error or no results |
| Area too small | "Please select a larger area" | Radius < 500m |
| Area too large | "Please select a smaller area" | Radius > 10km |

## Translations

Keys in `messages/*.json`:

```json
{
  "AreaSelector": {
    "transportMode": "Transport Mode",
    "routeLength": "Route Length",
    "fineTune": "Fine-tune",
    "meters": "m",
    "short": "Short",
    "medium": "Medium", 
    "long": "Long",
    "foot-walking": "Walk",
    "cycling-regular": "Cycle",
    "driving-car": "Drive"
  }
}
```

