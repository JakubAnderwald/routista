# Social Sharing Feature

Generate branded images of your GPS art routes for social media sharing.

## Overview

Users can share their generated routes as branded images optimized for different social media platforms. The feature supports:

- **Instagram Stories** (1080×1920, 9:16 aspect ratio)
- **Facebook** (1200×630, 1.91:1 aspect ratio)
- **Twitter** (1200×675, 16:9 aspect ratio)

## User Flow

### Mobile
1. Click "Share" button on result page
2. Select platform (Instagram, Facebook, Twitter)
3. Tap "Share" → Opens native share sheet with generated image

### Desktop
1. Click "Share" button on result page
2. Select platform
3. Either:
   - **Copy Image** → Paste directly into social media
   - **Download** → Save file locally
   - **Open [Platform]** → Quick link to platform's share page

## Image Contents

Generated images include:
- **Map with route** - Full route overlay on map tiles
- **Routista branding** - Logo, URL, QR code
- **Route stats** - Distance, transportation mode (localized)
- **"Generated with" tagline** - Localized

### Instagram Layout (Full-bleed)
- Map fills entire canvas
- Gradient overlay at top (blue) with logo + QR
- Gradient overlay at bottom (dark) with stats

### Facebook/Twitter Layout (Banner)
- Blue header banner with logo + QR
- Map in center
- Dark footer banner with stats

## Implementation

### Key Files

| File | Purpose |
|------|---------|
| `src/lib/shareImageGenerator.ts` | Core image generation, QR codes, canvas drawing |
| `src/components/ShareModal.tsx` | UI modal, platform selection, action buttons |
| `src/components/ResultMap.tsx` | Exposes `getMap()` ref for map capture |

### Dependencies

- `qrcode` - QR code generation
- `leaflet-image` - Captures map tiles to canvas

### How Map Capture Works

1. `leaflet-image` captures base map tiles to canvas
2. Route coordinates extracted from GeoJSON
3. Route manually drawn on canvas (leaflet-image doesn't capture vector layers)
4. Branding overlays added via Canvas API

## Tracking Success (Vercel Analytics)

### Incoming Traffic from Shares

Vercel Analytics automatically tracks referrers. When users scan QR codes or click shared links, look for:

- **Referrer**: `t.co` (Twitter), `facebook.com`, `instagram.com`, `l.instagram.com`
- **URL pattern**: Traffic to `routista.eu` from social platforms

### How to View

1. Go to [Vercel Analytics Dashboard](https://vercel.com/jakubanderwalds-projects/routista/analytics)
2. Check **Top Referrers** section
3. Filter by date range to see sharing impact

### Limitations (Hobby Plan)

- No custom events (can't track share button clicks server-side)
- Referrer tracking is automatic and sufficient for measuring share success
- Console logs (`[ShareModal]`, `[ShareImageGenerator]`) available for debugging

## Translations

All UI text is localized. Keys in `messages/*.json`:

```json
{
  "ShareModal": {
    "title": "Share your route",
    "subtitle": "...",
    "platforms": {
      "instagram": "Instagram",
      "instagramDesc": "Stories (9:16)",
      ...
    },
    "modes": {
      "foot-walking": "Walking",
      "cycling-regular": "Cycling",
      "driving-car": "Driving"
    },
    "generatedWith": "Generated with Routista",
    "copyImage": "Copy Image",
    "download": "Download",
    ...
  }
}
```

## Testing

### Manual Testing Checklist

- [ ] Share button visible on result page
- [ ] Modal opens with platform options
- [ ] Image generates without errors (check console)
- [ ] Route visible in generated image
- [ ] Copy to clipboard works (desktop)
- [ ] Download works
- [ ] Native share works (mobile)
- [ ] Platform quick-links open correct URLs
- [ ] All text localized (test non-English locale)

### Debug Logs

Enable console to see:
```
[ShareModal] Starting image generation for instagram
[ShareImageGenerator] Generating instagram image (1080x1920)
[ShareImageGenerator] Capturing map to canvas...
[ShareImageGenerator] Map tiles captured, drawing route...
[ShareImageGenerator] Route drawn with 847 points
[ShareImageGenerator] Map captured successfully
[ShareImageGenerator] Image generated successfully
[ShareModal] Image generated successfully
```

