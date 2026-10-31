import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Client, Event } from '@sentry/core';

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

// Browser-extension noise (ROUTISTA-5). Run the client's options through the SDK's own
// filter rather than testing the regexes alone, so the test fails if they stop matching
// the way the SDK actually matches events.
describe('client Sentry config: browser-extension filters', () => {
    type ClientOptions = Parameters<typeof import('@sentry/core').eventFiltersIntegration>[0];

    let shouldDrop: (event: Event) => boolean;

    beforeEach(async () => {
        vi.resetModules();
        init.mockClear();
        vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', 'production');

        await import('../../instrumentation-client');
        const options = init.mock.calls[0][0] as ClientOptions;

        // The real filter, not the mocked @sentry/nextjs. It is the module @sentry/nextjs
        // uses internally.
        const { eventFiltersIntegration } = await vi.importActual<typeof import('@sentry/core')>('@sentry/core');
        const filter = eventFiltersIntegration();
        const client = { getOptions: () => options } as unknown as Client;
        shouldDrop = (event) => filter.processEvent!(event, {}, client) === null;
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    const exception = (value: string, frames?: { filename: string }[], type = 'Error'): Event => ({
        exception: {
            values: [{
                type,
                value,
                mechanism: { type: 'auto.browser.global_handlers.onunhandledrejection', handled: false },
                ...(frames && { stacktrace: { frames } }),
            }],
        },
    });

    it('drops the stackless Safari runtime.sendMessage rejection (ROUTISTA-5)', () => {
        expect(shouldDrop(exception('Invalid call to runtime.sendMessage(). Tab not found.'))).toBe(true);
    });

    it('drops other Safari extension runtime calls', () => {
        expect(shouldDrop(exception('Invalid call to runtime.connect(). Tab not found.'))).toBe(true);
    });

    it.each([
        'safari-web-extension://3F2504E0-4F89-11D3/content.js',
        'safari-extension://com.example.ext-ABC123/script.js',
        'webkit-masked-url://hidden/',
        'chrome-extension://abcdefghijklmnop/content.js',
        'moz-extension://1234-5678/content.js',
    ])('drops an error thrown from extension script %s', (filename) => {
        const frames = [{ filename: 'https://www.routista.eu/_next/static/chunks/main.js' }, { filename }];
        expect(shouldDrop(exception('Cannot read properties of null', frames, 'TypeError'))).toBe(true);
    });

    it('keeps errors thrown from our own bundle', () => {
        const frames = [{ filename: 'https://www.routista.eu/_next/static/chunks/app.js' }];
        expect(shouldDrop(exception("undefined is not an object (evaluating 'route.coordinates')", frames, 'TypeError'))).toBe(false);
    });

    it('keeps an app error that merely mentions an extension URL in its message', () => {
        const frames = [{ filename: 'https://www.routista.eu/_next/static/chunks/app.js' }];
        expect(shouldDrop(exception('Failed to load safari-web-extension://x/icon.png', frames))).toBe(false);
    });
});
