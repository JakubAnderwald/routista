# Strava Integration

Push generated routes directly to Strava, eliminating the need to download GPX and manually import.

> ⚠️ **STATUS: Disabled (Jan 2026)**  
> Feature is currently disabled pending Routes API write access from Strava.  
> Standard API approval (rate limits) does not include route creation permission.  
> See [Issue #22](https://github.com/JakubAnderwald/routista/issues/22) for tracking.

## Overview

Users can connect their Strava account and upload routes with a single click. The integration uses OAuth 2.0 for secure authorization and the Strava Routes API for uploads.

## User Flow

1. **Generate Route** - Complete the normal Routista workflow
2. **Connect Strava** (first time only) - Click "Connect Strava" button, authorize in popup
3. **Push to Strava** - Click "Push to Strava" to upload
4. **View on Strava** - Success shows link to the route on Strava

## Button States

| State | Appearance | Action |
|-------|-----------|--------|
| Disconnected | "Connect Strava" (orange) | Opens OAuth popup |
| Connecting | Spinner + "Connecting..." | Waiting for OAuth |
| Connected | "Push to Strava" (orange) | Upload route |
| Uploading | Spinner + "Uploading..." | API call in progress |
| Success | "View on Strava" (green) ✓ | Opens Strava route |
| Error | "Failed - Retry" (red) | Retry upload |

## Technical Implementation

### Files

| File | Purpose |
|------|---------|
| `src/lib/stravaService.ts` | Token management, OAuth helpers, API types |
| `src/app/api/strava/callback/route.ts` | OAuth code exchange, token handling |
| `src/app/api/strava/upload/route.ts` | Route upload to Strava API |
| `src/components/StravaButton.tsx` | UI component with state management |

### OAuth Flow

```
User → StravaButton → Popup Window → Strava OAuth
                                          ↓
Strava → /api/strava/callback → Exchange Code → Tokens
                                          ↓
Callback Page → postMessage → StravaButton → localStorage
```

### Token Storage

Tokens are stored in `localStorage` under key `routista_strava_tokens`:
- `access_token` - For API calls
- `refresh_token` - For refreshing expired tokens
- `expires_at` - Unix timestamp of expiration

Tokens are automatically refreshed when expired during upload.

### Mode Mapping

| Routista Mode | Strava Type | Strava Sub-Type |
|---------------|-------------|-----------------|
| foot-walking | Run (2) | Road (1) |
| cycling-regular | Ride (1) | Road (1) |
| driving-car | Ride (1) | Road (1) |

## Environment Variables

| Variable | Location | Description |
|----------|----------|-------------|
| `STRAVA_CLIENT_ID` | Server | Strava app client ID |
| `STRAVA_CLIENT_SECRET` | Server | Strava app client secret |
| `NEXT_PUBLIC_STRAVA_CLIENT_ID` | Client | Same as above, for OAuth URL |
| `NEXT_PUBLIC_STRAVA_REDIRECT_URI` | Client | OAuth callback URL |

## Feature Toggle

The Strava button is controlled by `APP_CONFIG.stravaEnabled` in `src/config.ts`. 

```typescript
// src/config.ts
export const APP_CONFIG: AppConfig = {
    uiVariant: 'B',
    stravaEnabled: false, // Disabled: awaiting Routes API write access from Strava
} as const;
```

### Why is it disabled?

Strava's Routes API (`POST /api/v3/routes`) requires **special application-level permission** beyond standard API access. The Jan 2026 approval only covered rate limits and athlete capacity. Routes API write access was requested separately.

## Strava API Limits (Routista App-Specific, Approved Jan 2026)

These are Routista's approved limits from Strava (higher than default API limits):

- **Overall Rate Limit**: 600 requests every 15 min, up to 6,000 requests per day
- **Read Rate Limit**: 300 requests every 15 min, up to 3,000 requests per day
- **Athlete Capacity**: 999 connected athletes
- Route creation limited to 25 waypoints (auto-simplified)

> Note: Default Strava API limits are 200/15min and 2,000/day. Routista has elevated limits.

## Troubleshooting

### "Please reconnect to Strava"
Token expired and refresh failed. User needs to re-authorize.

### Route creation fails with 401
**Most likely cause:** App lacks Routes API permission.  
Error: `{"message":"Authorization Error","field":"internal","code":"invalid"}`

This is an **app-level** issue, not a user token issue. Strava must grant Routes API write access.

### Route creation fails (other)
Strava's route API has strict requirements. Common issues:
- Route must have at least 2 waypoints
- Waypoints must be valid lat/lng coordinates
- API rate limits may apply

### Popup blocked
If OAuth popup is blocked, the code falls back to redirect flow.

## Debug Instrumentation

> ⚠️ **Tech Debt:** Debug logs are currently in place. See [Issue #44](https://github.com/JakubAnderwald/routista/issues/44).

Files with `[DEBUG]` logging:
- `src/components/StravaButton.tsx` - client-side console.logs
- `src/lib/stravaService.ts` - token exchange logging  
- `src/app/api/strava/upload/route.ts` - server-side logging

Remove after Routes API is approved and verified working.

## Future Enhancements

- Remember connection across sessions (already implemented via localStorage)
- Custom route naming
- Pre-set privacy settings
- Show route on Strava's embedded map after upload

