import createNextIntlPlugin from 'next-intl/plugin';
// The `/config` entry point: the root export is deprecated in @sentry/nextjs 10 and gone in 11.
import { withSentryConfig } from '@sentry/nextjs/config';
import type { NextConfig } from "next";

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  experimental: {
    // Keep server function names in production builds. Minified, they are what Sentry shows
    // in server stack frames and culprits ("il", "io", "ig" in radarService/apiRateLimit), and
    // they change from build to build, so the same error can split into a new issue after a
    // deploy. The server bundle runs in a Vercel function, where the extra size costs little.
    // Turbopack (the default bundler) reads `turbopackMinify`; `serverMinification` covers a
    // `next build --webpack`. Client and edge stay minified.
    turbopackMinify: { server: false },
    serverMinification: false,
  },
};

// Wrap with next-intl first, then Sentry
const configWithIntl = withNextIntl(nextConfig);

// Sentry configuration options
// https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/
export default withSentryConfig(configWithIntl, {
  // For all available options, see:
  // https://github.com/getsentry/sentry-webpack-plugin#options

  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-side errors will fail.
  tunnelRoute: "/monitoring",

  // Webpack-specific options
  webpack: {
    // Automatically annotate React components to show their full name in breadcrumbs and session replay
    reactComponentAnnotation: {
      enabled: true,
    },
    // Automatically tree-shake Sentry logger statements to reduce bundle size
    treeshake: {
      removeDebugLogging: true,
    },
    // Enables automatic instrumentation of Vercel Cron Monitors
    automaticVercelMonitors: true,
  },

  // Source maps configuration
  sourcemaps: {
    // Don't upload source maps in development
    disable: process.env.NODE_ENV !== 'production',
  },
});
