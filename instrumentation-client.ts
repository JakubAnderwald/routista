// This file configures the initialization of Sentry on the client.
// The config you add here will be used whenever a user loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/
//
// It MUST be named `instrumentation-client.ts`. This project builds with Turbopack, and
// the Turbopack path in @sentry/nextjs only injects `instrumentation-client.*` — it never
// looks for the older `sentry.client.config.ts`, which webpack builds still honour. While
// the config lived in that file the browser SDK was never initialized at all, so no
// client-side error or replay ever reached Sentry.

import * as Sentry from "@sentry/nextjs";

// Production and preview report into the same Sentry project, so tag every event with
// its origin. Without this they arrive indistinguishable and a preview-only error looks
// like a production incident. Vercel injects NEXT_PUBLIC_VERCEL_ENV as
// production/preview/development; it is absent off-Vercel, where the only thing running
// is local dev.
const environment = process.env.NEXT_PUBLIC_VERCEL_ENV ?? 'development';

/**
 * Messages thrown by browser extension runtimes, matched against the event message.
 * These usually reach us as unhandled promise rejections with no stack, which
 * `denyUrls` can't judge, so they have to be matched by message.
 */
const EXTENSION_ERROR_MESSAGES: RegExp[] = [
    // Safari's Web Extension bridge rejects `browser.runtime.*` calls from a content script
    // when it can't resolve the tab, e.g. "Invalid call to runtime.sendMessage(). Tab not
    // found." (Sentry ROUTISTA-5, WebKit bug 246620).
    /Invalid call to runtime\.\w+\(\)/,
];

/**
 * Script URLs of browser extensions, matched against the top stack frame. Covers
 * extension errors that do carry a stack. Safari hides extension script URLs behind
 * `webkit-masked-url://hidden/`.
 */
const EXTENSION_SCRIPT_URLS: RegExp[] = [
    /^(?:chrome|moz|safari(?:-web)?)-extension:\/\//,
    /^webkit-masked-url:/,
];

Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

    environment,

    // Local dev stays silent: the org is on Sentry's Free plan, where local events and
    // replays count against the same monthly quota as real traffic.
    enabled: environment !== 'development',

    // Adjust this value in production, or use tracesSampler for greater control
    tracesSampleRate: 1,

    // Setting this option to true will print useful information to the console while you're setting up Sentry.
    debug: false,

    // Browser-extension noise. Content scripts run inside our page, so their failures reach
    // the SDK's global handlers and arrive looking like ours. Routista never calls extension
    // APIs, so none of this is actionable, and each event (plus the replay it triggers)
    // spends Free-plan quota. Dropping it here also stops that replay being recorded.
    ignoreErrors: EXTENSION_ERROR_MESSAGES,
    denyUrls: EXTENSION_SCRIPT_URLS,

    replaysOnErrorSampleRate: 1.0,

    // This sets the sample rate to be 10%. You may want this to be 100% while
    // in development and sample at a lower rate in production
    replaysSessionSampleRate: 0.1,

    // You can remove this option if you're not planning to use the Sentry Session Replay feature:
    integrations: [
        Sentry.replayIntegration({
            // Additional Replay configuration goes in here, for example:
            maskAllText: true,
            blockAllMedia: true,
        }),
    ],
});

// Required for App Router navigation tracing; without it client-side route changes are
// not instrumented.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
