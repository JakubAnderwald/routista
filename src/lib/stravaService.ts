/**
 * Strava Integration Service
 * 
 * Handles OAuth token management and Strava API interactions.
 * Tokens are stored in localStorage for persistence across sessions.
 */

// ============================================================================
// Types
// ============================================================================

export interface StravaTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number; // Unix timestamp in seconds
  athlete?: {
    id: number;
    firstname: string;
    lastname: string;
  };
}

export interface StravaRouteResponse {
  id: number;
  name: string;
  description: string;
  athlete: { id: number };
  distance: number;
  elevation_gain: number;
  map: {
    id: string;
    polyline: string;
    summary_polyline: string;
  };
  starred: boolean;
  private: boolean;
  created_at: string;
  updated_at: string;
  id_str: string;
}

// ============================================================================
// Constants
// ============================================================================

const STORAGE_KEY = 'routista_strava_tokens';
const STRAVA_AUTH_URL = 'https://www.strava.com/oauth/authorize';
const STRAVA_TOKEN_URL = 'https://www.strava.com/oauth/token';

// Required scopes for route creation
const REQUIRED_SCOPES = 'read,activity:write,read_all';

// ============================================================================
// Token Management (Client-side)
// ============================================================================

/**
 * Get stored Strava tokens from localStorage
 */
export function getStoredTokens(): StravaTokens | null {
  if (typeof window === 'undefined') return null;
  
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    
    const tokens = JSON.parse(stored) as StravaTokens;
    return tokens;
  } catch (error) {
    console.error('[StravaService] Failed to parse stored tokens:', error);
    return null;
  }
}

/**
 * Store Strava tokens in localStorage
 */
export function storeTokens(tokens: StravaTokens): void {
  if (typeof window === 'undefined') return;
  
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
    console.log('[StravaService] Tokens stored successfully');
  } catch (error) {
    console.error('[StravaService] Failed to store tokens:', error);
  }
}

/**
 * Clear stored Strava tokens (disconnect)
 */
export function clearTokens(): void {
  if (typeof window === 'undefined') return;
  
  try {
    localStorage.removeItem(STORAGE_KEY);
    console.log('[StravaService] Tokens cleared');
  } catch (error) {
    console.error('[StravaService] Failed to clear tokens:', error);
  }
}

/**
 * Check if user is connected to Strava (has valid tokens)
 */
export function isConnected(): boolean {
  const tokens = getStoredTokens();
  return tokens !== null;
}

/**
 * Check if stored tokens are expired
 */
export function isTokenExpired(): boolean {
  const tokens = getStoredTokens();
  if (!tokens) return true;
  
  // Add 60 second buffer before expiry
  const now = Math.floor(Date.now() / 1000);
  return tokens.expires_at <= now + 60;
}

// ============================================================================
// OAuth Flow Helpers (Client-side)
// ============================================================================

/**
 * Build the Strava OAuth authorization URL
 */
export function buildOAuthUrl(): string {
  const clientId = process.env.NEXT_PUBLIC_STRAVA_CLIENT_ID;
  const redirectUri = process.env.NEXT_PUBLIC_STRAVA_REDIRECT_URI;
  
  if (!clientId) {
    console.error('[StravaService] NEXT_PUBLIC_STRAVA_CLIENT_ID not configured');
    throw new Error('Strava client ID not configured');
  }
  
  if (!redirectUri) {
    console.error('[StravaService] NEXT_PUBLIC_STRAVA_REDIRECT_URI not configured');
    throw new Error('Strava redirect URI not configured');
  }
  
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: REQUIRED_SCOPES,
    approval_prompt: 'auto', // Only prompt if not already authorized
  });
  
  return `${STRAVA_AUTH_URL}?${params.toString()}`;
}

// ============================================================================
// Token Exchange (Server-side helpers)
// ============================================================================

/**
 * Exchange authorization code for tokens (call from server-side only)
 */
export async function exchangeCodeForTokens(
  code: string,
  clientId: string,
  clientSecret: string
): Promise<StravaTokens> {
  console.log('[StravaService] Exchanging code for tokens...');
  
  const response = await fetch(STRAVA_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code: code,
      grant_type: 'authorization_code',
    }),
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('[StravaService] Token exchange failed:', response.status, errorText);
    throw new Error(`Token exchange failed: ${response.status}`);
  }
  
  const data = await response.json();
  // #region agent log
  const now = Math.floor(Date.now() / 1000);
  console.log('[DEBUG] Token exchange response from Strava', { 
    expires_at: data.expires_at, 
    now,
    expiresInSeconds: data.expires_at - now,
    hasAccessToken: !!data.access_token,
    hasRefreshToken: !!data.refresh_token,
    athleteId: data.athlete?.id
  });
  // #endregion
  console.log('[StravaService] Token exchange successful');
  
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at,
    athlete: data.athlete,
  };
}

/**
 * Refresh expired tokens (call from server-side only)
 */
export async function refreshTokens(
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<StravaTokens> {
  console.log('[StravaService] Refreshing tokens...');
  
  const response = await fetch(STRAVA_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    // #region agent log
    console.error('[DEBUG] Strava token refresh API failed', { status: response.status, errorText, clientId });
    // #endregion
    console.error('[StravaService] Token refresh failed:', response.status, errorText);
    throw new Error(`Token refresh failed: ${response.status}`);
  }
  
  const data = await response.json();
  console.log('[StravaService] Token refresh successful');
  
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at,
  };
}

// ============================================================================
// Route Upload Types
// ============================================================================

export type StravaActivityType = 1 | 2; // 1 = ride, 2 = run
export type StravaSubType = 1 | 2 | 3 | 4 | 5; // 1 = road, 2 = mtb, 3 = cx, 4 = trail, 5 = mixed

/**
 * Map Routista transport mode to Strava activity types
 */
export function mapModeToStravaType(mode: string): { type: StravaActivityType; sub_type: StravaSubType } {
  switch (mode) {
    case 'foot-walking':
      return { type: 2, sub_type: 1 }; // Run, road
    case 'cycling-regular':
      return { type: 1, sub_type: 1 }; // Ride, road
    case 'driving-car':
      // Driving doesn't really fit Strava, default to ride
      return { type: 1, sub_type: 1 }; // Ride, road
    default:
      return { type: 2, sub_type: 1 }; // Default to run
  }
}

