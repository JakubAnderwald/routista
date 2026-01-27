import { useTranslations } from 'next-intl';

export function Footer() {
    const t = useTranslations('Footer');
    return (
        <footer className="border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 py-8 transition-colors">
            <div className="container mx-auto px-4 text-center text-gray-500 dark:text-gray-400 text-sm">
                <p className="text-balance">&copy; {new Date().getFullYear()} Routista. {t('rights')}</p>
            </div>
        </footer>
    );
}
