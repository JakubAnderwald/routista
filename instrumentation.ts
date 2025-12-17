export async function register() {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        await import('./sentry.server.config');
    }

    if (process.env.NEXT_RUNTIME === 'edge') {
        await import('./sentry.edge.config');
    }
}

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
