import { Link } from '@/i18n/routing';
import { Button } from "@/components/ui/Button";
import { Map, Share2, Download, Coffee } from "lucide-react";
import { getTranslations, setRequestLocale } from 'next-intl/server';

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('HomePage');

  return (
    <div className="flex flex-col items-center min-h-screen">
      {/* Hero Section */}
      <section className="w-full py-6 md:py-8 bg-gradient-to-b from-blue-50 to-white text-center px-4">
        <div className="container mx-auto max-w-4xl">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-gray-900 mb-4" dangerouslySetInnerHTML={{ __html: t.raw('title') }} />
          <p className="text-lg text-gray-600 mb-6 max-w-2xl mx-auto">
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
      <section className="w-full py-6 bg-white px-4">
        <div className="container mx-auto max-w-6xl">
          <div className="grid md:grid-cols-3 gap-8">
            <div className="flex flex-col items-center text-center">
              <div className="w-12 h-12 bg-blue-100 rounded-2xl flex items-center justify-center text-blue-600 mb-3">
                <Map className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold mb-2">{t('features.anyShape.title')}</h3>
              <p className="text-sm text-gray-600">
                {t('features.anyShape.description')}
              </p>
            </div>
            <div className="flex flex-col items-center text-center">
              <div className="w-12 h-12 bg-green-100 rounded-2xl flex items-center justify-center text-green-600 mb-3">
                <Download className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold mb-2">{t('features.export.title')}</h3>
              <p className="text-sm text-gray-600">
                {t('features.export.description')}
              </p>
            </div>
            <div className="flex flex-col items-center text-center">
              <div className="w-12 h-12 bg-purple-100 rounded-2xl flex items-center justify-center text-purple-600 mb-3">
                <Share2 className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold mb-2">{t('features.share.title')}</h3>
              <p className="text-sm text-gray-600">
                {t('features.share.description')}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Support Section */}
      <section className="w-full flex-grow py-6 bg-gradient-to-b from-white to-amber-50 px-4">
        <div className="container mx-auto max-w-2xl text-center">
          <div className="bg-white rounded-2xl shadow-lg p-6 border border-amber-100">
            <div className="flex items-center justify-center gap-2 mb-3">
              <div className="w-10 h-10 bg-gradient-to-br from-amber-400 to-orange-500 rounded-full flex items-center justify-center shadow-md">
                <Coffee className="w-5 h-5 text-white" />
              </div>
              <h2 className="text-xl font-bold text-gray-900">
                {t('support.title')}
              </h2>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              {t('support.description')}
            </p>
            <a
              href="https://buymeacoffee.com/jakubanderwald"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block"
            >
              <Button
                size="md"
                className="px-5 py-2 rounded-full bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-0.5"
              >
                <Coffee className="w-4 h-4 mr-2" />
                {t('support.button')}
              </Button>
            </a>
            <p className="text-xs text-gray-500 mt-3">
              {t('support.footer')}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
