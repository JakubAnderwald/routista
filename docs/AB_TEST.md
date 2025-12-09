# A/B Test: Combined vs Separate UI Steps

## Overview

This document describes the A/B test comparing two UI flows for the route creation wizard.

| Aspect | Details |
|--------|---------|
| **Start Date** | December 2024 |
| **Variants** | A (control) vs B (treatment) |
| **Split** | 50/50 random assignment |
| **Persistence** | Cookie-based, 30 days |
| **Tracking** | Vercel Analytics custom events |

## Variants

### Variant A (Control) - 4 Steps
```
Upload → Area → Mode → Result
```
- Separate screens for area selection and mode selection
- Original UI flow
- Mode selector shows detailed cards with descriptions

### Variant B (Treatment) - 3 Steps
```
Upload → Area & Mode → Result
```
- Combined area and mode selection on single screen
- Mode selector is compact (icon + short label)
- Route length presets adapt to selected mode

## Implementation Files

| File | Purpose |
|------|---------|
| `middleware.ts` | Cookie assignment (50/50 split) |
| `src/components/ABTestProvider.tsx` | React context + tracking |
| `src/app/[locale]/layout.tsx` | Provider wrapper |
| `src/app/[locale]/create/CreateClient.tsx` | Conditional UI rendering |
| `src/components/AreaSelector.tsx` | Optional mode props for variant A |
| `messages/*.json` | Translations for both variants |

## Cookie Details

```
Name: routista-ab-variant
Values: "A" or "B"
Max-Age: 30 days
Path: /
SameSite: lax
```

## Tracked Events

### 1. `ab_variant_assigned`
- **When**: Page load (once per session)
- **Properties**: `{ variant: 'A' | 'B' }`

### 2. `route_generated`
- **When**: Successful route generation
- **Properties**: `{ variant, mode, routeLength, accuracy }`

### 3. `gpx_downloaded`
- **When**: User downloads GPX file
- **Properties**: `{ variant, mode }`

## Analyzing Results

### Vercel Analytics Dashboard
1. Go to **Analytics → Custom Events**
2. Filter by event name (`route_generated`, `gpx_downloaded`)
3. Group by `variant` property

### Key Metrics to Compare

| Metric | Formula |
|--------|---------|
| **Conversion Rate** | `route_generated / ab_variant_assigned` per variant |
| **Download Rate** | `gpx_downloaded / route_generated` per variant |
| **Completion Rate** | `gpx_downloaded / ab_variant_assigned` per variant |

### Statistical Significance
- Minimum recommended: 1000+ events per variant
- Use chi-squared test or proportion z-test
- Target p-value: < 0.05

## Code Reference

### Reading Variant in Components

```typescript
import { useABVariant } from "@/components/ABTestProvider";

function MyComponent() {
    const variant = useABVariant(); // 'A' or 'B'
    
    if (variant === 'A') {
        // Old UI
    } else {
        // New UI
    }
}
```

### Tracking Custom Events

```typescript
import { trackWithVariant } from "@/components/ABTestProvider";

// Automatically includes variant in properties
trackWithVariant('my_event', { customProp: 'value' });
```

## Ending the Test

When concluding the A/B test:

1. **Analyze results** in Vercel Analytics
2. **Choose winner** based on metrics
3. **Remove losing variant code**:
   - Update `CreateClient.tsx` to use winning flow only
   - Remove `ABTestProvider` if not needed for future tests
   - Clean up unused translations
4. **Remove cookie assignment** from `middleware.ts`
5. **Update this document** with results and decision

## Rollback

To disable A/B test and show only variant B (new UI):

1. In `src/components/ABTestProvider.tsx`, change:
   ```typescript
   // Force variant B
   const variant = useSyncExternalStore(
       subscribe,
       () => 'B' as ABVariant,
       () => 'B' as ABVariant
   );
   ```

2. Or remove ABTestProvider entirely and hardcode variant B logic.
