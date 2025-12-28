# Strava Integration

Push generated routes directly to Strava, eliminating the need to download GPX and manually import.

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
| `NEXT_PUBLIC_STRAVA_ENABLED` | Client | Feature toggle - set to `true` when Strava grants production API access |

## Feature Toggle

The Strava button is controlled by `NEXT_PUBLIC_STRAVA_ENABLED`. Set to `true` when Strava approves production API access for route creation. Currently pending approval (see Troubleshooting below).

## Strava API Limits

- 100 requests per 15 minutes
- 1000 requests per day per app
- Route creation limited to 25 waypoints (auto-simplified)

## Troubleshooting

### "Please reconnect to Strava"
Token expired and refresh failed. User needs to re-authorize.

### Route creation fails with "Authorization Error"
Strava's Routes API (`POST /routes`) requires **production API access**. New apps are in testing mode with limited functionality. To fix:
1. Email developers@strava.com requesting production access
2. Include your Client ID and app description
3. Once approved, set `NEXT_PUBLIC_STRAVA_ENABLED=true` in Vercel

Error from Strava: `{"message":"Authorization Error","errors":[{"resource":"Application","field":"internal","code":"invalid"}]}`

### Route creation fails (other)
Strava's route API has strict requirements. Common issues:
- Route must have at least 2 waypoints
- Waypoints must be valid lat/lng coordinates
- API rate limits may apply

### Popup blocked
If OAuth popup is blocked, the code falls back to redirect flow.

## Future Enhancements

- Remember connection across sessions (already implemented via localStorage)
- Custom route naming
- Pre-set privacy settings
- Show route on Strava's embedded map after upload

