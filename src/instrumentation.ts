// Server and edge Sentry initialization, plus request error capture.
//
// This file MUST stay in src/, next to src/app. Next.js only looks for `instrumentation` in
// the directory that holds the app dir. While it sat at the repo root, `next start` still
// happened to load it, but `next build` never listed it in required-server-files.json, so
// Vercel's server functions shipped without it. Loading a missing instrumentation module
// fails silently, so register() never ran and no server-side error reached Sentry.
// `@sentry/nextjs` 11 warns about the root location at build time ("Could not find an
// instrumentation file next to your src/app directory").
// tests/unit/instrumentation.test.ts guards the location.

import * as Sentry from '@sentry/nextjs';

/** Loads the Sentry config for the runtime Next.js is starting (Node.js server or edge). */
export async function register() {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        await import('../sentry.server.config');
    }

    if (process.env.NEXT_RUNTIME === 'edge') {
        await import('../sentry.edge.config');
    }
}

/**
 * Reports errors Next.js catches while rendering or handling a request. The SDK's handler,
 * rather than a hand-rolled captureException: it skips Next.js prerender control-flow errors
 * (dynamic-usage and client-side-rendering bail-outs), records the route in the `nextjs` context and the request
 * headers under the `dataCollection` policy, and keeps the function alive until the event is
 * sent (`waitUntil` + flush). Without that, a Vercel function can be suspended first and the
 * event is lost.
 */
export const onRequestError = Sentry.captureRequestError;
