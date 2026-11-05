import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync } from 'node:fs';
import path from 'node:path';

const { serverConfigLoaded, edgeConfigLoaded, captureException } = vi.hoisted(() => ({
    serverConfigLoaded: vi.fn(),
    edgeConfigLoaded: vi.fn(),
    captureException: vi.fn(),
}));

// Each config calls Sentry.init when imported; record the import instead.
vi.mock('../../sentry.server.config', () => {
    serverConfigLoaded();
    return {};
});
vi.mock('../../sentry.edge.config', () => {
    edgeConfigLoaded();
    return {};
});
vi.mock('@sentry/nextjs', () => ({ captureException }));

const REPO_ROOT = path.resolve(__dirname, '../..');

describe('instrumentation location', () => {
    // Next.js looks for `instrumentation` only next to the app dir. With the app in src/app,
    // a root-level file still loads under `next start` but is left out of the deployed server
    // functions, and the missing module fails silently: no server-side Sentry at all.
    it('sits in src/, next to src/app', () => {
        expect(existsSync(path.join(REPO_ROOT, 'src/app'))).toBe(true);
        expect(existsSync(path.join(REPO_ROOT, 'src/instrumentation.ts'))).toBe(true);
    });

    it('has no copy at the repo root', () => {
        expect(existsSync(path.join(REPO_ROOT, 'instrumentation.ts'))).toBe(false);
        expect(existsSync(path.join(REPO_ROOT, 'instrumentation.js'))).toBe(false);
    });
});

describe('register', () => {
    beforeEach(() => {
        vi.resetModules();
        serverConfigLoaded.mockClear();
        edgeConfigLoaded.mockClear();
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('loads the server config in the Node.js runtime', async () => {
        vi.stubEnv('NEXT_RUNTIME', 'nodejs');
        const { register } = await import('../../src/instrumentation');

        await register();

        expect(serverConfigLoaded).toHaveBeenCalledTimes(1);
        expect(edgeConfigLoaded).not.toHaveBeenCalled();
    });

    it('loads the edge config in the edge runtime', async () => {
        vi.stubEnv('NEXT_RUNTIME', 'edge');
        const { register } = await import('../../src/instrumentation');

        await register();

        expect(edgeConfigLoaded).toHaveBeenCalledTimes(1);
        expect(serverConfigLoaded).not.toHaveBeenCalled();
    });
});

describe('onRequestError', () => {
    it('captures the error with the route context', async () => {
        const { onRequestError } = await import('../../src/instrumentation');
        const err = new Error('boom');
        const context = {
            routerKind: 'App Router',
            routePath: '/api/radar/directions',
            routeType: 'route',
            renderSource: 'react-server-components',
        };

        await onRequestError(err, new Request('https://www.routista.eu/api/radar/directions'), context);

        expect(captureException).toHaveBeenCalledWith(err, { extra: context });
    });
});
