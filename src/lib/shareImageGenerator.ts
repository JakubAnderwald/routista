/**
 * Share Image Generator
 * 
 * Generates branded share images for social media platforms.
 * Supports Instagram Stories (9:16), Facebook (1.91:1), and Twitter (16:9).
 */

import QRCode from 'qrcode';
import type L from 'leaflet';

export type SharePlatform = 'instagram' | 'facebook' | 'twitter';

export interface ShareImageOptions {
    platform: SharePlatform;
    mapCanvas: HTMLCanvasElement;
    stats: {
        length: number; // in meters
        accuracy: number; // percentage
    };
    mode: string;
    translations: {
        generatedWith: string;
        accuracy: string;
        length: string;
    };
}

interface PlatformDimensions {
    width: number;
    height: number;
    bannerHeight: number;
}

const PLATFORM_DIMENSIONS: Record<SharePlatform, PlatformDimensions> = {
    instagram: { width: 1080, height: 1920, bannerHeight: 120 },
    facebook: { width: 1200, height: 630, bannerHeight: 80 },
    twitter: { width: 1200, height: 675, bannerHeight: 80 },
};

const ROUTISTA_URL = 'https://routista.eu';
const BRAND_COLOR = '#2563eb'; // blue-600

/**
 * Checks if the current device is mobile
 */
export function isMobile(): boolean {
    if (typeof navigator === 'undefined') return false;
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

/**
 * Generates a QR code as a data URL
 */
async function generateQRCode(url: string, size: number): Promise<string> {
    return QRCode.toDataURL(url, {
        width: size,
        margin: 1,
        color: {
            dark: '#000000',
            light: '#ffffff',
        },
    });
}

/**
 * Loads an image from a data URL
 */
function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });
}

/**
 * Formats route length for display
 */
function formatLength(meters: number): string {
    if (meters >= 1000) {
        return `${(meters / 1000).toFixed(1)} km`;
    }
    return `${Math.round(meters)} m`;
}

/**
 * Gets mode emoji for display
 */
function getModeEmoji(mode: string): string {
    switch (mode) {
        case 'foot-walking':
            return '🚶';
        case 'cycling-regular':
            return '🚴';
        case 'driving-car':
            return '🚗';
        default:
            return '🏃';
    }
}

/**
 * Gets the share URL for a platform's web intent
 */
export function getPlatformShareUrl(platform: SharePlatform): string {
    const text = encodeURIComponent('Check out my GPS art route created with Routista! 🏃‍♂️');
    const url = encodeURIComponent(ROUTISTA_URL);
    
    switch (platform) {
        case 'twitter':
            return `https://twitter.com/intent/tweet?text=${text}&url=${url}`;
        case 'facebook':
            return `https://www.facebook.com/sharer/sharer.php?u=${url}&quote=${text}`;
        case 'instagram':
            // Instagram doesn't have direct story creation URL, open main page
            return 'https://www.instagram.com/';
        default:
            return '';
    }
}

/**
 * Copies an image blob to the clipboard
 * Returns true if successful, false otherwise
 */
export async function copyImageToClipboard(blob: Blob): Promise<boolean> {
    try {
        // Check if Clipboard API is available
        if (!navigator.clipboard || !window.ClipboardItem) {
            console.warn('[ShareImageGenerator] Clipboard API not available');
            return false;
        }
        
        const clipboardItem = new ClipboardItem({ 'image/png': blob });
        await navigator.clipboard.write([clipboardItem]);
        console.log('[ShareImageGenerator] Image copied to clipboard');
        return true;
    } catch (error) {
        console.error('[ShareImageGenerator] Failed to copy to clipboard:', error);
        return false;
    }
}

/**
 * Downloads a blob as a file
 */
