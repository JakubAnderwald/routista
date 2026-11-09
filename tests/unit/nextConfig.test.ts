import { describe, it, expect, vi } from 'vitest';
import type { NextConfig } from 'next';

// Both wrappers pass the config through, so the test sees what next.config.ts sets itself.
vi.mock('@sentry/nextjs/config', () => ({ withSentryConfig: (config: NextConfig) => config }));
vi.mock('next-intl/plugin', () => ({ default: () => (config: NextConfig) => config }));

describe('next.config', () => {
    // Minified server function names are what Sentry shows in server stack frames, and they
    // change between builds, splitting one error into a new issue after a deploy.
    it('keeps server code unminified so Sentry frames carry real function names', async () => {
        const { default: config } = await import('../../next.config');

        expect(config.experimental?.turbopackMinify).toEqual({ server: false });
        // The same for a webpack build.
        expect(config.experimental?.serverMinification).toBe(false);
    });
});
