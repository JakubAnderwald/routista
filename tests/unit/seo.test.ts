import { describe, it, expect, vi } from 'vitest';

// @/i18n/routing calls createNavigation, which imports next/navigation; Node's
// resolver can't load that outside Next's bundler.
vi.mock('next-intl/navigation', () => ({
    createNavigation: () => ({}),
}));

import {
    SEO_PAGES,
    buildPageMetadata,
    getAlternates,
    getLanguageAlternates,
    getLocalizedUrl,
    localizePathname,
    type AppLocale,
    type SeoPage,
} from '../../src/lib/seo';
import { SITE_URL } from '../../src/config/site';
import { routing } from '../../src/i18n/routing';

const locales = routing.locales as readonly AppLocale[];
const pages = Object.keys(SEO_PAGES) as SeoPage[];

describe('routing assumptions', () => {
    // localizePathname mirrors next-intl's 'as-needed' prefixing; if routing
    // changes, these helpers have to change with it.
    it('serves the default locale unprefixed', () => {
        expect(routing.localePrefix).toBe('as-needed');
        expect(routing.defaultLocale).toBe('en');
    });

    it('leaves hreflang to the HTML, not the Link header', () => {
        expect(routing.alternateLinks).toBe(false);
    });

    it('uses the www origin with no trailing slash', () => {
        expect(SITE_URL).toBe('https://www.routista.eu');
    });
});

describe('localizePathname', () => {
    it.each([
        ['en', '/', '/'],
        ['en', '/about', '/about'],
        ['de', '/', '/de'],
        ['de', '/create', '/de/create'],
        ['pl', '/about', '/pl/about'],
        ['da', '/', '/da'],
    ] as const)('%s %s → %s', (locale, pathname, expected) => {
        expect(localizePathname(locale, pathname)).toBe(expected);
    });
});

describe('getLocalizedUrl', () => {
    it('renders the English home as the bare origin', () => {
        expect(getLocalizedUrl('en', '/')).toBe('https://www.routista.eu');
    });

    it('prefixes non-default locales', () => {
        expect(getLocalizedUrl('pl', '/about')).toBe('https://www.routista.eu/pl/about');
        expect(getLocalizedUrl('de', '/')).toBe('https://www.routista.eu/de');
    });

    it('never produces an /en URL', () => {
        for (const locale of locales) {
            for (const pathname of Object.values(SEO_PAGES)) {
                const url = getLocalizedUrl(locale, pathname);
                expect(url).not.toMatch(/\/en(\/|$)/);
                expect(url.startsWith(SITE_URL)).toBe(true);
            }
        }
    });
});

describe('getLanguageAlternates', () => {
    it('lists every locale plus x-default', () => {
        const languages = getLanguageAlternates('/about');

        expect(Object.keys(languages).sort()).toEqual([...locales, 'x-default'].sort());
        expect(languages).toEqual({
            en: 'https://www.routista.eu/about',
            de: 'https://www.routista.eu/de/about',
            da: 'https://www.routista.eu/da/about',
            pl: 'https://www.routista.eu/pl/about',
            'x-default': 'https://www.routista.eu/about',
        });
    });

    it('points x-default at the English URL', () => {
        const languages = getLanguageAlternates('/');
        expect(languages['x-default']).toBe(languages.en);
    });
});

describe('getAlternates', () => {
    it('is self-canonical for every locale and page', () => {
        for (const locale of locales) {
            for (const pathname of Object.values(SEO_PAGES)) {
                const { canonical, languages } = getAlternates(locale, pathname);
                expect(canonical).toBe(languages[locale]);
            }
        }
    });
});

describe('buildPageMetadata', () => {
    const build = (locale: AppLocale, page: SeoPage) =>
        buildPageMetadata({ locale, page, title: 'Title', description: 'Description' });

    it('makes only the home title absolute', () => {
        expect(build('en', 'home').title).toEqual({ absolute: 'Title' });
        expect(build('en', 'about').title).toBe('Title');
        expect(build('de', 'create').title).toBe('Title');
    });

    it('sets canonical, hreflang and Open Graph from the same URL', () => {
        for (const locale of locales) {
            for (const page of pages) {
                const metadata = build(locale, page);
                const canonical = getLocalizedUrl(locale, SEO_PAGES[page]);

                expect(metadata.description).toBe('Description');
                expect(metadata.alternates?.canonical).toBe(canonical);
                expect(metadata.alternates?.languages).toEqual(getLanguageAlternates(SEO_PAGES[page]));
                expect(metadata.openGraph).toMatchObject({ url: canonical, title: 'Title', siteName: 'Routista' });
            }
        }
    });

    it('lists the other locales as Open Graph alternates', () => {
        expect(build('de', 'about').openGraph).toMatchObject({
            locale: 'de_DE',
            alternateLocale: ['en_US', 'da_DK', 'pl_PL'],
        });
    });
});
