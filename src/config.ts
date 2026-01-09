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
     * When true: Strava button is shown, users can export routes to Strava
     * 
     * Note: Uses manual import flow since Strava doesn't provide a public
     * route creation API. The button downloads GPX and opens Strava's
     * route import page (https://www.strava.com/routes/new).
     */
    stravaEnabled: boolean;
}

export const APP_CONFIG: AppConfig = {
    uiVariant: 'B',
    stravaEnabled: true, // Enabled: Uses manual import flow (GPX download + Strava route import page)
} as const;

/**
 * Get the current UI variant setting
 */
export function getUIVariant(): UIVariant {
    return APP_CONFIG.uiVariant;
}
