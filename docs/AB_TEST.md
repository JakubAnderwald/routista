# UI Variant Configuration

## Overview

Routista supports two UI variants for the route creation wizard, controlled via a feature flag in the configuration.

| Variant | Steps | Description |
|---------|-------|-------------|
| **A** | 4 steps | Upload → Area → Mode → Result (separate screens) |
| **B** | 3 steps | Upload → Area+Mode → Result (combined selection) |

**Default: Variant B** (combined, more streamlined experience)

## Configuration

The UI variant is controlled in `src/config.ts`:

```typescript
export const config: AppConfig = {
    uiVariant: 'B',  // Change to 'A' for separate steps
};
```

## Implementation Files

| File | Purpose |
|------|---------|
| `src/config.ts` | Feature flag configuration |
| `src/components/ABTestProvider.tsx` | React context for variant |
| `src/app/[locale]/create/CreateClient.tsx` | Conditional UI rendering |
| `src/components/AreaSelector.tsx` | Optional mode props for variant B |

## Variant Differences

### Variant A (4 Steps)
- Separate screens for area selection and mode selection
- `ModeSelector` component shows detailed cards with descriptions
- Step flow: `upload → area → mode → result`

### Variant B (3 Steps)
- Combined area and mode selection on single screen
- Mode selector is compact (icon + short label) within AreaSelector
- Route length presets adapt to selected mode
- Step flow: `upload → area → result`

## Using the Variant in Components

```typescript
import { useABVariant } from "@/components/ABTestProvider";

function MyComponent() {
    const variant = useABVariant(); // 'A' or 'B'
    
    if (variant === 'A') {
        // Separate UI flow
    } else {
        // Combined UI flow
    }
}
```

## Getting Variant Outside React

```typescript
import { getCurrentVariant } from "@/components/ABTestProvider";
// or directly from config:
import { getUIVariant } from "@/config";

const variant = getUIVariant(); // 'A' or 'B'
```

## History

This was originally implemented as an A/B test with cookie-based random assignment. The test concluded with Variant B winning, and the system was converted to a feature flag for potential future UI experiments or user preference settings.
