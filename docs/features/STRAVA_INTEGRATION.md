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

## June 2026 Strava Developer Program Update

On **June 1, 2026**, Strava emailed developers announcing changes to its API and Developer Program. The key takeaway for Routista: **the announcement introduces no route-creation / write endpoint.** The Routes API remains read-only (Export GPX/TCX, Get Route, List Athlete Routes), so the long-standing blocker for direct route push is unchanged — and there are now *additional* barriers.

| Change | Relevance to Routista |
| :--- | :--- |
| **Official Strava MCP** (read your own data, incl. subscriber data) | Read-only — for athletes analyzing their own data. **Not** a route-write/push path. No impact on Routista's "push a planned route" use case. |
| **New tiers** (Standard / Extended Access) + new API Agreement & Policy | Only relevant if Routista ever uses the API. The manual flow uses no API, so it is unaffected today. |
| **Standard Tier requires a paid Strava subscription** (active devs get 3 months free) | A future cost/constraint for any direct-integration attempt. |
| **Intermediary-platform access restricted** | Direct integrations unaffected. Routista's manual flow touches no athlete data — but this rules out any future "route data via a third-party layer" design. |
| **Club + Segments Explore endpoints deprecated** (Sep 1, 2026) | Routista uses none of these. No impact. |
| **2027 technical changes** (Jun 1, 2027) | No code impact today (Routista has no API client), but **prerequisites** for any future integration — see below. |

**Conclusion:** Keep the current manual GPX-import flow. Direct route push remains impossible (tracked in issue #22).

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

If Strava ever opens a public route-creation API, the implementation could be updated to:
1. Re-enable an OAuth flow
2. Push routes directly via API
3. Provide instant "View on Strava" links after upload

Any such future integration **must** be built against the 2027 technical requirements from day one (effective **Jun 1, 2027**):

- **Auth tokens in request headers**, not form/query params.
- **New base URL**: `https://www.strava.com/api/v3` → `https://www.api-v3.strava.com`.
- **`oauth/deauthorize` retired** in favor of `oauth/revoke`.

…and within the new program constraints: a **paid Strava subscription** is required for Standard-Tier developers, and **intermediary-platform access is banned** (no routing route data through a third-party layer).

For now, the manual import flow provides the best user experience given these limitations.
