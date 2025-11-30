"use client"

import * as React from "react"
import { Moon, Sun, Laptop } from "lucide-react"
import { useTheme } from "next-themes"
import { useTranslations } from "next-intl"

export function ThemeToggle() {
    const { setTheme, theme } = useTheme()
    const t = useTranslations('ThemeToggle')
    const [mounted, setMounted] = React.useState(false)

    React.useEffect(() => {
        setMounted(true)
    }, [])

    if (!mounted) {
        return <div className="w-9 h-9" /> // Placeholder to avoid hydration mismatch
    }

    return (
        <div className="relative group">
            <button
                className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                aria-label={t('toggle_theme')}
            >
                <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                <Moon className="absolute top-2 left-2 h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            </button>

            <div className="absolute right-0 mt-2 w-36 rounded-md shadow-lg bg-white dark:bg-gray-800 ring-1 ring-black ring-opacity-5 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                <div className="py-1" role="menu" aria-orientation="vertical">
                    <button
                        onClick={() => setTheme("light")}
                        className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 hover:bg-gray-100 dark:hover:bg-gray-700 ${theme === 'light' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-700 dark:text-gray-200'}`}
                        role="menuitem"
                    >
                        <Sun className="h-4 w-4" />
                        {t('light')}
                    </button>
                    <button
                        onClick={() => setTheme("dark")}
                        className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 hover:bg-gray-100 dark:hover:bg-gray-700 ${theme === 'dark' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-700 dark:text-gray-200'}`}
                        role="menuitem"
                    >
                        <Moon className="h-4 w-4" />
                        {t('dark')}
                    </button>
                    <button
                        onClick={() => setTheme("system")}
                        className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 hover:bg-gray-100 dark:hover:bg-gray-700 ${theme === 'system' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-700 dark:text-gray-200'}`}
                        role="menuitem"
                    >
                        <Laptop className="h-4 w-4" />
                        {t('system')}
                    </button>
                </div>
            </div>
        </div>
    )
}
