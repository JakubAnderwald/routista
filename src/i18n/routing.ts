import { defineRouting } from 'next-intl/routing';
import { createNavigation } from 'next-intl/navigation';

export const routing = defineRouting({
    // A list of all locales that are supported
    locales: ['en', 'de', 'da', 'pl'],

    // Used when no locale matches
    defaultLocale: 'en',

    // English is served unprefixed (/about); other locales are prefixed (/de/about).
    // /en/* redirects to the unprefixed URL; middleware.ts makes that redirect permanent.
    localePrefix: 'as-needed',

    // Enable locale detection based on browser preferences
    localeDetection: true,

    // hreflang is emitted in the HTML by generateMetadata (src/lib/seo.ts). The
    // Link header would build URLs from the request host (e.g. routista.vercel.app)
    // and contradict the www canonical.
    alternateLinks: false
});

// Lightweight wrappers around Next.js' navigation APIs
// that will consider the routing configuration
export const { Link, redirect, usePathname, useRouter, getPathname } =
    createNavigation(routing);
