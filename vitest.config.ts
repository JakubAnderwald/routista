import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    test: {
        testTimeout: 60000,
        // Limit concurrent tests to avoid Radar API rate limiting
        maxConcurrency: 2,
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
});
