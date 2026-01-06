'use client';

import posthog from 'posthog-js';
import { PostHogProvider as PHProvider, usePostHog } from 'posthog-js/react';
import { useEffect, Suspense } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

/** Module-scoped flag to prevent double initialization in React Strict Mode */
let posthogInitialized = false;

/**
 * PostHog analytics provider for Next.js App Router.
 * Handles initialization and automatic pageview tracking.
 * Uses a module-scoped flag to ensure idempotent initialization.
 */
export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (posthogInitialized) {
      return;
    }

    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key) {
      console.warn('[PostHog] NEXT_PUBLIC_POSTHOG_KEY not set, analytics disabled');
      return;
    }

    posthog.init(key, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://eu.i.posthog.com',
      person_profiles: 'identified_only',
      capture_pageview: false, // We capture manually for App Router SPA navigation
      capture_pageleave: true,
    });

    posthogInitialized = true;
    console.log('[PostHog] Initialized');
  }, []);

  return (
    <PHProvider client={posthog}>
      <Suspense fallback={null}>
        <PostHogPageviewTracker />
      </Suspense>
      {children}
    </PHProvider>
  );
}

/**
 * Tracks pageviews on route changes for App Router.
 * Must be wrapped in Suspense due to useSearchParams().
 */
function PostHogPageviewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const posthogClient = usePostHog();

  useEffect(() => {
    if (pathname && posthogClient) {
      let url = window.origin + pathname;
      const search = searchParams?.toString();
      if (search) {
        url += '?' + search;
      }
      posthogClient.capture('$pageview', { $current_url: url });
    }
  }, [pathname, searchParams, posthogClient]);

  return null;
}

