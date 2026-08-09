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

Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

    // Production, preview and local dev all report into the same Sentry project, so tag
    // every event with its origin. Without this they arrive indistinguishable and a
    // preview-only error looks like a production incident. Vercel injects
    // NEXT_PUBLIC_VERCEL_ENV as production/preview/development; it is absent off-Vercel,
    // where the only thing running is local dev.
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? 'development',

    // Adjust this value in production, or use tracesSampler for greater control
    tracesSampleRate: 1,

    // Setting this option to true will print useful information to the console while you're setting up Sentry.
    debug: false,

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
