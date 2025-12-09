'use client';

import { createContext, useContext, useEffect, useRef, useSyncExternalStore } from 'react';
import { track } from '@vercel/analytics';

export type ABVariant = 'A' | 'B';

const ABContext = createContext<ABVariant>('B');

const AB_COOKIE_NAME = 'routista-ab-variant';

// Read variant from cookie (client-side only)
function getVariantFromCookie(): ABVariant {
    if (typeof document === 'undefined') return 'B';
    const cookieMatch = document.cookie.match(new RegExp(`${AB_COOKIE_NAME}=([AB])`));
    return (cookieMatch?.[1] as ABVariant) || 'B';
}

// Subscribe function for useSyncExternalStore (cookies don't have events, so no-op)
function subscribe() {
    return () => {};
}

export function ABTestProvider({ children }: { children: React.ReactNode }) {
    // Use useSyncExternalStore to safely read cookie value
    const variant = useSyncExternalStore(
        subscribe,
        getVariantFromCookie,
        () => 'B' as ABVariant // Server snapshot
    );
    
    const hasTrackedRef = useRef(false);

    useEffect(() => {
        // Track variant assignment only once per session
        if (!hasTrackedRef.current && variant) {
            track('ab_variant_assigned', { variant });
            hasTrackedRef.current = true;
        }
    }, [variant]);

    return (
        <ABContext.Provider value={variant}>
            {children}
        </ABContext.Provider>
    );
}

/**
 * Hook to get the current A/B test variant
 * - Variant A: Old UI (4 steps - separate Area and Mode)
 * - Variant B: New UI (3 steps - combined Area & Mode)
 */
export function useABVariant(): ABVariant {
    return useContext(ABContext);
}

/**
 * Helper to track events with variant information
 */
export function trackWithVariant(eventName: string, properties: Record<string, unknown> = {}) {
    const cookieMatch = document.cookie.match(new RegExp(`${AB_COOKIE_NAME}=([AB])`));
    const variant = cookieMatch?.[1] || 'B';
    
    track(eventName, { ...properties, variant });
}
