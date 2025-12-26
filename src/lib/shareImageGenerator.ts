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
    instagram: { width: 1080, height: 1920, bannerHeight: 80 }, // Smaller banners for more map space
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
 * Gets mode display info (emoji and name)
 */
function getModeInfo(mode: string): { emoji: string; name: string } {
    switch (mode) {
        case 'foot-walking':
            return { emoji: '🚶', name: 'WALKING' };
        case 'cycling-regular':
            return { emoji: '🚴', name: 'CYCLING' };
        case 'driving-car':
            return { emoji: '🚗', name: 'DRIVING' };
        default:
            return { emoji: '🏃', name: 'RUNNING' };
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
    
    // Generate QR code
    const qrSize = platform === 'instagram' ? 120 : Math.min(dims.bannerHeight - 20, 100);
    const qrDataUrl = await generateQRCode(ROUTISTA_URL, qrSize);
    const qrImage = await loadImage(qrDataUrl);
    
    if (platform === 'instagram') {
        // Instagram: Full-bleed map with overlay branding
        // Draw map to cover entire canvas (crop to fill)
        const mapAspect = mapCanvas.width / mapCanvas.height;
        const canvasAspect = dims.width / dims.height;
        
        let srcX = 0, srcY = 0, srcW = mapCanvas.width, srcH = mapCanvas.height;
        
        if (mapAspect > canvasAspect) {
            // Map is wider - crop sides
            srcW = mapCanvas.height * canvasAspect;
            srcX = (mapCanvas.width - srcW) / 2;
        } else {
            // Map is taller - crop top/bottom
            srcH = mapCanvas.width / canvasAspect;
            srcY = (mapCanvas.height - srcH) / 2;
        }
        
        ctx.drawImage(mapCanvas, srcX, srcY, srcW, srcH, 0, 0, dims.width, dims.height);
        
        // Top overlay with gradient
        const topGradient = ctx.createLinearGradient(0, 0, 0, 200);
        topGradient.addColorStop(0, 'rgba(37, 99, 235, 0.95)'); // blue-600
        topGradient.addColorStop(1, 'rgba(37, 99, 235, 0)');
        ctx.fillStyle = topGradient;
        ctx.fillRect(0, 0, dims.width, 200);
        
        // Routista logo
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 48px system-ui, -apple-system, sans-serif';
        ctx.textBaseline = 'top';
        ctx.fillText('🏃 ROUTISTA', 40, 40);
        
        // URL
        ctx.font = '28px system-ui, -apple-system, sans-serif';
        ctx.fillText('routista.eu', 40, 100);
        
        // QR code top right
        ctx.drawImage(qrImage, dims.width - qrSize - 40, 40, qrSize, qrSize);
        
        // Bottom overlay with gradient
        const bottomGradient = ctx.createLinearGradient(0, dims.height - 300, 0, dims.height);
        bottomGradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
        bottomGradient.addColorStop(1, 'rgba(0, 0, 0, 0.85)');
        ctx.fillStyle = bottomGradient;
        ctx.fillRect(0, dims.height - 300, dims.width, 300);
        
        // Stats and branding at bottom
        const modeInfo = getModeInfo(mode);
        const lengthStr = formatLength(stats.length);
        
        // Mode with pill background for visibility
        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.beginPath();
        ctx.roundRect(30, dims.height - 140, 280, 50, 25);
        ctx.fill();
        
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 32px system-ui, -apple-system, sans-serif';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${modeInfo.emoji}  ${modeInfo.name}`, 55, dims.height - 115);
        
        // Distance
        ctx.font = 'bold 48px system-ui, -apple-system, sans-serif';
        ctx.textBaseline = 'bottom';
        ctx.fillText(lengthStr, 40, dims.height - 55);
        
        // Generated with
        ctx.font = 'italic 24px system-ui, -apple-system, sans-serif';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.fillText(`"${translations.generatedWith}"`, 40, dims.height - 20);
        
    } else {
        // Facebook/Twitter: Banner layout
        const topBannerHeight = dims.bannerHeight;
        const bottomBannerHeight = dims.bannerHeight;
        const mapAreaHeight = dims.height - topBannerHeight - bottomBannerHeight;
        
        // Fill background
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, dims.width, dims.height);
        
        // Draw the map (scaled to fit)
        const mapAspect = mapCanvas.width / mapCanvas.height;
        const areaAspect = dims.width / mapAreaHeight;
        
        let drawWidth = dims.width;
        let drawHeight = mapAreaHeight;
        let drawX = 0;
        let drawY = topBannerHeight;
        
        if (mapAspect > areaAspect) {
            drawHeight = dims.width / mapAspect;
            drawY = topBannerHeight + (mapAreaHeight - drawHeight) / 2;
        } else {
            drawWidth = mapAreaHeight * mapAspect;
            drawX = (dims.width - drawWidth) / 2;
        }
        
        ctx.fillStyle = '#f3f4f6';
        ctx.fillRect(0, topBannerHeight, dims.width, mapAreaHeight);
        ctx.drawImage(mapCanvas, drawX, drawY, drawWidth, drawHeight);
        
        // Top banner
        ctx.fillStyle = BRAND_COLOR;
        ctx.fillRect(0, 0, dims.width, topBannerHeight);
        
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${Math.round(topBannerHeight * 0.4)}px system-ui, -apple-system, sans-serif`;
        ctx.textBaseline = 'middle';
        const logoY = topBannerHeight / 2;
        ctx.fillText('🏃 ROUTISTA', 20, logoY);
        
        ctx.font = `${Math.round(topBannerHeight * 0.25)}px system-ui, -apple-system, sans-serif`;
        const urlText = 'routista.eu';
        const urlMetrics = ctx.measureText(urlText);
        ctx.fillText(urlText, dims.width - qrSize - 30 - urlMetrics.width, logoY);
        
        ctx.drawImage(qrImage, dims.width - qrSize - 10, (topBannerHeight - qrSize) / 2, qrSize, qrSize);
        
        // Bottom banner
        ctx.fillStyle = '#1f2937';
        ctx.fillRect(0, dims.height - bottomBannerHeight, dims.width, bottomBannerHeight);
        
        const modeInfo = getModeInfo(mode);
        const lengthStr = formatLength(stats.length);
        
        // Mode pill on the left
        ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.beginPath();
        ctx.roundRect(15, dims.height - bottomBannerHeight + 15, 140, bottomBannerHeight - 30, 20);
        ctx.fill();
        
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${Math.round(bottomBannerHeight * 0.35)}px system-ui, -apple-system, sans-serif`;
        ctx.textBaseline = 'middle';
        ctx.fillText(`${modeInfo.emoji} ${modeInfo.name}`, 30, dims.height - bottomBannerHeight / 2);
        
        // Distance in the middle
        ctx.font = `bold ${Math.round(bottomBannerHeight * 0.4)}px system-ui, -apple-system, sans-serif`;
        ctx.fillText(lengthStr, 180, dims.height - bottomBannerHeight / 2);
        
        // Generated with on the right
        ctx.font = `italic ${Math.round(bottomBannerHeight * 0.22)}px system-ui, -apple-system, sans-serif`;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.textAlign = 'right';
        ctx.fillText(`"${translations.generatedWith}"`, dims.width - 20, dims.height - bottomBannerHeight / 2);
        ctx.textAlign = 'left'; // Reset
    }
    
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
 * Captures a Leaflet map to a canvas using leaflet-image,
 * then manually draws the route on top (since leaflet-image doesn't capture vector layers)
 */
export async function captureMapToCanvas(map: L.Map, routeCoordinates?: [number, number][]): Promise<HTMLCanvasElement> {
    console.log('[ShareImageGenerator] Capturing map to canvas...');
    
    // Dynamic import to avoid SSR issues
    const leafletImage = (await import('leaflet-image')).default;
    
    return new Promise((resolve, reject) => {
        leafletImage(map, (err: Error | null, canvas: HTMLCanvasElement) => {
            if (err) {
                console.error('[ShareImageGenerator] Map capture failed:', err);
                reject(err);
                return;
            }
            
            console.log('[ShareImageGenerator] Map tiles captured, drawing route...');
            
            // Draw route on top of the captured map
            if (routeCoordinates && routeCoordinates.length > 1) {
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    // Get map container size and bounds
                    const mapSize = map.getSize();
                    const bounds = map.getBounds();
                    
                    // Calculate scale factors
                    const scaleX = canvas.width / mapSize.x;
                    const scaleY = canvas.height / mapSize.y;
                    
                    // Convert lat/lng to canvas pixel coordinates
                    const toCanvasPoint = (lat: number, lng: number): { x: number; y: number } => {
                        const point = map.latLngToContainerPoint([lat, lng]);
                        return {
                            x: point.x * scaleX,
                            y: point.y * scaleY
                        };
                    };
                    
                    // Draw the route
                    ctx.strokeStyle = '#2563eb'; // blue-600
                    ctx.lineWidth = 4 * scaleX; // Scale line width
                    ctx.lineCap = 'round';
                    ctx.lineJoin = 'round';
                    
                    ctx.beginPath();
                    const firstPoint = toCanvasPoint(routeCoordinates[0][0], routeCoordinates[0][1]);
                    ctx.moveTo(firstPoint.x, firstPoint.y);
                    
                    for (let i = 1; i < routeCoordinates.length; i++) {
                        const point = toCanvasPoint(routeCoordinates[i][0], routeCoordinates[i][1]);
                        ctx.lineTo(point.x, point.y);
                    }
                    
                    ctx.stroke();
                    console.log(`[ShareImageGenerator] Route drawn with ${routeCoordinates.length} points`);
                }
            }
            
            console.log('[ShareImageGenerator] Map captured successfully');
            resolve(canvas);
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

