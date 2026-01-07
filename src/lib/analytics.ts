/**
 * Type-safe PostHog analytics wrapper for Routista.
 * 
 * Provides:
 * - Typed event names and properties
 * - Localhost protection to avoid polluting production data
 * - Latency measurement helpers
 * 
 * @see https://posthog.com/docs/product-analytics/capture-events
 */

import posthog from 'posthog-js';
import type { TransportMode } from '@/config';

// ============================================================================
// Event Types
// ============================================================================

/**
 * Shape source indicates how the user provided the shape
 */
export type ShapeSource = 'upload' | 'example' | 'draw';

/**
 * Social platform for share events
 */
export type SharePlatform = 'instagram' | 'facebook' | 'twitter';

/**
 * Share action type
 */
export type ShareAction = 'copy' | 'download' | 'native_share';

/**
 * All analytics event types with their properties
 */
export interface AnalyticsEvents {
  // Wizard funnel events
  wizard_started: Record<string, never>;
  shape_selected: {
    source: ShapeSource;
    point_count: number;
  };
  area_selected: {
    radius_meters: number;
    transport_mode: TransportMode;
  };

  // Algorithm events
  generation_request: {
    point_count: number;
    radius_meters: number;
    transport_mode: TransportMode;
  };
  generation_result: {
    status: 'success' | 'error';
    latency_ms: number;
    route_length_km?: number;
    accuracy_percent?: number;
    error_message?: string;
  };

  // Conversion events
  gpx_exported: {
    route_length_km: number;
    accuracy_percent: number;
    transport_mode: TransportMode;
  };
  social_share: {
    platform: SharePlatform;
    action: ShareAction;
  };
  support_click: {
    location: 'home' | 'about';
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if we're running on localhost.
 * We skip analytics on localhost to avoid polluting production data.
 * Handles IPv4 (127.0.0.1), IPv6 (::1), and hostname (localhost).
 * Also returns true for SSR environments.
 */
function isLocalhost(): boolean {
  if (typeof window === 'undefined') return true;
  const hostname = window.location.hostname;
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

// ============================================================================
// Analytics API
// ============================================================================

/**
 * Track an analytics event with type-safe properties.
 * 
 * PostHog automatically queues events if not yet initialized,
 * so we don't need to check readiness before capturing.
 * 
 * @param event - Event name (must be a key of AnalyticsEvents)
 * @param properties - Event properties (typed per event)
 * 
 * @example
 * ```ts
 * track('wizard_started', {});
 * track('shape_selected', { source: 'upload', point_count: 150 });
 * track('generation_result', { status: 'success', latency_ms: 1234, ... });
 * ```
 */
export function track<E extends keyof AnalyticsEvents>(
  event: E,
  properties: AnalyticsEvents[E]
): void {
  // Skip on localhost
  if (isLocalhost()) {
    console.log(`[Analytics] Skipped (localhost): ${event}`, properties);
    return;
  }

  // PostHog queues events internally if not yet initialized
  // No need to check readiness - just capture
  console.log(`[Analytics] ${event}`, properties);
  posthog.capture(event, properties);
}

/**
 * Start timing an operation for latency measurement.
 * Returns a function that, when called, returns the elapsed time in milliseconds.
 * 
 * @example
 * ```ts
 * const getLatency = startTiming();
 * // ... do work ...
 * const latency_ms = getLatency();
 * track('generation_result', { status: 'success', latency_ms, ... });
 * ```
 */
export function startTiming(): () => number {
  const start = performance.now();
  return () => Math.round(performance.now() - start);
}
