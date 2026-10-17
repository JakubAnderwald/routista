import { setRequestLocale } from 'next-intl/server';
import CreateClient from './CreateClient';
import { getPageMetadata } from '@/i18n/pageMetadata';

export function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
    return getPageMetadata(params, 'create');
}

export default async function CreatePage({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    setRequestLocale(locale);
    return <CreateClient />;
}
