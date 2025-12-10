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

## Tracking Method

**URL Parameter Approach** (works on Vercel Hobby plan)

The variant is appended to the URL as a query parameter:
```
/en/create?ab=A  →  Variant A (control)
/en/create?ab=B  →  Variant B (treatment)
```

This is tracked automatically by Vercel Analytics as part of page views.

> **Note**: Custom events (`track()`) require Vercel Pro plan. We use URL parameters instead.

## Analyzing Results

### Vercel Analytics Dashboard

1. Go to **Analytics** tab
2. Click on **Page** filter
3. Compare page views:
   - Filter for `/en/create?ab=A` → Variant A visitors
   - Filter for `/en/create?ab=B` → Variant B visitors

### Key Metrics to Compare

| Metric | How to Measure |
|--------|----------------|
| **Visitors per Variant** | Filter Page by `?ab=A` vs `?ab=B` |
| **Bounce Rate** | Compare bounce rates for each variant |
| **Pages per Session** | Indicates engagement depth |

### Statistical Significance
- Minimum recommended: 500+ page views per variant
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

### Getting Variant Outside React

```typescript
import { getCurrentVariant } from "@/components/ABTestProvider";

const variant = getCurrentVariant(); // 'A' or 'B'
```

### How URL Tracking Works

The `ABTestProvider` automatically appends `?ab=A` or `?ab=B` to the URL on page load using `history.replaceState()`. This:
- Doesn't cause a page reload
- Doesn't add to browser history
- Gets tracked by Vercel Analytics as part of the page path

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
