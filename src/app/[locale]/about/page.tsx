import { Link } from '@/i18n/routing';
import { Button } from "@/components/ui/Button";
import { Heart, Coffee, Github } from "lucide-react";
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { SupportButton } from "@/components/SupportButton";

export default async function About({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    setRequestLocale(locale);
    const t = await getTranslations('AboutPage');

    return (
        <div className="flex flex-col items-center">
            {/* Hero Section */}
            <section className="w-full py-12 md:py-16 bg-gradient-to-b from-blue-50 to-white dark:from-blue-950 dark:to-gray-900 text-center px-4 transition-colors">
                <div className="container mx-auto max-w-4xl">
                    <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-gray-900 dark:text-white mb-4" dangerouslySetInnerHTML={{ __html: t.raw('title') }} />
                    <p className="text-xl text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
                        {t('subtitle')}
                    </p>
                </div>
            </section>

            {/* Main Content */}
            <section className="w-full py-12 px-4">
                <div className="container mx-auto max-w-4xl">
                    {/* What is Routista */}
                    <div className="mb-12">
                        <h2 className="text-3xl font-bold mb-4 text-gray-900 dark:text-white">{t('whatIs.title')}</h2>
                        <p className="text-lg text-gray-600 dark:text-gray-300 mb-4">
                            {t('whatIs.description')}
                        </p>
                    </div>

                    {/* How It Works */}
                    <div className="mb-12">
                        <h2 className="text-3xl font-bold mb-6 text-gray-900 dark:text-white">{t('howItWorks.title')}</h2>
                        <div className="grid md:grid-cols-2 gap-6">
                            <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950/30 dark:to-blue-900/30 p-6 rounded-xl">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="w-8 h-8 bg-blue-600 dark:bg-blue-500 text-white font-bold rounded-full flex items-center justify-center">1</div>
                                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">{t('howItWorks.steps.1.title')}</h3>
                                </div>
                                <p className="text-gray-700 dark:text-gray-300">{t('howItWorks.steps.1.description')}</p>
                            </div>
                            <div className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-950/30 dark:to-purple-900/30 p-6 rounded-xl">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="w-8 h-8 bg-purple-600 dark:bg-purple-500 text-white font-bold rounded-full flex items-center justify-center">2</div>
                                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">{t('howItWorks.steps.2.title')}</h3>
                                </div>
                                <p className="text-gray-700 dark:text-gray-300">{t('howItWorks.steps.2.description')}</p>
                            </div>
                            <div className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950/30 dark:to-green-900/30 p-6 rounded-xl">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="w-8 h-8 bg-green-600 dark:bg-green-500 text-white font-bold rounded-full flex items-center justify-center">3</div>
                                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">{t('howItWorks.steps.3.title')}</h3>
                                </div>
                                <p className="text-gray-700 dark:text-gray-300">{t('howItWorks.steps.3.description')}</p>
                            </div>
                            <div className="bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-950/30 dark:to-orange-900/30 p-6 rounded-xl">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="w-8 h-8 bg-orange-600 dark:bg-orange-500 text-white font-bold rounded-full flex items-center justify-center">4</div>
                                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">{t('howItWorks.steps.4.title')}</h3>
                                </div>
                                <p className="text-gray-700 dark:text-gray-300">{t('howItWorks.steps.4.description')}</p>
                            </div>
                        </div>
                    </div>

                    {/* Features */}
                    <div className="mb-12">
                        <h2 className="text-3xl font-bold mb-4 text-gray-900 dark:text-white">{t('features.title')}</h2>
                        <ul className="space-y-3">
                            <li className="flex items-start gap-3">
                                <span className="text-blue-600 text-xl">✨</span>
                                <div>
                                    <span className="font-semibold text-gray-900 dark:text-white">{t('features.items.magic.title')}</span>
                                    <span className="text-gray-600 dark:text-gray-300">{t('features.items.magic.description')}</span>
                                </div>
                            </li>
                            <li className="flex items-start gap-3">
                                <span className="text-blue-600 text-xl">🗺️</span>
                                <div>
                                    <span className="font-semibold text-gray-900">{t('features.items.mapping.title')}</span>
                                    <span className="text-gray-600">{t('features.items.mapping.description')}</span>
                                </div>
                            </li>
                            <li className="flex items-start gap-3">
                                <span className="text-blue-600 text-xl">📥</span>
                                <div>
                                    <span className="font-semibold text-gray-900 dark:text-white">{t('features.items.export.title')}</span>
                                    <span className="text-gray-600 dark:text-gray-300">{t('features.items.export.description')}</span>
                                </div>
                            </li>
                            <li className="flex items-start gap-3">
                                <span className="text-orange-500 text-xl">🔗</span>
                                <div>
                                    <span className="font-semibold text-gray-900 dark:text-white">{t('features.items.strava.title')}</span>
                                    <span className="text-gray-600 dark:text-gray-300">{t('features.items.strava.description')}</span>
                                </div>
                            </li>
                            <li className="flex items-start gap-3">
                                <span className="text-blue-600 text-xl">📱</span>
                                <div>
                                    <span className="font-semibold text-gray-900 dark:text-white">{t('features.items.pwa.title')}</span>
                                    <span className="text-gray-600 dark:text-gray-300">{t('features.items.pwa.description')}</span>
                                </div>
                            </li>
                            <li className="flex items-start gap-3">
                                <span className="text-blue-600 text-xl">🔒</span>
                                <div>
                                    <span className="font-semibold text-gray-900 dark:text-white">{t('features.items.privacy.title')}</span>
                                    <span className="text-gray-600 dark:text-gray-300">{t('features.items.privacy.description')}</span>
                                </div>
                            </li>
                            <li className="flex items-start gap-3">
                                <span className="text-blue-600 text-xl">🆓</span>
                                <div>
                                    <span className="font-semibold text-gray-900">{t('features.items.free.title')}</span>
                                    <span className="text-gray-600">{t('features.items.free.description')}</span>
                                </div>
                            </li>
                        </ul>
                    </div>

                    {/* Creator Section */}
                    <div className="mb-12 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 p-8 rounded-2xl">
                        <div className="flex items-center gap-3 mb-4">
                            <Heart className="w-6 h-6 text-red-500" />
                            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{t('creator.title')}</h2>
                        </div>
                        <p className="text-lg text-gray-700 dark:text-gray-300 mb-4" dangerouslySetInnerHTML={{ __html: t.raw('creator.by') }} />
                        <p className="text-gray-600 dark:text-gray-400 mb-6">
                            {t('creator.description')}
                        </p>
                    </div>

                    {/* Support & Contributing */}
                    <div className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20 p-8 rounded-2xl border border-amber-100 dark:border-amber-900">
                        <div className="flex items-center gap-3 mb-4">
                            <Coffee className="w-6 h-6 text-orange-600 dark:text-orange-400" />
                            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{t('support.title')}</h2>
                        </div>
                        <p className="text-gray-700 dark:text-gray-300 mb-6">
                            {t('support.description')}
                        </p>
                        <div className="flex flex-wrap gap-4">
                            <SupportButton location="about" label={t('support.button')} />
                            <a
                                href="https://github.com/JakubAnderwald/routista"
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                <Button variant="outline" className="px-6 py-2 rounded-full border-2 border-gray-300 hover:border-gray-400 transition-all">
                                    <Github className="w-4 h-4 mr-2" />
                                    {t('support.github')}
                                </Button>
                            </a>
                        </div>
                        <p className="text-sm text-gray-600 mt-4">
                            {t('support.contribute')}
                        </p>
                    </div>

                    {/* CTA */}
                    <div className="mt-12 text-center">
                        <Link href="/create">
                            <Button size="lg" className="text-lg px-8 py-6 h-auto rounded-full shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-1">
                                {t('cta')}
                            </Button>
                        </Link>
                    </div>
                </div>
            </section>
        </div>
    );
}
