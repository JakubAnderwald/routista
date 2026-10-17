import { describe, it, expect, vi } from 'vitest';

vi.mock('next-intl/navigation', () => ({
    createNavigation: () => ({}),
}));

import sitemap from '../../src/app/sitemap';
import robots from '../../src/app/robots';

describe('sitemap', () => {
    const entries = sitemap();

    it('lists every page in every locale once', () => {
        const urls = entries.map((entry) => entry.url);

        expect(urls).toHaveLength(12);
        expect(new Set(urls).size).toBe(12);
        expect(urls).toEqual(expect.arrayContaining([
            'https://www.routista.eu',
            'https://www.routista.eu/about',
            'https://www.routista.eu/create',
            'https://www.routista.eu/de',
            'https://www.routista.eu/pl/about',
            'https://www.routista.eu/da/create',
        ]));
    });

    it('uses only canonical www URLs, never /en', () => {
        for (const entry of entries) {
            const urls = [entry.url, ...Object.values(entry.alternates?.languages ?? {})]
                .filter((url): url is string => typeof url === 'string');
            expect(urls).toHaveLength(6);
            for (const url of urls) {
                expect(url.startsWith('https://www.routista.eu')).toBe(true);
                expect(url).not.toMatch(/\/en(\/|$)/);
            }
        }
    });

    it('gives each entry its hreflang alternates, including itself', () => {
        for (const entry of entries) {
            const languages = entry.alternates?.languages ?? {};
            expect(Object.keys(languages).sort()).toEqual(['da', 'de', 'en', 'pl', 'x-default']);
            expect(Object.values(languages)).toContain(entry.url);
        }
    });
});

describe('robots', () => {
    const result = robots();

    it('allows crawling but keeps the API and Sentry tunnel out', () => {
        expect(result.rules).toEqual({
            userAgent: '*',
            allow: '/',
            disallow: ['/api/', '/monitoring'],
        });
    });

    it('points at the absolute www sitemap', () => {
        expect(result.sitemap).toBe('https://www.routista.eu/sitemap.xml');
    });
});
