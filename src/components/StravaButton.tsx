"use client";

import { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { FeatureCollection } from 'geojson';
import { generateGPX, downloadGPX } from '@/lib/gpxGenerator';
import { APP_CONFIG } from '@/config';

// ============================================================================
// Types
// ============================================================================

type ButtonState = 'ready' | 'processing' | 'error';

interface StravaButtonProps {
  readonly routeData: FeatureCollection | null;
  readonly className?: string;
}

// Strava route import page URL
const STRAVA_IMPORT_URL = 'https://www.strava.com/routes/new';

// ============================================================================
// Component
// ============================================================================

/**
 * StravaButton - Export to Strava via manual import
 * 
 * Since Strava doesn't provide a public API for route creation,
 * this button provides a streamlined manual import experience:
 * 1. Downloads the GPX file
 * 2. Opens Strava's route import page in a new tab
 * 3. Shows a brief instruction message
 */
export function StravaButton({ routeData, className = '' }: StravaButtonProps) {
  const t = useTranslations('StravaButton');
  
  const [state, setState] = useState<ButtonState>('ready');
  const [showInstruction, setShowInstruction] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup timeout on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // Dismiss instruction tooltip
  const handleDismissInstruction = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setShowInstruction(false);
  }, []);

  // Handle export button click
  const handleExport = useCallback(() => {
    if (!routeData) {
      console.error('[StravaButton] No route data available');
      return;
    }

    console.log('[StravaButton] Starting export to Strava...');
    setState('processing');
    setErrorMessage(null);

    try {
      // Generate and download GPX
      const gpx = generateGPX(routeData);
      downloadGPX(gpx, 'routista-route.gpx');
      console.log('[StravaButton] GPX file downloaded');

      // Open Strava import page in new tab
      window.open(STRAVA_IMPORT_URL, '_blank', 'noopener,noreferrer');
      console.log('[StravaButton] Opened Strava import page');

      // Show instruction message
      setShowInstruction(true);
      setState('ready');

      // Hide instruction after 8 seconds
      timeoutRef.current = setTimeout(() => {
        setShowInstruction(false);
      }, 8000);

    } catch (error) {
      console.error('[StravaButton] Export failed:', error);
      setErrorMessage(t('exportError'));
      setState('error');
    }
  }, [routeData, t]);

  // Retry after error
  const handleRetry = useCallback(() => {
    setErrorMessage(null);
    setState('ready');
  }, []);

  // Feature toggle - hide button if disabled
  if (!APP_CONFIG.stravaEnabled) {
    return null;
  }

  // Strava brand orange color
  const stravaOrange = '#FC4C02';

  const baseButtonStyles = `
    inline-flex items-center justify-center gap-2 
    px-4 py-2 rounded-lg font-medium text-sm
    transition-all duration-200
    disabled:opacity-50 disabled:cursor-not-allowed
    ${className}
  `;

  // Error state - Show retry button
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
          {t('retry')}
        </button>
        {errorMessage && (
          <span
            className="text-xs text-red-500 dark:text-red-400"
            role="alert"
          >
            {errorMessage}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={handleExport}
        disabled={!routeData || state === 'processing'}
        className={baseButtonStyles}
        style={{
          backgroundColor: stravaOrange,
          color: 'white',
          opacity: state === 'processing' ? 0.8 : 1,
        }}
        data-testid="strava-export-button"
      >
        {state === 'processing' ? (
          <>
            <Spinner />
            {t('exporting')}
          </>
        ) : (
          <>
            <StravaIcon />
            {t('exportToStrava')}
          </>
        )}
      </button>

      {/* Instruction tooltip with accessibility attributes */}
      {showInstruction && (
        <div
          className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-4 py-3 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-sm rounded-lg shadow-lg z-50 animate-fade-in"
          role="status"
          aria-live="polite"
          data-testid="strava-instruction"
        >
          <div className="flex items-center gap-2">
            <CheckIcon />
            <span>{t('importInstruction')}</span>
            <button
              onClick={handleDismissInstruction}
              className="ml-2 p-1 rounded hover:bg-gray-700 dark:hover:bg-gray-300 transition-colors"
              aria-label={t('dismissInstruction')}
              data-testid="strava-instruction-dismiss"
            >
              <CloseIcon />
            </button>
          </div>
          {/* Arrow pointing up */}
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 border-8 border-transparent border-b-gray-900 dark:border-b-gray-100" />
        </div>
      )}
    </div>
  );
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

function CloseIcon() {
  return (
    <svg
      className="w-3 h-3"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export default StravaButton;
