'use client';

import { useState } from 'react';

export default function DebugLocalePage() {
    // Initialize state directly from navigator
    const languages = typeof window !== 'undefined'
        ? (navigator.languages || [navigator.language])
        : [];

    const [browserLanguages] = useState<string[]>(Array.from(languages));
    const [acceptLanguage] = useState<string>(() => {
        return languages
            .map((lang, index) => {
                const quality = 1 - (index * 0.1);
                return index === 0 ? lang : `${lang};q=${quality.toFixed(1)}`;
            })
            .join(', ');
    });

    const detectLocale = () => {
        const supportedLocales = ['en', 'de', 'pl'];
        for (const lang of browserLanguages) {
            const code = lang.split('-')[0].toLowerCase();
            if (supportedLocales.includes(code)) {
                return code;
            }
        }
        return 'en';
    };

    const expectedLocale = detectLocale();

    return (
        <div className="min-h-screen bg-gray-50 p-8">
            <div className="max-w-2xl mx-auto bg-white rounded-lg shadow-lg p-6">
                <h1 className="text-2xl font-bold mb-6 text-gray-900">
                    Locale Detection Debug
                </h1>

                <div className="space-y-4">
                    <div className="border-b pb-4">
                        <h2 className="text-lg font-semibold text-gray-800 mb-2">
                            Browser Languages (navigator.languages)
                        </h2>
                        <ul className="list-disc list-inside text-gray-700">
                            {browserLanguages.map((lang, index) => (
                                <li key={index}>
                                    {lang} {index === 0 && '(preferred)'}
                                </li>
                            ))}
                        </ul>
                    </div>

                    <div className="border-b pb-4">
                        <h2 className="text-lg font-semibold text-gray-800 mb-2">
                            Simulated Accept-Language Header
                        </h2>
                        <code className="block bg-gray-100 p-3 rounded text-sm text-gray-800 break-all">
                            {acceptLanguage}
                        </code>
                    </div>

                    <div className="border-b pb-4">
                        <h2 className="text-lg font-semibold text-gray-800 mb-2">
                            Supported Locales
                        </h2>
                        <div className="flex gap-2">
                            <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded">en</span>
                            <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded">de</span>
                            <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded">pl</span>
                        </div>
                    </div>

                    <div className="bg-green-50 border border-green-200 rounded p-4">
                        <h2 className="text-lg font-semibold text-green-900 mb-2">
                            Expected Redirect
                        </h2>
                        <p className="text-green-800">
                            Based on your browser settings, visiting{' '}
                            <code className="bg-white px-2 py-1 rounded">
                                http://localhost:3000/
                            </code>{' '}
                            should redirect to:
                        </p>
                        <p className="text-2xl font-bold text-green-900 mt-2">
                            /{expectedLocale}
                        </p>
                    </div>

                    <div className="bg-blue-50 border border-blue-200 rounded p-4">
                        <h3 className="font-semibold text-blue-900 mb-2">
                            Test Instructions:
                        </h3>
                        <ol className="list-decimal list-inside text-blue-800 space-y-1">
                            <li>Open a new incognito/private window</li>
                            <li>
                                Visit{' '}
                                <code className="bg-white px-2 py-1 rounded">
                                    http://localhost:3000/
                                </code>
                            </li>
                            <li>Check if it redirects to /{expectedLocale}</li>
                        </ol>
                    </div>
                </div>
            </div>
        </div>
    );
}
