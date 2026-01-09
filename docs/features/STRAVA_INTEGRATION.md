# Strava Integration

Export generated routes to Strava via a streamlined manual import experience.

## Overview

Since Strava doesn't provide a public API for route creation, Routista uses a manual import approach that:
1. Downloads the GPX file automatically
2. Opens Strava's route import page in a new tab
3. Shows a brief instruction message to guide the user

This provides a seamless experience while working within Strava's API limitations.

## User Flow

1. **Generate Route** - Complete the normal Routista workflow
2. **Click "Export to Strava"** - Downloads GPX and opens Strava's import page
3. **Import on Strava** - Upload the downloaded GPX file on Strava's page
4. **Done!** - Route is now in your Strava library

## Button States

| State | Appearance | Action |
|-------|-----------|--------|
| Ready | "Export to Strava" (orange) | Downloads GPX + Opens Strava |
| Processing | Spinner + "Exporting..." | Brief processing state |

After export, an instruction tooltip appears for 8 seconds confirming the GPX was downloaded and guiding the user to import it on Strava.

## Technical Implementation

### Files

| File | Purpose |
|------|---------|
| `src/components/StravaButton.tsx` | Export button with GPX download + Strava redirect |
| `src/lib/gpxGenerator.ts` | GPX generation and download utilities |

### Export Flow

```text
User clicks "Export to Strava"
         ↓
Generate GPX from route data
         ↓
Download GPX file (routista-route.gpx)
         ↓
Open https://www.strava.com/routes/new in new tab
         ↓
Show instruction tooltip
```

### Feature Toggle

The Strava button is controlled by `APP_CONFIG.stravaEnabled` in `src/config.ts`:

```typescript
// src/config.ts
export const APP_CONFIG: AppConfig = {
    uiVariant: 'B',
    stravaEnabled: true, // Enabled: Uses manual import flow
} as const;
```

## Why Manual Import?

In January 2026, we contacted Strava to request access to their Routes API for programmatic route creation. Their response confirmed that **no public endpoint exists for creating routes**:

> "Unfortunately we cannot provide access to a routes creation endpoint at this time."
> — Strava API Team

The available Routes API endpoints are read-only:
- Export Route GPX (GET)
- Export Route TCX (GET)
- Get Route (GET)
- List Athlete Routes (GET)

See [Strava API Routes Documentation](https://developers.strava.com/docs/reference/#api-Routes) for details.

## Historical Context

The original implementation attempted to use OAuth and a `POST /api/v3/routes` endpoint, which:
- Required full OAuth 2.0 flow with token management
- Attempted to call an undocumented/partner-only endpoint
- Failed with 401 Authorization errors for all users

The current manual import approach:
- Requires no OAuth or API keys
- Works for all users immediately
- Leverages Strava's existing web-based route import feature
- Provides a simple, reliable user experience

## Future Considerations

If Strava ever opens a public route creation API, the implementation could be updated to:
1. Re-enable OAuth flow
2. Push routes directly via API
3. Provide instant "View on Strava" links after upload

For now, the manual import flow provides the best user experience given API limitations.
