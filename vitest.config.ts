import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    test: {
        testTimeout: 60000,
        // Limit concurrent tests to avoid Radar API rate limiting
        maxConcurrency: 2,
        coverage: {
            // Use v8 provider (built-in, no extra deps needed)
            provider: 'v8',
            // Generate multiple report formats
            reporter: ['text', 'text-summary', 'html', 'json'],
            // Output directory for coverage reports
            reportsDirectory: './coverage',
            // Include only source files
            include: ['src/**/*.{ts,tsx}'],
            // Exclude test files, configs, and non-testable code
            exclude: [
                'src/**/*.d.ts',
                'src/**/*.test.{ts,tsx}',
                'src/**/*.spec.{ts,tsx}',
                'src/app/**/layout.tsx',
                'src/app/**/page.tsx',
                'src/app/**/error.tsx',
                'src/app/**/loading.tsx',
                'src/app/manifest.ts',
                'src/app/icon.tsx',
                'src/app/apple-icon.tsx',
                'src/i18n/**',
            ],
        },
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
});
