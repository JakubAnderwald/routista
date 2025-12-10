'use client';

import { createContext, useContext, useEffect, useRef, useSyncExternalStore } from 'react';

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
    
    const hasUpdatedUrlRef = useRef(false);

    useEffect(() => {
        // Add variant to URL for Vercel Analytics tracking (works on Hobby plan)
        // This allows filtering by page: /en/create?ab=A vs /en/create?ab=B
        if (!hasUpdatedUrlRef.current && variant && typeof window !== 'undefined') {
            const url = new URL(window.location.href);
            const currentAB = url.searchParams.get('ab');
            
            // Only update if not already set or different
            if (currentAB !== variant) {
                url.searchParams.set('ab', variant);
                // Use replaceState to avoid adding to browser history
                window.history.replaceState({}, '', url.toString());
            }
            hasUpdatedUrlRef.current = true;
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
 * Helper to get current variant (for logging or external analytics)
 * Note: Custom event tracking requires Vercel Pro plan.
 * On Hobby plan, we track via URL parameter (?ab=A or ?ab=B) instead.
 */
export function getCurrentVariant(): ABVariant {
    if (typeof document === 'undefined') return 'B';
    const cookieMatch = document.cookie.match(new RegExp(`${AB_COOKIE_NAME}=([AB])`));
    return (cookieMatch?.[1] as ABVariant) || 'B';
}
