import { defineRouting } from 'next-intl/routing';
import { createNavigation } from 'next-intl/navigation';

export const routing = defineRouting({
    // A list of all locales that are supported
    locales: ['en', 'de', 'da', 'pl'],

    // Used when no locale matches
    defaultLocale: 'en',

    // Always use locale prefix in URLs
    localePrefix: 'always',

    // Enable locale detection based on browser preferences
    localeDetection: true
});

// Lightweight wrappers around Next.js' navigation APIs
// that will consider the routing configuration
export const { Link, redirect, usePathname, useRouter, getPathname } =
    createNavigation(routing);
