import { Link } from '@/i18n/routing';
import { Map } from "lucide-react";
import { useTranslations } from 'next-intl';
import { ThemeToggle } from './ThemeToggle';

export function Header() {
    const t = useTranslations('Header');
    return (
        <header className="border-b border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-950/80 backdrop-blur-md sticky top-0 z-50 transition-colors">
            <div className="container mx-auto px-4 h-16 flex items-center justify-between">
                <Link href="/" className="flex items-center gap-2 font-bold text-xl text-blue-600 dark:text-blue-500">
                    <Map className="h-6 w-6" />
                    <span>Routista</span>
                </Link>
                <div className="flex items-center gap-6">
                    <nav className="flex gap-6 text-sm font-medium text-gray-600 dark:text-gray-300">
                        <Link href="/" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                            {t('home')}
                        </Link>
                        <Link href="/about" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                            {t('about')}
                        </Link>
                    </nav>
                    <ThemeToggle />
                </div>
            </div>
        </header>
    );
}
