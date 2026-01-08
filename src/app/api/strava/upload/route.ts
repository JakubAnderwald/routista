/**
 * Strava Route Upload Handler
 * 
 * This endpoint accepts a GeoJSON route and uploads it to Strava.
 * Requires valid Strava access tokens passed in the request body.
 * 
 * NOTE: Route creation requires Strava API production access.
 * Currently pending approval from Strava.
 */

import { NextRequest, NextResponse } from 'next/server';
import { 
  refreshTokens, 
  mapModeToStravaType,
  type StravaTokens,
  type StravaRouteResponse 
} from '@/lib/stravaService';
import { FeatureCollection, LineString } from 'geojson';

// ============================================================================
// Types
// ============================================================================

interface UploadRequest {
  routeData: FeatureCollection;
  tokens: StravaTokens;
  mode: string;
  name?: string;
  description?: string;
}

// ============================================================================
// Route Handler
// ============================================================================

export async function POST(request: NextRequest) {
  console.log('[Strava Upload] Received upload request');

  let body: UploadRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    );
  }

  const { routeData, tokens, mode, name, description } = body;

  // Validate request
  if (!routeData || !tokens || !mode) {
    return NextResponse.json(
      { error: 'Missing required fields: routeData, tokens, mode' },
      { status: 400 }
    );
  }

  if (!tokens.access_token || !tokens.refresh_token) {
    return NextResponse.json(
      { error: 'Invalid tokens' },
      { status: 400 }
    );
  }

  // Check if tokens need refresh
  let currentTokens = tokens;
  const now = Math.floor(Date.now() / 1000);

  // #region agent log
  console.log('[DEBUG] Token check', { expiresAt: tokens.expires_at, now, needsRefresh: tokens.expires_at <= now + 60 });
  // #endregion

  if (tokens.expires_at <= now + 60) {
    console.log('[Strava Upload] Tokens expired, refreshing...');
    
    const clientId = process.env.STRAVA_CLIENT_ID;
    const clientSecret = process.env.STRAVA_CLIENT_SECRET;

    // #region agent log
    console.log('[DEBUG] Refresh config', { hasClientId: !!clientId, hasClientSecret: !!clientSecret });
    // #endregion

    if (!clientId || !clientSecret) {
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    try {
      currentTokens = await refreshTokens(tokens.refresh_token, clientId, clientSecret);
      // #region agent log
      console.log('[DEBUG] Token refresh succeeded', { newExpiresAt: currentTokens.expires_at });
      // #endregion
    } catch (error) {
      // #region agent log
      console.error('[DEBUG] Token refresh failed', error);
      // #endregion
      console.error('[Strava Upload] Token refresh failed:', error);
      return NextResponse.json(
        { error: 'Token refresh failed. Please reconnect to Strava.', needsReauth: true },
        { status: 401 }
      );
    }
  }

  // Extract coordinates from GeoJSON
  const coordinates = extractCoordinates(routeData);
  if (coordinates.length < 2) {
    return NextResponse.json(
      { error: 'Route must have at least 2 points' },
      { status: 400 }
    );
  }

  // Map mode to Strava type
  const { type, sub_type } = mapModeToStravaType(mode);

  // Build route name
  const routeName = name || `Routista Route - ${new Date().toLocaleDateString()}`;
  const routeDescription = description || 'Generated with Routista (routista.eu)';

  try {
    // Upload to Strava
    const stravaRoute = await createStravaRoute(
      currentTokens.access_token,
      routeName,
      routeDescription,
      type,
      sub_type,
      coordinates
    );

    console.log('[Strava Upload] Route created successfully:', stravaRoute.id);

    // Return success with route URL and updated tokens
    return NextResponse.json({
      success: true,
      routeId: stravaRoute.id,
      routeUrl: `https://www.strava.com/routes/${stravaRoute.id}`,
      tokens: currentTokens !== tokens ? currentTokens : undefined, // Only return if refreshed
    });

  } catch (error) {
    console.error('[Strava Upload] Upload failed:', error);
    const message = error instanceof Error ? error.message : 'Upload failed';

    // Check for auth errors
    if (message.includes('401') || message.includes('unauthorized') || message.includes('Authorization Error')) {
      return NextResponse.json(
        { error: 'Authorization failed. Please reconnect to Strava.', needsReauth: true },
        { status: 401 }
      );
    }
    
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract coordinates from GeoJSON FeatureCollection
 */
function extractCoordinates(geoJson: FeatureCollection): [number, number][] {
  const coordinates: [number, number][] = [];
  
  for (const feature of geoJson.features) {
    if (feature.geometry.type === 'LineString') {
      const lineString = feature.geometry as LineString;
      for (const coord of lineString.coordinates) {
        // GeoJSON is [lng, lat], keep as is for Strava
        coordinates.push([coord[0], coord[1]]);
      }
    }
  }
  
  return coordinates;
}

/**
 * Create a route on Strava using their API
 */
async function createStravaRoute(
  accessToken: string,
  name: string,
  description: string,
  type: number,
  subType: number,
  coordinates: [number, number][]
): Promise<StravaRouteResponse> {
  console.log(`[Strava Upload] Creating route "${name}" with ${coordinates.length} points`);

  // Strava expects coordinates as an array of [lat, lng] pairs
  // But their waypoints format wants lat/lng objects
  // For routes API, we use the segments approach with waypoints
  
  // Simplify to waypoints (Strava limits to 25 waypoints for route creation)
  const waypoints = simplifyToWaypoints(coordinates, 25);
  
  const response = await fetch('https://www.strava.com/api/v3/routes', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name,
      description,
      type,
      sub_type: subType,
      private: false,
      starred: false,
      waypoints: waypoints.map(([lng, lat]) => ({
        lat,
        lng,
      })),
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    // #region agent log
    console.error('[DEBUG] Strava Route API failed', { status: response.status, errorText });
    // #endregion
    console.error('[Strava Upload] API error:', response.status, errorText);
    throw new Error(`Strava API error: ${response.status} - ${errorText}`);
  }

  return response.json();
}

/**
 * Simplify coordinates to N waypoints using uniform sampling
 */
function simplifyToWaypoints(
  coordinates: [number, number][],
  maxWaypoints: number
): [number, number][] {
  if (coordinates.length <= maxWaypoints) {
    return coordinates;
  }

  const result: [number, number][] = [];
  const step = (coordinates.length - 1) / (maxWaypoints - 1);

  for (let i = 0; i < maxWaypoints; i++) {
    const index = Math.round(i * step);
    result.push(coordinates[index]);
  }

  return result;
}
