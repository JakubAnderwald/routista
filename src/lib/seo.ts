import type { Metadata } from 'next';
import { routing } from '@/i18n/routing';
import { SITE_NAME, SITE_URL } from '@/config/site';

/** A locale the app serves. */
export type AppLocale = (typeof routing.locales)[number];

/**
 * Indexable pages. The key names the `metadata.<key>` message namespace;
 * the value is the internal (unlocalized) pathname.
 */
export const SEO_PAGES = {
    home: '/',
    about: '/about',
    create: '/create',
} as const;

/** Key of an indexable page in {@link SEO_PAGES}. */
export type SeoPage = keyof typeof SEO_PAGES;

const OG_LOCALE: Record<AppLocale, string> = {
    en: 'en_US',
    de: 'de_DE',
    da: 'da_DK',
    pl: 'pl_PL',
};

/**
 * Public pathname of a page in a locale, under `localePrefix: 'as-needed'`:
 * the default locale is unprefixed, others get a `/<locale>` prefix.
 *
 * Mirrors next-intl's `getPathname` without importing `next-intl/navigation`,
 * so it stays usable from sitemap.ts and from unit tests.
 *
 * @example localizePathname('en', '/about') // '/about'
 * @example localizePathname('de', '/')      // '/de'
 */
export function localizePathname(locale: AppLocale, pathname: string): string {
    if (locale === routing.defaultLocale) return pathname;
    return pathname === '/' ? `/${locale}` : `/${locale}${pathname}`;
}

/**
 * Absolute URL of a page in a locale, on the canonical www origin.
 * The site root has no trailing slash, matching how Next.js renders a
 * canonical of `/`, so the sitemap and the HTML agree.
 */
export function getLocalizedUrl(locale: AppLocale, pathname: string): string {
    const localized = localizePathname(locale, pathname);
    return localized === '/' ? SITE_URL : `${SITE_URL}${localized}`;
}

/** hreflang map: one entry per locale, plus `x-default`. */
export type LanguageAlternates = Record<AppLocale | 'x-default', string>;

/**
 * hreflang alternates of a page: every locale's URL, plus `x-default`
 * pointing at the default-locale (unprefixed) URL.
 */
export function getLanguageAlternates(pathname: string): LanguageAlternates {
    const languages = {} as LanguageAlternates;
    for (const locale of routing.locales) {
        languages[locale] = getLocalizedUrl(locale, pathname);
    }
    languages['x-default'] = getLocalizedUrl(routing.defaultLocale, pathname);
    return languages;
}

/**
 * `Metadata.alternates` for a page: a self-referencing canonical and the
 * hreflang alternates.
 */
export function getAlternates(locale: AppLocale, pathname: string) {
    return {
        canonical: getLocalizedUrl(locale, pathname),
        languages: getLanguageAlternates(pathname),
    };
}

/**
 * Full page metadata: title, description, canonical, hreflang and Open Graph.
 *
 * The home title is absolute because a layout's `title.template` does not
 * apply to a page in the same route segment; other pages get the template.
 */
export function buildPageMetadata({
    locale,
    page,
    title,
    description,
}: {
    locale: AppLocale;
    page: SeoPage;
    title: string;
    description: string;
}): Metadata {
    const alternates = getAlternates(locale, SEO_PAGES[page]);
    return {
        title: page === 'home' ? { absolute: title } : title,
        description,
        alternates,
        openGraph: {
            type: 'website',
            siteName: SITE_NAME,
            title,
            description,
            url: alternates.canonical,
            locale: OG_LOCALE[locale],
            alternateLocale: routing.locales
                .filter((other) => other !== locale)
                .map((other) => OG_LOCALE[other]),
        },
    };
}
