"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { X, Instagram, Facebook, Twitter, Download, Copy, Check, Loader2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import {
    SharePlatform,
    generateShareImage,
    captureMapToCanvas,
    copyImageToClipboard,
    downloadImage,
    shareNative,
    getPlatformShareUrl,
    isMobile,
} from "@/lib/shareImageGenerator";
import type L from "leaflet";

interface ShareModalProps {
    isOpen: boolean;
    onClose: () => void;
    getMap: () => L.Map | null;
    stats: {
        length: number;
        accuracy: number;
    };
    mode: string;
}

const PLATFORMS: { id: SharePlatform; icon: typeof Instagram; hasWebIntent: boolean }[] = [
    { id: "instagram", icon: Instagram, hasWebIntent: true },
    { id: "facebook", icon: Facebook, hasWebIntent: true },
    { id: "twitter", icon: Twitter, hasWebIntent: true },
];

export function ShareModal({ isOpen, onClose, getMap, stats, mode }: ShareModalProps) {
    const t = useTranslations("ShareModal");
    const [selectedPlatform, setSelectedPlatform] = useState<SharePlatform>("instagram");
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [generatedBlob, setGeneratedBlob] = useState<Blob | null>(null);
    
    const isMobileDevice = isMobile();

    const generateImage = useCallback(async (): Promise<Blob | null> => {
        // Return cached blob if already generated for same platform
        if (generatedBlob) {
            return generatedBlob;
        }

        setError(null);
        setIsGenerating(true);

        try {
            const map = getMap();
            if (!map) {
                throw new Error("Map not available");
            }

            console.log("[ShareModal] Starting image generation for", selectedPlatform);

            // Capture map to canvas
            const mapCanvas = await captureMapToCanvas(map);

            // Generate share image
            const blob = await generateShareImage({
                platform: selectedPlatform,
                mapCanvas,
                stats,
                mode,
                translations: {
                    generatedWith: t("generatedWith"),
                    accuracy: t("accuracy"),
                    length: t("length"),
                },
            });

            setGeneratedBlob(blob);
            console.log("[ShareModal] Image generated successfully");
            return blob;
        } catch (err) {
            console.error("[ShareModal] Image generation failed:", err);
            setError(t("error"));
            return null;
        } finally {
            setIsGenerating(false);
        }
    }, [getMap, selectedPlatform, stats, mode, t, generatedBlob]);

    // Reset generated blob when platform changes
    const handlePlatformChange = (platform: SharePlatform) => {
        setSelectedPlatform(platform);
        setGeneratedBlob(null);
        setCopied(false);
    };

    const handleCopy = useCallback(async () => {
        const blob = await generateImage();
        if (!blob) return;

        const success = await copyImageToClipboard(blob);
        if (success) {
            setCopied(true);
            // Reset after 2 seconds
            setTimeout(() => setCopied(false), 2000);
        } else {
            // Fallback to download if clipboard fails
            setError(t("clipboardFailed"));
        }
    }, [generateImage, t]);

    const handleDownload = useCallback(async () => {
        const blob = await generateImage();
        if (!blob) return;

        downloadImage(blob, selectedPlatform);
    }, [generateImage, selectedPlatform]);

    const handleShare = useCallback(async () => {
        const blob = await generateImage();
        if (!blob) return;

        const shared = await shareNative(blob, selectedPlatform);
        if (shared) {
            onClose();
        }
    }, [generateImage, selectedPlatform, onClose]);

    const handleOpenPlatform = (platform: SharePlatform) => {
        const url = getPlatformShareUrl(platform);
        if (url) {
            window.open(url, '_blank', 'noopener,noreferrer');
        }
    };

    if (!isOpen) return null;

    const selectedPlatformConfig = PLATFORMS.find(p => p.id === selectedPlatform);

    return (
        <div
            className="fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm"
            style={{ zIndex: 10000 }}
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
            data-testid="share-modal-overlay"
        >
            <div
                className="relative w-full max-w-md mx-4 bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-800 overflow-hidden"
                role="dialog"
                aria-modal="true"
                aria-labelledby="share-modal-title"
            >
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800">
                    <div>
                        <h2
                            id="share-modal-title"
                            className="text-lg font-semibold text-gray-900 dark:text-white"
                        >
                            {t("title")}
                        </h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            {t("subtitle")}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                        aria-label={t("close")}
                        data-testid="share-modal-close"
                    >
                        <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                    </button>
                </div>

                {/* Platform Selection */}
                <div className="p-4 space-y-3">
                    {PLATFORMS.map(({ id, icon: Icon }) => (
                        <button
                            key={id}
                            onClick={() => handlePlatformChange(id)}
                            className={cn(
                                "w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all",
                                selectedPlatform === id
                                    ? "border-blue-600 bg-blue-50 dark:bg-blue-950/30"
                                    : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                            )}
                            data-testid={`share-platform-${id}`}
                        >
                            <div
                                className={cn(
                                    "p-2 rounded-lg",
                                    selectedPlatform === id
                                        ? "bg-blue-600 text-white"
                                        : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
                                )}
                            >
                                <Icon className="w-5 h-5" />
                            </div>
                            <div className="text-left">
                                <div
                                    className={cn(
                                        "font-medium",
                                        selectedPlatform === id
                                            ? "text-blue-600 dark:text-blue-400"
                                            : "text-gray-900 dark:text-white"
                                    )}
                                >
                                    {t(`platforms.${id}`)}
                                </div>
                                <div className="text-sm text-gray-500 dark:text-gray-400">
                                    {t(`platforms.${id}Desc`)}
                                </div>
                            </div>
                        </button>
                    ))}
                </div>

                {/* Error Message */}
                {error && (
                    <div className="mx-4 mb-4 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg">
                        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                    </div>
                )}

                {/* Copied Feedback */}
                {copied && (
                    <div className="mx-4 mb-4 p-3 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg">
                        <p className="text-sm text-green-600 dark:text-green-400 flex items-center gap-2">
                            <Check className="w-4 h-4" />
                            {t("pasteHint")}
                        </p>
                    </div>
                )}

                {/* Actions */}
                <div className="p-4 border-t border-gray-200 dark:border-gray-800">
                    {isMobileDevice ? (
                        // Mobile: Single share button
                        <div className="flex gap-3">
                            <Button
                                variant="outline"
                                className="flex-1"
                                onClick={onClose}
                                disabled={isGenerating}
                            >
                                {t("close")}
                            </Button>
                            <Button
                                className="flex-1 gap-2"
                                onClick={handleShare}
                                disabled={isGenerating}
                                data-testid="share-modal-share-button"
                            >
                                {isGenerating ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        {t("generating")}
                                    </>
                                ) : (
                                    t("share")
                                )}
                            </Button>
                        </div>
                    ) : (
                        // Desktop: Copy (primary), Download (secondary), Platform links
                        <div className="space-y-3">
                            {/* Primary actions */}
                            <div className="flex gap-3">
                                <Button
                                    className="flex-1 gap-2"
                                    onClick={handleCopy}
                                    disabled={isGenerating || copied}
                                    data-testid="share-modal-copy-button"
                                >
                                    {isGenerating ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            {t("generating")}
                                        </>
                                    ) : copied ? (
                                        <>
                                            <Check className="w-4 h-4" />
                                            {t("copied")}
                                        </>
                                    ) : (
                                        <>
                                            <Copy className="w-4 h-4" />
                                            {t("copyImage")}
                                        </>
                                    )}
                                </Button>
                                <Button
                                    variant="outline"
                                    className="gap-2"
                                    onClick={handleDownload}
                                    disabled={isGenerating}
                                    data-testid="share-modal-download-button"
                                >
                                    <Download className="w-4 h-4" />
                                    {t("download")}
                                </Button>
                            </div>

                            {/* Platform quick links */}
                            {selectedPlatformConfig?.hasWebIntent && (
                                <div className="flex items-center gap-2 pt-2">
                                    <span className="text-sm text-gray-500 dark:text-gray-400">
                                        {t("openPlatformHint")}
                                    </span>
                                    <button
                                        onClick={() => handleOpenPlatform(selectedPlatform)}
                                        className="flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                                    >
                                        {t(`platforms.${selectedPlatform}`)}
                                        <ExternalLink className="w-3 h-3" />
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}


