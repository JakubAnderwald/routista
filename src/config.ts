/**
 * Application configuration
 * 
 * This file serves as the main entry point for all configuration.
 * It re-exports domain-specific configs from src/config/ folder.
 */

// Re-export all config modules
export * from './config/routing';
export * from './config/image';
export * from './config/api';
export * from './config/geo';

// App-level configuration

export type UIVariant = 'A' | 'B';

interface AppConfig {
    /**
     * UI Variant for the route creation wizard:
     * - 'A': 4 steps (Upload → Area → Mode → Result) - separate screens
     * - 'B': 3 steps (Upload → Area+Mode → Result) - combined area and mode selection
     * 
     * Default: 'B' (combined UI, more streamlined experience)
     */
    uiVariant: UIVariant;

    /**
     * Strava integration feature toggle.
     * 
     * When false: Strava button is hidden
     * When true: Strava button is shown, users can push routes to Strava
     * 
     * Routista's approved rate limits (Jan 2026) - higher than defaults:
     * - Overall: 600 requests/15min, 6,000/day
     * - Read: 300 requests/15min, 3,000/day
     * - Athlete Capacity: 999
     */
    stravaEnabled: boolean;
}

export const APP_CONFIG: AppConfig = {
    uiVariant: 'B',
    stravaEnabled: true, // Strava API access approved Jan 2026
} as const;

/**
 * Get the current UI variant setting
 */
export function getUIVariant(): UIVariant {
    return APP_CONFIG.uiVariant;
}
