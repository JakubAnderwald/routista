import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        testTimeout: 60000,
        // Limit concurrent tests to avoid Radar API rate limiting
        maxConcurrency: 2,
    },
});
