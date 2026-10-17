import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Each config calls Sentry.init at import time; capture the options it passes.
const { init } = vi.hoisted(() => ({ init: vi.fn() }));

vi.mock('@sentry/nextjs', () => ({
    init,
    replayIntegration: vi.fn(),
    captureRouterTransitionStart: vi.fn(),
}));

const CONFIGS = [
    ['client', () => import('../../instrumentation-client')],
    ['server', () => import('../../sentry.server.config')],
    ['edge', () => import('../../sentry.edge.config')],
] as const;

describe.each(CONFIGS)('%s Sentry config', (_name, load) => {
    beforeEach(() => {
        vi.resetModules();
        init.mockClear();
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    // Local dev must stay out of the Free-plan quota; Vercel deployments must keep reporting.
    it.each([
        [undefined, 'development', false],
        ['development', 'development', false],
        ['preview', 'preview', true],
        ['production', 'production', true],
    ])('NEXT_PUBLIC_VERCEL_ENV=%s → environment %s, enabled %s', async (vercelEnv, environment, enabled) => {
        vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', vercelEnv);

        await load();

        expect(init).toHaveBeenCalledTimes(1);
        expect(init).toHaveBeenCalledWith(expect.objectContaining({ environment, enabled }));
    });
});
