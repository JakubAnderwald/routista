import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { routing } from './routing';
import { buildPageMetadata, type SeoPage } from '@/lib/seo';

/**
 * generateMetadata body for an indexable page: localized title and
 * description from `metadata.<page>`, plus canonical, hreflang and Open Graph.
 */
export async function getPageMetadata(
    params: Promise<{ locale: string }>,
    page: SeoPage
): Promise<Metadata> {
    const { locale } = await params;
    if (!hasLocale(routing.locales, locale)) notFound();

    const t = await getTranslations({ locale, namespace: `metadata.${page}` });
    return buildPageMetadata({ locale, page, title: t('title'), description: t('description') });
}
