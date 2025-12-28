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
     * Set to true when Strava grants production API access for route creation.
     * Currently pending approval - the Routes API requires special app permissions.
     * 
     * When false: Strava button is hidden
     * When true: Strava button is shown, users can push routes to Strava
     */
    stravaEnabled: boolean;
}

export const APP_CONFIG: AppConfig = {
    uiVariant: 'B',
    stravaEnabled: false, // Pending Strava API approval
} as const;

/**
 * Get the current UI variant setting
 */
export function getUIVariant(): UIVariant {
    return APP_CONFIG.uiVariant;
}
