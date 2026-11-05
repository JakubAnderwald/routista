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

/** Loads the Sentry config for the runtime Next.js is starting (Node.js server or edge). */
export async function register() {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        await import('../sentry.server.config');
    }

    if (process.env.NEXT_RUNTIME === 'edge') {
        await import('../sentry.edge.config');
    }
}

/** Reports errors Next.js catches while rendering or handling a request, with the route. */
export const onRequestError = async (
    err: Error,
    request: Request,
    context: { routerKind: string; routePath: string; routeType: string; renderSource: string }
) => {
    const Sentry = await import('@sentry/nextjs');
    Sentry.captureException(err, {
        extra: {
            routerKind: context.routerKind,
            routePath: context.routePath,
            routeType: context.routeType,
            renderSource: context.renderSource,
        },
    });
};
