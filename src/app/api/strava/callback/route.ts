/**
 * Strava OAuth Callback Handler
 * 
 * This endpoint receives the authorization code from Strava after user authorization,
 * exchanges it for access tokens, and returns HTML that:
 * 1. Posts the tokens to the parent window via postMessage
 * 2. Closes the popup
 */

import { NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForTokens } from '@/lib/stravaService';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const error = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');

  console.log('[Strava Callback] Received callback request');

  // Handle OAuth errors
  if (error) {
    console.error('[Strava Callback] OAuth error:', error, errorDescription);
    return createErrorResponse(error, errorDescription || 'Authorization failed');
  }

  // Validate code
  if (!code) {
    console.error('[Strava Callback] No authorization code received');
    return createErrorResponse('missing_code', 'No authorization code received');
  }

  // Get credentials from environment
  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error('[Strava Callback] Missing Strava credentials in environment');
    return createErrorResponse('config_error', 'Server configuration error');
  }

  try {
    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code, clientId, clientSecret);
    console.log('[Strava Callback] Successfully obtained tokens');

    // Return HTML that posts tokens to parent and closes popup
    return createSuccessResponse(tokens);
  } catch (error) {
    console.error('[Strava Callback] Token exchange failed:', error);
    const message = error instanceof Error ? error.message : 'Token exchange failed';
    return createErrorResponse('token_error', message);
  }
}

/**
 * Create HTML response that posts tokens to parent window
 */
function createSuccessResponse(tokens: object): NextResponse {
  const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Strava Connected - Routista</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #FC4C02 0%, #ff6b35 100%);
      color: white;
    }
    .container {
      text-align: center;
      padding: 2rem;
    }
    .checkmark {
      font-size: 4rem;
      margin-bottom: 1rem;
    }
    h1 {
      margin: 0 0 0.5rem 0;
      font-size: 1.5rem;
    }
    p {
      margin: 0;
      opacity: 0.9;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="checkmark">✓</div>
    <h1>Connected to Strava!</h1>
    <p>This window will close automatically...</p>
  </div>
  <script>
    (function() {
      const tokens = ${JSON.stringify(tokens)};
      
      // Post message to parent window
      if (window.opener) {
        window.opener.postMessage({
          type: 'STRAVA_AUTH_SUCCESS',
          tokens: tokens
        }, window.location.origin);
        
        // Close popup after a short delay
        setTimeout(function() {
          window.close();
        }, 1500);
      } else {
        // If no opener (direct navigation), redirect to create page
        setTimeout(function() {
          window.location.href = '/create';
        }, 2000);
      }
    })();
  </script>
</body>
</html>
`;

  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html',
    },
  });
}

/**
 * Create HTML response for errors
 */
function createErrorResponse(error: string, description: string): NextResponse {
  const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Connection Failed - Routista</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
      color: white;
    }
    .container {
      text-align: center;
      padding: 2rem;
      max-width: 400px;
    }
    .icon {
      font-size: 4rem;
      margin-bottom: 1rem;
    }
    h1 {
      margin: 0 0 0.5rem 0;
      font-size: 1.5rem;
    }
    p {
      margin: 0 0 1rem 0;
      opacity: 0.9;
    }
    button {
      background: white;
      color: #dc2626;
      border: none;
      padding: 0.75rem 1.5rem;
      border-radius: 0.5rem;
      font-size: 1rem;
      cursor: pointer;
      font-weight: 500;
    }
    button:hover {
      background: #f3f4f6;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">✕</div>
    <h1>Connection Failed</h1>
    <p>${escapeHtml(description)}</p>
    <button onclick="window.close()">Close</button>
  </div>
  <script>
    (function() {
      // Post error message to parent window
      if (window.opener) {
        window.opener.postMessage({
          type: 'STRAVA_AUTH_ERROR',
          error: '${escapeHtml(error)}',
          description: '${escapeHtml(description)}'
        }, window.location.origin);
      }
    })();
  </script>
</body>
</html>
`;

  return new NextResponse(html, {
    status: 200, // Return 200 so the page renders
    headers: {
      'Content-Type': 'text/html',
    },
  });
}

/**
 * Simple HTML escape for inline content
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

