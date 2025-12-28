"use client";

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { FeatureCollection } from 'geojson';
import {
  getStoredTokens,
  storeTokens,
  clearTokens,
  isConnected,
  buildOAuthUrl,
} from '@/lib/stravaService';

// ============================================================================
// Types
// ============================================================================

type ButtonState = 
  | 'disconnected'    // Not connected to Strava
  | 'connecting'      // OAuth popup open, waiting for auth
  | 'connected'       // Connected, ready to upload
  | 'uploading'       // Upload in progress
  | 'success'         // Upload successful
  | 'error';          // Upload or auth failed

interface StravaButtonProps {
  routeData: FeatureCollection | null;
  mode: string;
  className?: string;
}

// ============================================================================
// Component
// ============================================================================

// Initialize state based on connection status (avoids useEffect setState)
function getInitialState(): ButtonState {
  if (typeof window !== 'undefined' && isConnected()) {
    return 'connected';
  }
  return 'disconnected';
}

export function StravaButton({ routeData, mode, className = '' }: StravaButtonProps) {
  const t = useTranslations('StravaButton');
  
  const [state, setState] = useState<ButtonState>(getInitialState);
  const [stravaUrl, setStravaUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Re-check connection on client hydration
  useEffect(() => {
    // Only update if we're in disconnected state but actually connected
    // This handles SSR hydration mismatch
    if (state === 'disconnected' && isConnected()) {
      setState('connected');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Listen for OAuth callback messages
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Only accept messages from same origin
      if (event.origin !== window.location.origin) return;
      
      const data = event.data;
      
      if (data.type === 'STRAVA_AUTH_SUCCESS') {
        console.log('[StravaButton] Received auth success');
        storeTokens(data.tokens);
        setState('connected');
      } else if (data.type === 'STRAVA_AUTH_ERROR') {
        console.error('[StravaButton] Received auth error:', data.error);
        setErrorMessage(data.description || 'Authorization failed');
        setState('error');
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Handle connect button click
  const handleConnect = useCallback(() => {
    try {
      const authUrl = buildOAuthUrl();
      
      // Open OAuth popup
      const width = 600;
      const height = 700;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;
      
      const popup = window.open(
        authUrl,
        'strava-auth',
        `width=${width},height=${height},left=${left},top=${top},popup=yes`
      );
      
      if (popup) {
        setState('connecting');
        
        // Poll for popup close (in case user closes without completing)
        const pollTimer = setInterval(() => {
          if (popup.closed) {
            clearInterval(pollTimer);
            // If still connecting, user closed without completing
            if (state === 'connecting') {
              setState('disconnected');
            }
          }
        }, 500);
      } else {
        // Popup blocked, fall back to redirect
        window.location.href = authUrl;
      }
    } catch (error) {
      console.error('[StravaButton] Failed to start OAuth:', error);
      setErrorMessage(error instanceof Error ? error.message : 'Failed to connect');
      setState('error');
    }
  }, [state]);

  // Handle upload button click
  const handleUpload = useCallback(async () => {
    if (!routeData) {
      setErrorMessage('No route to upload');
      setState('error');
      return;
    }

    const tokens = getStoredTokens();
    if (!tokens) {
      setState('disconnected');
      return;
    }

    setState('uploading');
    setErrorMessage(null);

    try {
      const response = await fetch('/api/strava/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          routeData,
          tokens,
          mode,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.needsReauth) {
          clearTokens();
          setState('disconnected');
          setErrorMessage('Please reconnect to Strava');
        } else {
          setErrorMessage(data.error || 'Upload failed');
          setState('error');
        }
        return;
      }

      // Update tokens if refreshed
      if (data.tokens) {
        storeTokens(data.tokens);
      }

      setStravaUrl(data.routeUrl);
      setState('success');
      console.log('[StravaButton] Upload successful:', data.routeUrl);

    } catch (error) {
      console.error('[StravaButton] Upload failed:', error);
      setErrorMessage(error instanceof Error ? error.message : 'Upload failed');
      setState('error');
    }
  }, [routeData, mode]);

  // Handle disconnect
  const handleDisconnect = useCallback(() => {
    clearTokens();
    setState('disconnected');
    setStravaUrl(null);
    setErrorMessage(null);
  }, []);

  // Handle retry
  const handleRetry = useCallback(() => {
    setErrorMessage(null);
    if (isConnected()) {
      setState('connected');
    } else {
      setState('disconnected');
    }
  }, []);

  // ============================================================================
  // Render
  // ============================================================================

  // Strava brand orange color
  const stravaOrange = '#FC4C02';

  const baseButtonStyles = `
    inline-flex items-center justify-center gap-2 
    px-4 py-2 rounded-lg font-medium text-sm
    transition-all duration-200
    disabled:opacity-50 disabled:cursor-not-allowed
    ${className}
  `;

  // Disconnected - Show connect button
  if (state === 'disconnected') {
    return (
      <button
        onClick={handleConnect}
        className={baseButtonStyles}
        style={{ 
          backgroundColor: stravaOrange, 
          color: 'white',
        }}
        data-testid="strava-connect-button"
      >
        <StravaIcon />
        {t('connect')}
      </button>
    );
  }

  // Connecting - Show spinner
  if (state === 'connecting') {
    return (
      <button
        disabled
        className={baseButtonStyles}
        style={{ 
          backgroundColor: stravaOrange, 
          color: 'white',
          opacity: 0.8,
        }}
      >
        <Spinner />
        {t('connecting')}
      </button>
    );
  }

  // Connected - Show push button
  if (state === 'connected') {
    return (
      <div className="flex items-center gap-2">
        <button
          onClick={handleUpload}
          disabled={!routeData}
          className={baseButtonStyles}
          style={{ 
            backgroundColor: stravaOrange, 
            color: 'white',
          }}
          data-testid="strava-push-button"
        >
          <StravaIcon />
          {t('push')}
        </button>
        <button
          onClick={handleDisconnect}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xs underline"
          data-testid="strava-disconnect-button"
        >
          {t('disconnect')}
        </button>
      </div>
    );
  }

  // Uploading - Show spinner
  if (state === 'uploading') {
    return (
      <button
        disabled
        className={baseButtonStyles}
        style={{ 
          backgroundColor: stravaOrange, 
          color: 'white',
          opacity: 0.8,
        }}
      >
        <Spinner />
        {t('uploading')}
      </button>
    );
  }

  // Success - Show link to Strava
  if (state === 'success' && stravaUrl) {
    return (
      <a
        href={stravaUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={`${baseButtonStyles} no-underline`}
        style={{ 
          backgroundColor: '#16a34a', // Green
          color: 'white',
        }}
        data-testid="strava-success-link"
      >
        <CheckIcon />
        {t('success')}
        <ExternalLinkIcon />
      </a>
    );
  }

  // Error - Show retry button
  if (state === 'error') {
    return (
      <div className="flex flex-col items-center gap-1">
        <button
          onClick={handleRetry}
          className={baseButtonStyles}
          style={{ 
            backgroundColor: '#ef4444', // Red
            color: 'white',
          }}
          data-testid="strava-retry-button"
        >
          {t('error')}
        </button>
        {errorMessage && (
          <span className="text-xs text-red-500 dark:text-red-400">
            {errorMessage}
          </span>
        )}
      </div>
    );
  }

  return null;
}

// ============================================================================
// Icons
// ============================================================================

function StravaIcon() {
  return (
    <svg 
      viewBox="0 0 24 24" 
      className="w-5 h-5" 
      fill="currentColor"
    >
      <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg 
      className="w-4 h-4 animate-spin" 
      viewBox="0 0 24 24" 
      fill="none"
    >
      <circle 
        className="opacity-25" 
        cx="12" 
        cy="12" 
        r="10" 
        stroke="currentColor" 
        strokeWidth="4"
      />
      <path 
        className="opacity-75" 
        fill="currentColor" 
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg 
      className="w-4 h-4" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function ExternalLinkIcon() {
  return (
    <svg 
      className="w-3 h-3" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2"
    >
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

export default StravaButton;

