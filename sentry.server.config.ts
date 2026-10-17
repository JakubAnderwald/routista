// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

// See instrumentation-client.ts — one project, events separated by environment tag.
const environment = process.env.NEXT_PUBLIC_VERCEL_ENV ?? 'development';

Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

    environment,

    // See instrumentation-client.ts — local dev stays out of the Free-plan quota.
    enabled: environment !== 'development',

    // Adjust this value in production, or use tracesSampler for greater control
    tracesSampleRate: 1,

    // Setting this option to true will print useful information to the console while you're setting up Sentry.
    debug: false,

    // Uncomment the line below to enable Spotlight (https://spotlightjs.com)
    // spotlight: process.env.NODE_ENV === 'development',
});
