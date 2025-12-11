/**
 * Application configuration
 * 
 * This file contains feature flags and configuration options for Routista.
 * Modify these values to change application behavior.
 */

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
}

export const config: AppConfig = {
    uiVariant: 'B',
};

/**
 * Get the current UI variant setting
 */
export function getUIVariant(): UIVariant {
    return config.uiVariant;
}
