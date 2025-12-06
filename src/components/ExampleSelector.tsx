import { useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";

interface ExampleSelectorProps {
    onSelect: (filename: string) => void;
}

const EXAMPLES = [
    { id: 'star', src: '/star.png', labelKey: 'star' },
    { id: 'heart', src: '/heart-v2.png', labelKey: 'heart' },
    { id: 'lightning', src: '/examples/lightning.png', labelKey: 'lightning' },
    { id: 'note', src: '/examples/note.png', labelKey: 'note' },
    { id: 'anchor', src: '/examples/anchor.png', labelKey: 'anchor' },
    { id: 'dino', src: '/examples/dino.png', labelKey: 'dino' },
    { id: 'paw', src: '/examples/paw.png', labelKey: 'paw' },
];

export function ExampleSelector({ onSelect }: ExampleSelectorProps) {
    const t = useTranslations('ExampleSelector');
    const [selectedId, setSelectedId] = useState<string | null>(null);

    return (
        <div className="w-full max-w-xl">
            <h3 className="text-lg font-semibold mb-4 dark:text-white">{t('title')}</h3>
            <div className="grid grid-cols-4 sm:grid-cols-5 gap-3">
                {EXAMPLES.map((example) => (
                    <button
                        key={example.id}
                        onClick={() => {
                            setSelectedId(example.id);
                            onSelect(example.src);
                        }}
                        className={`group relative aspect-square rounded-xl overflow-hidden border-2 transition-all hover:border-blue-500 hover:scale-105 active:scale-95 bg-white dark:bg-gray-800
                            ${selectedId === example.id ? 'border-blue-600 ring-2 ring-blue-200 dark:ring-blue-900' : 'border-gray-200 dark:border-gray-700'}
                        `}
                        aria-label={t(example.labelKey)}
                        title={t(example.labelKey)}
                    >
                        <div className="absolute inset-0 p-2 flex items-center justify-center">
                            <div className="relative w-full h-full">
                                <Image
                                    src={example.src}
                                    alt={t(example.labelKey)}
                                    fill
                                    className="object-contain p-1 filter dark:invert"
                                />
                            </div>
                        </div>
                    </button>
                ))}
            </div>
        </div>
    );
}
