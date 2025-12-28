# Transport Modes Feature

Choose how you'll navigate your shape route: walking, cycling, or driving.

## Overview

The transport mode determines which roads/paths are used for routing and affects the route length presets.

## Available Modes

| Mode ID | Label | Icon | Road Types |
|---------|-------|------|------------|
| `foot-walking` | Walking | 🚶 | Sidewalks, pedestrian paths, trails |
| `cycling-regular` | Cycling | 🚴 | Bike lanes, bike paths, quiet roads |
| `driving-car` | Driving | 🚗 | Car-accessible roads, respects one-way |

## Mode-Specific Behavior

### Walking (`foot-walking`)
- Prioritizes pedestrian infrastructure
- Can use footpaths, trails, stairs
- Shortest distances for shape matching
- Tightest route tolerance (most accurate)

### Cycling (`cycling-regular`)
- Prefers cycling infrastructure
- Avoids highways and motorways
- Medium distances
- Medium route tolerance

### Driving (`driving-car`)
- Only uses car-accessible roads
- Respects one-way restrictions
- Longest distances
- Loosest route tolerance

## Simplification Tolerances

Routes are simplified before API calls to reduce load. Tolerance varies by mode:

| Mode | Tolerance (degrees) | Approx Distance |
|------|---------------------|-----------------|
| `foot-walking` | 0.00005° | ~4-6 meters |
| `cycling-regular` | 0.0001° | ~7-11 meters |
| `driving-car` | 0.0004° | ~30-45 meters |

## Route Length Presets

Each mode has appropriate distance presets:

```typescript
const MODE_PRESETS = {
    "foot-walking": [
        { id: "short", radius: 500, desc: "~2km" },
        { id: "medium", radius: 1000, desc: "~4km" },
        { id: "long", radius: 2000, desc: "~8km" },
    ],
    "cycling-regular": [
        { id: "short", radius: 1500, desc: "~6km" },
        { id: "medium", radius: 3000, desc: "~12km" },
        { id: "long", radius: 5000, desc: "~20km" },
    ],
    "driving-car": [
        { id: "short", radius: 5000, desc: "~20km" },
        { id: "medium", radius: 10000, desc: "~40km" },
        { id: "long", radius: 20000, desc: "~80km" },
    ],
};
```

## UI Presentation

### Variant A (Separate Step)
- Full-page mode selector with cards
- Icon, label, and description for each mode
- Selected state with ring highlight
- Component: `ModeSelector.tsx`

### Variant B (Combined)
- Compact mode buttons in AreaSelector
- Icon + short label only
- Appears below the map
- Integrated in `AreaSelector.tsx`

See `docs/features/UI_VARIANTS.md` for variant details.

## Implementation

### Key Files

| File | Purpose |
|------|---------|
| `src/components/ModeSelector.tsx` | Full-page mode cards (Variant A) |
| `src/components/AreaSelector.tsx` | Compact mode buttons (Variant B) |
| `src/config/routing.ts` | Mode presets, tolerances |
| `src/lib/radarService.ts` | Mode passed to Radar API |

### Type Definition

```typescript
type TransportMode = "foot-walking" | "cycling-regular" | "driving-car";
```

Exported from `src/config/routing.ts` and re-exported from `src/config.ts`.

## Translations

Keys in `messages/*.json`:

```json
{
  "ModeSelector": {
    "walking": "Walking",
    "walkingDesc": "Sidewalks, paths, and pedestrian routes",
    "cycling": "Cycling", 
    "cyclingDesc": "Bike lanes, paths, and bike-friendly roads",
    "driving": "Driving",
    "drivingDesc": "Car-accessible roads and streets"
  },
  "AreaSelector": {
    "foot-walking": "Walk",
    "cycling-regular": "Cycle",
    "driving-car": "Drive"
  }
}
```

