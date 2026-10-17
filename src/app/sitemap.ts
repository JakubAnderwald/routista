import type { MetadataRoute } from 'next';
import { routing } from '@/i18n/routing';
import { SEO_PAGES, getLanguageAlternates, getLocalizedUrl } from '@/lib/seo';

/** Every indexable page in every locale, each with its hreflang alternates. */
export default function sitemap(): MetadataRoute.Sitemap {
    return Object.values(SEO_PAGES).flatMap((pathname) => {
        const languages = getLanguageAlternates(pathname);
        return routing.locales.map((locale) => ({
            url: getLocalizedUrl(locale, pathname),
            alternates: { languages },
        }));
    });
}
