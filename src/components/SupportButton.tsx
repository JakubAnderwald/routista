"use client";

import { Coffee } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { track } from "@/lib/analytics";

interface SupportButtonProps {
    location: 'home' | 'about';
    label: string;
}

/**
 * Buy Me a Coffee button with analytics tracking.
 * 
 * This is a client component because it needs to track clicks.
 * The label comes from the parent server component's translations.
 */
export function SupportButton({ location, label }: SupportButtonProps) {
    const handleClick = () => {
        track('support_click', { location });
    };

    return (
        <a
            href="https://buymeacoffee.com/jakubanderwald"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block"
            onClick={handleClick}
        >
            <Button
                size="md"
                className="px-5 py-2 rounded-full bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-0.5"
            >
                <Coffee className="w-4 h-4 mr-2" />
                {label}
            </Button>
        </a>
    );
}
