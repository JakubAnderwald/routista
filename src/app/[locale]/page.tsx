import { Link } from '@/i18n/routing';
import { Button } from "@/components/ui/Button";
import { Map, Share2, Download, Coffee } from "lucide-react";
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { SupportButton } from "@/components/SupportButton";

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('HomePage');

  return (
    <div className="flex flex-col items-center min-h-screen">
      {/* Hero Section */}
      <section className="w-full py-6 md:py-8 bg-gradient-to-b from-blue-50 to-white dark:from-blue-950 dark:to-gray-900 text-center px-4 transition-colors">
        <div className="container mx-auto max-w-4xl">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-gray-900 dark:text-white mb-4" dangerouslySetInnerHTML={{ __html: t.raw('title') }} />
          <p className="text-lg text-gray-600 dark:text-gray-300 mb-6 max-w-2xl mx-auto">
            {t('description')}
          </p>
          <Link href="/create">
            <Button size="lg" className="text-base px-6 py-3 h-auto rounded-full shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-1">
              {t('cta')}
            </Button>
          </Link>
        </div>
      </section>

      {/* Features Section */}
      <section className="w-full py-6 bg-white dark:bg-gray-900 px-4 transition-colors">
        <div className="container mx-auto max-w-6xl">
          <div className="grid md:grid-cols-3 gap-8">
            <div className="flex flex-col items-center text-center">
              <div className="w-12 h-12 bg-blue-100 dark:bg-blue-950/30 rounded-2xl flex items-center justify-center text-blue-600 dark:text-blue-400 mb-3">
                <Map className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold mb-2 dark:text-white">{t('features.anyShape.title')}</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {t('features.anyShape.description')}
              </p>
            </div>
                        <div className="flex flex-col items-center text-center">
                            <div className="w-12 h-12 bg-orange-100 dark:bg-orange-950/30 rounded-2xl flex items-center justify-center text-orange-600 dark:text-orange-400 mb-3">
                                <Download className="w-6 h-6" />
                            </div>
                            <h3 className="text-lg font-bold mb-2 dark:text-white">{t('features.export.title')}</h3>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                {t('features.export.description')}
                            </p>
                        </div>
            <div className="flex flex-col items-center text-center">
              <div className="w-12 h-12 bg-purple-100 dark:bg-purple-950/30 rounded-2xl flex items-center justify-center text-purple-600 dark:text-purple-400 mb-3">
                <Share2 className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold mb-2 dark:text-white">{t('features.share.title')}</h3>
              <p className="text-sm text-gray-600">
                {t('features.share.description')}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Support Section */}
      <section className="w-full flex-grow py-6 bg-gradient-to-b from-white to-amber-50 dark:from-gray-900 dark:to-amber-950/20 px-4 transition-colors">
        <div className="container mx-auto max-w-2xl text-center">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 border border-amber-100 dark:border-amber-900">
            <div className="flex items-center justify-center gap-2 mb-3">
              <div className="w-10 h-10 bg-gradient-to-br from-amber-400 to-orange-500 rounded-full flex items-center justify-center shadow-md">
                <Coffee className="w-5 h-5 text-white" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                {t('support.title')}
              </h2>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
              {t('support.description')}
            </p>
            <SupportButton location="home" label={t('support.button')} />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
              {t('support.footer')}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
