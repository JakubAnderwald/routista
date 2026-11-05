import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync } from 'node:fs';
import path from 'node:path';

const { serverConfigLoaded, edgeConfigLoaded, captureRequestError } = vi.hoisted(() => ({
    serverConfigLoaded: vi.fn(),
    edgeConfigLoaded: vi.fn(),
    captureRequestError: vi.fn(),
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
vi.mock('@sentry/nextjs', () => ({ captureRequestError }));

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
    // The SDK's handler, not a hand-rolled captureException: it also keeps the Vercel
    // function alive until the event is flushed, and skips Next.js control-flow errors.
    it("is the SDK's captureRequestError", async () => {
        const { onRequestError } = await import('../../src/instrumentation');

        expect(onRequestError).toBe(captureRequestError);
    });
});
