'use client';

import { createContext, useContext } from 'react';
import { getUIVariant, type UIVariant } from '@/config';

// Re-export the type with the original name for backward compatibility
export type ABVariant = UIVariant;

const UIVariantContext = createContext<UIVariant>('B');

/**
 * Provider component that supplies the UI variant to the component tree.
 * The variant is determined by the config file.
 */
export function ABTestProvider({ children }: { children: React.ReactNode }) {
    const variant = getUIVariant();
    
    return (
        <UIVariantContext.Provider value={variant}>
            {children}
        </UIVariantContext.Provider>
    );
}

/**
 * Hook to get the current UI variant
 * - Variant A: Old UI (4 steps - separate Area and Mode)
 * - Variant B: New UI (3 steps - combined Area & Mode)
 */
export function useABVariant(): UIVariant {
    return useContext(UIVariantContext);
}

/**
 * Get current variant (for use outside React components)
 */
export function getCurrentVariant(): UIVariant {
    return getUIVariant();
}