export function downloadImage(blob: Blob, platform: SharePlatform): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `routista-${platform}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    console.log('[ShareImageGenerator] Image downloaded');
}

/**
 * Generates a branded share image for the specified platform
 */
export async function generateShareImage(options: ShareImageOptions): Promise<Blob> {
    const { platform, mapCanvas, stats, mode, translations } = options;
    const dims = PLATFORM_DIMENSIONS[platform];
    
    console.log(`[ShareImageGenerator] Generating ${platform} image (${dims.width}x${dims.height})`);
    
    // Create the output canvas
    const canvas = document.createElement('canvas');
    canvas.width = dims.width;
    canvas.height = dims.height;
    const ctx = canvas.getContext('2d')!;
    
    // Fill background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, dims.width, dims.height);
    
    // Calculate map area (between top and bottom banners)
    const topBannerHeight = dims.bannerHeight;
    const bottomBannerHeight = dims.bannerHeight;
    const mapAreaHeight = dims.height - topBannerHeight - bottomBannerHeight;
    
    // Draw the map (scaled to fit)
    const mapAspect = mapCanvas.width / mapCanvas.height;
    const areaAspect = dims.width / mapAreaHeight;
    
    let drawWidth = dims.width;
    let drawHeight = mapAreaHeight;
    let drawX = 0;
    let drawY = topBannerHeight;
    
    if (mapAspect > areaAspect) {
        // Map is wider - fit width, center vertically
        drawHeight = dims.width / mapAspect;
        drawY = topBannerHeight + (mapAreaHeight - drawHeight) / 2;
    } else {
        // Map is taller - fit height, center horizontally
        drawWidth = mapAreaHeight * mapAspect;
        drawX = (dims.width - drawWidth) / 2;
    }
    
    // Fill map area with light gray first
    ctx.fillStyle = '#f3f4f6';
    ctx.fillRect(0, topBannerHeight, dims.width, mapAreaHeight);
    
    // Draw the map
    ctx.drawImage(mapCanvas, drawX, drawY, drawWidth, drawHeight);
    
    // Generate QR code
    const qrSize = Math.min(dims.bannerHeight - 20, 100);
    const qrDataUrl = await generateQRCode(ROUTISTA_URL, qrSize);
    const qrImage = await loadImage(qrDataUrl);
    
    // ===== TOP BANNER =====
    ctx.fillStyle = BRAND_COLOR;
    ctx.fillRect(0, 0, dims.width, topBannerHeight);
    
    // Routista logo/text
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.round(topBannerHeight * 0.4)}px system-ui, -apple-system, sans-serif`;
    ctx.textBaseline = 'middle';
    const logoY = topBannerHeight / 2;
    ctx.fillText('🏃 ROUTISTA', 20, logoY);
    
    // URL text
    ctx.font = `${Math.round(topBannerHeight * 0.25)}px system-ui, -apple-system, sans-serif`;
    const urlText = 'routista.eu';
    const urlMetrics = ctx.measureText(urlText);
    const urlX = dims.width - qrSize - 30 - urlMetrics.width;
    ctx.fillText(urlText, urlX, logoY);
    
    // QR code in top right
    const qrX = dims.width - qrSize - 10;
    const qrY = (topBannerHeight - qrSize) / 2;
    ctx.drawImage(qrImage, qrX, qrY, qrSize, qrSize);
    
    // ===== BOTTOM BANNER =====
    ctx.fillStyle = '#1f2937'; // gray-800
    ctx.fillRect(0, dims.height - bottomBannerHeight, dims.width, bottomBannerHeight);
    
    // "Generated with Routista" text
    ctx.fillStyle = '#ffffff';
    ctx.font = `${Math.round(bottomBannerHeight * 0.28)}px system-ui, -apple-system, sans-serif`;
    const bottomY1 = dims.height - bottomBannerHeight + bottomBannerHeight * 0.35;
    ctx.fillText(`"${translations.generatedWith}"`, 20, bottomY1);
    
    // Stats line
    const modeEmoji = getModeEmoji(mode);
    const lengthStr = formatLength(stats.length);
    const statsText = `${lengthStr} • ${stats.accuracy.toFixed(0)}% ${translations.accuracy} • ${modeEmoji}`;
    ctx.font = `${Math.round(bottomBannerHeight * 0.25)}px system-ui, -apple-system, sans-serif`;
    ctx.fillStyle = '#9ca3af'; // gray-400
    const bottomY2 = dims.height - bottomBannerHeight + bottomBannerHeight * 0.7;
    ctx.fillText(statsText, 20, bottomY2);
    
    console.log(`[ShareImageGenerator] Image generated successfully`);
    
    // Convert to blob
    return new Promise((resolve, reject) => {
        canvas.toBlob(
            (blob) => {
                if (blob) {
                    resolve(blob);
                } else {
                    reject(new Error('Failed to generate image blob'));
                }
            },
            'image/png',
            1.0
        );
    });
}

/**
 * Captures a Leaflet map to a canvas using leaflet-image
 */
export async function captureMapToCanvas(map: L.Map): Promise<HTMLCanvasElement> {
    console.log('[ShareImageGenerator] Capturing map to canvas...');
    
    // Dynamic import to avoid SSR issues
    const leafletImage = (await import('leaflet-image')).default;
    
    return new Promise((resolve, reject) => {
        leafletImage(map, (err: Error | null, canvas: HTMLCanvasElement) => {
            if (err) {
                console.error('[ShareImageGenerator] Map capture failed:', err);
                reject(err);
            } else {
                console.log('[ShareImageGenerator] Map captured successfully');
                resolve(canvas);
            }
        });
    });
}

/**
 * Triggers the Web Share API (for mobile)
 * Returns true if native share was used, false if cancelled/failed
 */
export async function shareNative(blob: Blob, platform: SharePlatform): Promise<boolean> {
    const file = new File([blob], `routista-${platform}.png`, { type: 'image/png' });
    
    // Check if Web Share API is available and supports files
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        console.log('[ShareImageGenerator] Using native Web Share API');
        try {
            await navigator.share({
                files: [file],
                title: 'Routista Route',
                text: 'Check out my GPS art route created with Routista!',
            });
            return true;
        } catch {
            // User cancelled or error
            console.log('[ShareImageGenerator] Native share cancelled or failed');
            return false;
        }
    }
    
    return false;
}

