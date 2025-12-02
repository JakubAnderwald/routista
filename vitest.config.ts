import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        // Run tests sequentially to avoid Radar API rate limiting
        fileParallelism: false,
        // Keep individual test timeouts
        testTimeout: 60000,
    },
});
