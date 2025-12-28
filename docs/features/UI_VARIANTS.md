# UI Variants

Configuration for the route creation wizard UI flow.

## Overview

Routista supports two UI variants for the create wizard, controlled via a feature flag. This allows testing different user experiences or adapting to user preferences.

## Variants

| Variant | Steps | Flow |
|---------|-------|------|
| **A** | 4 steps | Upload → Area → Mode → Result |
| **B** | 3 steps | Upload → Area+Mode → Result |

**Current Default: Variant B** (combined, more streamlined)

## Variant Comparison

### Variant A (4 Steps)

```
┌─────────┐   ┌──────────┐   ┌──────────┐   ┌────────┐
│ Upload  │ → │   Area   │ → │   Mode   │ → │ Result │
│  Image  │   │ Selection│   │ Selection│   │  Map   │
└─────────┘   └──────────┘   └──────────┘   └────────┘
```

- **Separate screens** for each decision
- **ModeSelector** component shows full cards with descriptions
- **More explanatory** for first-time users
- **More clicks** to complete flow

### Variant B (3 Steps)

```
┌─────────┐   ┌────────────────┐   ┌────────┐
│ Upload  │ → │ Area + Mode    │ → │ Result │
│  Image  │   │ (Combined)     │   │  Map   │
└─────────┘   └────────────────┘   └────────┘
```

- **Combined** area and mode on one screen
- **Compact mode selector** (icons + short labels) below map
- **Faster** flow with fewer clicks
- **Mode-aware presets** adjust radius when mode changes

## Configuration

Set the variant in `src/config.ts`:

```typescript
export const APP_CONFIG: AppConfig = {
    uiVariant: 'B',  // Change to 'A' for separate steps
};
```

## Implementation

### Key Files

| File | Purpose |
|------|---------|
| `src/config.ts` | Feature flag definition |
| `src/components/ABTestProvider.tsx` | React context provider |
| `src/app/[locale]/create/CreateClient.tsx` | Conditional step logic |
| `src/components/AreaSelector.tsx` | Optional mode props for Variant B |
| `src/components/ModeSelector.tsx` | Full-page selector for Variant A |

### Reading Variant in Components

```typescript
import { useABVariant } from "@/components/ABTestProvider";

function MyComponent() {
    const variant = useABVariant();  // 'A' or 'B'
    
    if (variant === 'A') {
        // Separate steps UI
    } else {
        // Combined UI (default)
    }
}
```

### Reading Variant Outside React

```typescript
import { getUIVariant } from "@/config";

const variant = getUIVariant();  // 'A' or 'B'
```

### AreaSelector Mode Props

In Variant B, AreaSelector receives mode props to show the compact selector:

```typescript
// Variant B - mode props provided
<AreaSelector
    mode={mode}
    onModeChange={setMode}
    onAreaSelect={handleAreaSelect}
/>

// Variant A - mode props omitted (selector hidden)
<AreaSelector
    onAreaSelect={handleAreaSelect}
/>
```

## History

Originally implemented as a cookie-based A/B test with random 50/50 assignment. After testing, Variant B showed higher completion rates and was selected as the default. The system was converted to a feature flag for potential future experiments or user preference settings.

## Potential Future Uses

- **User preference**: Let users choose their preferred flow
- **New experiments**: Test other UI variations
- **Accessibility**: Offer simpler flow for certain users
- **Mobile vs Desktop**: Different defaults per device type

