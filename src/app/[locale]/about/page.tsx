import { Link } from '@/i18n/routing';
import { Button } from "@/components/ui/Button";
import { Heart, Coffee, Github, Code2 } from "lucide-react";
import { getTranslations, setRequestLocale } from 'next-intl/server';

export default async function About({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    setRequestLocale(locale);
    const t = await getTranslations('AboutPage');

    return (
        <div className="flex flex-col items-center">
            {/* Hero Section */}
            <section className="w-full py-12 md:py-16 bg-gradient-to-b from-blue-50 to-white text-center px-4">
                <div className="container mx-auto max-w-4xl">
                    <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-gray-900 mb-4" dangerouslySetInnerHTML={{ __html: t.raw('title') }} />
                    <p className="text-xl text-gray-600 max-w-2xl mx-auto">
                        {t('subtitle')}
                    </p>
                </div>
            </section>

            {/* Main Content */}
            <section className="w-full py-12 px-4">
                <div className="container mx-auto max-w-4xl">
                    {/* What is Routista */}
                    <div className="mb-12">
                        <h2 className="text-3xl font-bold mb-4 text-gray-900">{t('whatIs.title')}</h2>
                        <p className="text-lg text-gray-600 mb-4">
                            {t('whatIs.description')}
                        </p>
                    </div>

                    {/* How It Works */}
                    <div className="mb-12">
                        <h2 className="text-3xl font-bold mb-6 text-gray-900">{t('howItWorks.title')}</h2>
                        <div className="grid md:grid-cols-2 gap-6">
                            <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-6 rounded-xl">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="w-8 h-8 bg-blue-600 text-white font-bold rounded-full flex items-center justify-center">1</div>
                                    <h3 className="text-xl font-bold text-gray-900">{t('howItWorks.steps.1.title')}</h3>
                                </div>
                                <p className="text-gray-700">{t('howItWorks.steps.1.description')}</p>
                            </div>
                            <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-6 rounded-xl">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="w-8 h-8 bg-purple-600 text-white font-bold rounded-full flex items-center justify-center">2</div>
                                    <h3 className="text-xl font-bold text-gray-900">{t('howItWorks.steps.2.title')}</h3>
                                </div>
                                <p className="text-gray-700">{t('howItWorks.steps.2.description')}</p>
                            </div>
                            <div className="bg-gradient-to-br from-green-50 to-green-100 p-6 rounded-xl">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="w-8 h-8 bg-green-600 text-white font-bold rounded-full flex items-center justify-center">3</div>
                                    <h3 className="text-xl font-bold text-gray-900">{t('howItWorks.steps.3.title')}</h3>
                                </div>
                                <p className="text-gray-700">{t('howItWorks.steps.3.description')}</p>
                            </div>
                            <div className="bg-gradient-to-br from-orange-50 to-orange-100 p-6 rounded-xl">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="w-8 h-8 bg-orange-600 text-white font-bold rounded-full flex items-center justify-center">4</div>
                                    <h3 className="text-xl font-bold text-gray-900">{t('howItWorks.steps.4.title')}</h3>
                                </div>
                                <p className="text-gray-700">{t('howItWorks.steps.4.description')}</p>
                            </div>
                        </div>
                    </div>

                    {/* Tech Stack */}
                    <div className="mb-12">
                        <h2 className="text-3xl font-bold mb-4 text-gray-900 flex items-center gap-2">
                            <Code2 className="w-8 h-8 text-blue-600" />
                            {t('techStack.title')}
                        </h2>
                        <p className="text-lg text-gray-600 mb-6">{t('techStack.description')}</p>
                        <div className="grid sm:grid-cols-2 gap-3">
                            <div className="flex items-center gap-2 bg-gray-50 p-3 rounded-lg">
                                <span className="text-gray-700">{t('techStack.items.framework')}</span>
                                <span className="font-semibold text-gray-900">Next.js 16</span>
                            </div>
                            <div className="flex items-center gap-2 bg-gray-50 p-3 rounded-lg">
                                <span className="text-gray-700">{t('techStack.items.uiLibrary')}</span>
                                <span className="font-semibold text-gray-900">React 19</span>
                            </div>
                            <div className="flex items-center gap-2 bg-gray-50 p-3 rounded-lg">
                                <span className="text-gray-700">{t('techStack.items.styling')}</span>
                                <span className="font-semibold text-gray-900">Tailwind CSS 4</span>
                            </div>
                            <div className="flex items-center gap-2 bg-gray-50 p-3 rounded-lg">
                                <span className="text-gray-700">{t('techStack.items.maps')}</span>
                                <span className="font-semibold text-gray-900">Leaflet</span>
                            </div>
                            <div className="flex items-center gap-2 bg-gray-50 p-3 rounded-lg">
                                <span className="text-gray-700">{t('techStack.items.testing')}</span>
                                <span className="font-semibold text-gray-900">Vitest</span>
                            </div>
                            <div className="flex items-center gap-2 bg-gray-50 p-3 rounded-lg">
                                <span className="text-gray-700">{t('techStack.items.deployment')}</span>
                                <span className="font-semibold text-gray-900">Firebase Hosting</span>
                            </div>
                        </div>
                    </div>

                    {/* Features */}
                    <div className="mb-12">
                        <h2 className="text-3xl font-bold mb-4 text-gray-900">{t('features.title')}</h2>
                        <ul className="space-y-3">
                            <li className="flex items-start gap-3">
                                <span className="text-blue-600 text-xl">✨</span>
                                <div>
                                    <span className="font-semibold text-gray-900">{t('features.items.magic.title')}</span>
                                    <span className="text-gray-600">{t('features.items.magic.description')}</span>
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
                                    <span className="font-semibold text-gray-900">{t('features.items.export.title')}</span>
                                    <span className="text-gray-600">{t('features.items.export.description')}</span>
                                </div>
                            </li>
                            <li className="flex items-start gap-3">
                                <span className="text-blue-600 text-xl">🔒</span>
                                <div>
                                    <span className="font-semibold text-gray-900">{t('features.items.privacy.title')}</span>
                                    <span className="text-gray-600">{t('features.items.privacy.description')}</span>
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
                    <div className="mb-12 bg-gradient-to-br from-gray-50 to-gray-100 p-8 rounded-2xl">
                        <div className="flex items-center gap-3 mb-4">
                            <Heart className="w-6 h-6 text-red-500" />
                            <h2 className="text-2xl font-bold text-gray-900">{t('creator.title')}</h2>
                        </div>
                        <p className="text-lg text-gray-700 mb-4" dangerouslySetInnerHTML={{ __html: t.raw('creator.by') }} />
                        <p className="text-gray-600 mb-6">
                            {t('creator.description')}
                        </p>
                    </div>

                    {/* Support & Contributing */}
                    <div className="bg-gradient-to-br from-amber-50 to-orange-50 p-8 rounded-2xl border border-amber-100">
                        <div className="flex items-center gap-3 mb-4">
                            <Coffee className="w-6 h-6 text-orange-600" />
                            <h2 className="text-2xl font-bold text-gray-900">{t('support.title')}</h2>
                        </div>
                        <p className="text-gray-700 mb-6">
                            {t('support.description')}
                        </p>
                        <div className="flex flex-wrap gap-4">
                            <a
                                href="https://buymeacoffee.com/jakubanderwald"
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                <Button className="px-6 py-2 rounded-full bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-0.5">
                                    <Coffee className="w-4 h-4 mr-2" />
                                    {t('support.button')}
                                </Button>
                            </a>
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
