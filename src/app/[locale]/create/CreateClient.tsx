"use client";

import { useState, useEffect, useRef } from "react";
import { ImageUpload } from "@/components/ImageUpload";
import { ModeSelector } from "@/components/ModeSelector";
import { Button } from "@/components/ui/Button";
import { ExampleSelector } from "@/components/ExampleSelector";
import dynamic from "next/dynamic";
import { extractShapeFromImage } from "@/lib/imageProcessing";
import { scalePointsToGeo, calculateRouteLength, calculateRouteAccuracy } from "@/lib/geoUtils";
import { generateGPX, downloadGPX } from "@/lib/gpxGenerator";
import { useTranslations } from 'next-intl';
import { TransportMode } from "@/config";
import { useABVariant } from "@/components/ABTestProvider";
import { ShareModal } from "@/components/ShareModal";
import type { ResultMapRef } from "@/components/ResultMap";

// Actually, react-leaflet components can be imported directly, but they must be rendered inside MapContainer.
// Since Map is dynamic, we might need to pass a component that renders GeoJSON.

// Dynamic imports for Map components to avoid SSR issues
const AreaSelector = dynamic(() => import("@/components/AreaSelector").then(mod => mod.AreaSelector), {
    ssr: false,
    loading: () => <div className="w-full h-full bg-gray-100 animate-pulse" />
});

// Let's create a wrapper for the Result Map to handle GeoJSON
const ResultMap = dynamic(() => import("@/components/ResultMap"), {
    ssr: false,
    loading: () => <div className="w-full h-full bg-gray-100 animate-pulse" />
});

const ShapeEditor = dynamic(() => import("@/components/ShapeEditor").then(mod => mod.ShapeEditor), {
    ssr: false,
    loading: () => <div className="w-full h-full bg-gray-100 animate-pulse" />
});



import { FeatureCollection } from "geojson";

export default function CreateClient() {
    const t = useTranslations('CreatePage');
    const variant = useABVariant();
    
    // Variant A: 4 steps (upload -> area -> mode -> result)
    // Variant B: 3 steps (upload -> area+mode -> result)
    const [step, setStep] = useState<"upload" | "area" | "mode" | "processing" | "result">("upload");
    const [image, setImage] = useState<File | null>(null);
    const [center, setCenter] = useState<[number, number]>([51.505, -0.09]);
    const [radius, setRadius] = useState(1000);
    // For variant A, start with null mode; for variant B, default to foot-walking
    const [mode, setMode] = useState<TransportMode | null>(variant === 'A' ? null : "foot-walking");
    const [routeData, setRouteData] = useState<FeatureCollection | null>(null);
    const [shapePoints, setShapePoints] = useState<[number, number][] | null>(null);
    const [stats, setStats] = useState<{ length: number; accuracy: number } | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [shapeWarning, setShapeWarning] = useState<boolean>(false);
    const [isShareModalOpen, setIsShareModalOpen] = useState(false);
    const resultMapRef = useRef<ResultMapRef>(null);

    const tImageUpload = useTranslations('ImageUpload');
    
    const handleImageSelect = async (file: File) => {
        setImage(file);
        setShapeWarning(false);
        try {
            // Use 150 points for consistency with accuracy tests
            const result = await extractShapeFromImage(file, 150);
            setShapePoints(result.points);
            setShapeWarning(result.isLikelyNoise);
        } catch (e) {
            console.error("Failed to extract shape", e);
            alert(t('upload.error'));
        }
    };

    // Test Helper: Load image from public folder
    const loadTestImage = async (filename: string) => {
        try {
            const response = await fetch(`/${filename}`);
            const blob = await response.blob();
            const file = new File([blob], filename, { type: "image/png" });
            handleImageSelect(file);
        } catch (e) {
            console.error("Failed to load test image", e);
        }
    };

    // Test Helper: Load image from base64 data URL or blob URL
    // This allows uploading arbitrary images for bug reproduction
    const loadImageFromDataURL = async (dataURL: string, filename: string = "test-image.png") => {
        try {
            const response = await fetch(dataURL);
            const blob = await response.blob();
            const mimeType = blob.type || "image/png";
            const file = new File([blob], filename, { type: mimeType });
            handleImageSelect(file);
        } catch (e) {
            console.error("Failed to load image from data URL", e);
        }
    };

    const handleExampleSelect = async (filename: string) => {
        try {
            const response = await fetch(filename);
            const blob = await response.blob();
            const file = new File([blob], filename.split('/').pop() || "example.png", { type: "image/png" });
            handleImageSelect(file);
        } catch (e) {
            console.error("Failed to load example image", e);
            alert(t('upload.error'));
        }
    };



    // Expose helper functions globally for browser automation
    // Uses useEffect to avoid Next.js hydration issues
    useEffect(() => {
        if (typeof window !== 'undefined') {
            // @ts-expect-error - window augmentation for testing
            window.__routistaTestHelpers = {
                loadTestImage,
                loadImageFromDataURL,
            };
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);


    const handleAreaSelect = (c: [number, number], r: number) => {
        setCenter(c);
        setRadius(r);
    };

    const handleGenerate = async () => {
        if (!shapePoints || !mode) return;

        setStep("processing");
        console.log(`[CreateClient] Starting route generation...`);
        console.log(`[CreateClient] Input: ${shapePoints.length} shape points, center: [${center[0].toFixed(4)}, ${center[1].toFixed(4)}], radius: ${radius}m, mode: ${mode}`);

        try {
            // 1. Scale points
            const geoPoints = scalePointsToGeo(shapePoints, center, radius);
            console.log(`[CreateClient] Scaled to ${geoPoints.length} geo points`);

            // 2. Generate route on client-side
            const { generateRoute } = await import("@/lib/routeGenerator");
            const data = await generateRoute({ coordinates: geoPoints, mode });
            setRouteData(data);

            // Calculate stats
            const length = calculateRouteLength(data);
            const accuracy = calculateRouteAccuracy(geoPoints, data, radius);
            setStats({ length, accuracy });
            console.log(`[CreateClient] Route complete: ${(length / 1000).toFixed(2)}km, ${accuracy.toFixed(0)}% accuracy`);

            setStep("result");

        } catch (error) {
            console.error("Route generation failed:", error);
            const errorKey = variant === 'A' ? 'mode.error' : 'area.error';
            let message = t(errorKey);
            if (error instanceof Error) {
                if (error.message.includes("Route not found")) {
                    message = "Could not find a valid route for this shape with the selected mode. Try:\n• Using a simpler shape\n• Selecting a different transportation mode\n• Choosing a smaller area";
                } else {
                    message = error.message;
                }
            }
            alert(message);
            // Go back to the appropriate step based on variant
            setStep(variant === 'A' ? "mode" : "area");
        }
    };

    const handleDownload = () => {
        if (routeData) {
            const gpx = generateGPX(routeData);
            downloadGPX(gpx, "routista-route.gpx");
        }
    };

    // Steps differ based on A/B variant
    // Variant A: upload -> area -> mode -> result (4 steps)
    // Variant B: upload -> areaMode -> result (3 steps, combined area+mode)
    const steps = variant === 'A' 
        ? ["upload", "area", "mode", "result"]
        : ["upload", "areaMode", "result"];
    
    // Map step to display order for progress indicator
    const getStepDisplayIndex = (currentStep: string) => {
        if (variant === 'A') {
            return ["upload", "area", "mode", "processing", "result"].indexOf(currentStep);
        }
        // For variant B, "area" step maps to "areaMode" display
        if (currentStep === "area") return 1;
        return ["upload", "areaMode", "processing", "result"].indexOf(currentStep);
    };

    return (
        <div className="container mx-auto px-4 py-8 min-h-[calc(100vh-64px)]">
            <div className="max-w-4xl mx-auto">
                {/* Progress Steps */}
                <div className="flex items-center justify-between mb-12 px-4">
                    {steps.map((s, i) => {
                        const stepIndex = i;
                        const currentStepIndex = getStepDisplayIndex(step);
                        const active = currentStepIndex >= stepIndex;

                        return (
                            <div key={s} className="flex flex-col items-center relative z-10">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold mb-2 transition-colors ${active ? "bg-blue-600 text-white" : "bg-gray-200 dark:bg-gray-800 text-gray-500 dark:text-gray-400"}`}>
                                    {i + 1}
                                </div>
                                <span className={`text-sm font-medium ${active ? "text-blue-600 dark:text-blue-500" : "text-gray-500 dark:text-gray-400"}`}>{t(`steps.${s}`)}</span>
                            </div>
                        );
                    })}
                </div>

                <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 p-6 md:p-8 transition-colors">
                    {step === "upload" && (
                        <div className="flex flex-col items-center">
                            <h2 className="text-2xl font-bold mb-2 dark:text-white">{t('upload.title')}</h2>

                            {!isEditing ? (
                                <>
                                    <p className="text-gray-500 dark:text-gray-400 mb-8 text-center">
                                        {t('upload.description')}
                                    </p>
                                    <ImageUpload onImageSelect={handleImageSelect} className="max-w-xl mb-8" testId="create-image-upload" />

                                    {shapeWarning && (
                                        <div className="max-w-xl mb-6 p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
                                            <p className="text-amber-800 dark:text-amber-200 text-sm">
                                                ⚠️ {tImageUpload('warning')}
                                            </p>
                                        </div>
                                    )}

                                    <div className="mb-10 w-full flex justify-center">
                                        <ExampleSelector onSelect={handleExampleSelect} />
                                    </div>

                                    <div className="flex gap-4 w-full max-w-xl mb-8 justify-center">
                                        <Button
                                            variant="outline"
                                            onClick={() => setIsEditing(true)}
                                            data-testid="manual-draw-button"
                                        >
                                            {image ? t('upload.editShape') : t('upload.drawManually')}
                                        </Button>
                                    </div>

                                    <div className="flex justify-end w-full max-w-xl">
                                        <Button
                                            data-testid="upload-next-button"
                                            disabled={!shapePoints}
                                            onClick={() => setStep("area")}
                                        >
                                            {t('upload.next')}
                                        </Button>
                                    </div>
                                </>
                            ) : (
                                <div className="w-full h-[60vh] md:h-[600px] border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
                                    <ShapeEditor
                                        imageSrc={image ? URL.createObjectURL(image) : null}
                                        initialPoints={shapePoints?.map(p => ({ x: p[0], y: p[1] })) || []}
                                        onSave={(points: { x: number, y: number }[]) => {
                                            setShapePoints(points.map(p => [p.x, p.y]));
                                            setIsEditing(false);
                                        }}
                                        onCancel={() => setIsEditing(false)}
                                    />
                                </div>
                            )}
                        </div>
                    )}

                    {step === "area" && (
                        <div className="flex flex-col h-[60vh] md:h-[600px]">
                            <h2 className="text-2xl font-bold mb-4 dark:text-white">
                                {variant === 'A' ? t('area.title') : t('area.titleCombined')}
                            </h2>
                            <div className="flex-1 bg-gray-100 dark:bg-gray-950 rounded-xl overflow-hidden relative border border-gray-200 dark:border-gray-800">
                                {variant === 'A' ? (
                                    // Variant A: Area-only selector (no mode)
                                    <AreaSelector
                                        onAreaSelect={handleAreaSelect}
                                        initialCenter={center}
                                        initialRadius={radius}
                                    />
                                ) : (
                                    // Variant B: Combined area + mode selector
                                    <AreaSelector
                                        onAreaSelect={handleAreaSelect}
                                        initialCenter={center}
                                        initialRadius={radius}
                                        mode={mode}
                                        onModeChange={setMode}
                                    />
                                )}
                            </div>
                            <div className="flex justify-between mt-6">
                                <Button data-testid="area-back-button" variant="outline" onClick={() => setStep("upload")}>{t('area.back')}</Button>
                                {variant === 'A' ? (
                                    // Variant A: Next goes to mode selection
                                    <Button data-testid="area-next-button" onClick={() => setStep("mode")}>{t('area.next')}</Button>
                                ) : (
                                    // Variant B: Generate directly from area step
                                    <Button data-testid="area-generate-button" disabled={!mode} onClick={handleGenerate}>{t('area.generate')}</Button>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Variant A only: Separate Mode Selection Step */}
                    {variant === 'A' && step === "mode" && (
                        <div className="flex flex-col items-center">
                            <h2 className="text-2xl font-bold mb-8 dark:text-white">{t('mode.title')}</h2>
                            <ModeSelector selectedMode={mode} onSelect={setMode} />
                            <div className="flex justify-between w-full mt-8 max-w-3xl">
                                <Button data-testid="mode-back-button" variant="outline" onClick={() => setStep("area")}>{t('mode.back')}</Button>
                                <Button data-testid="mode-generate-button" disabled={!mode} onClick={handleGenerate}>{t('mode.generate')}</Button>
                            </div>
                        </div>
                    )}

                    {step === "processing" && (
                        <div className="flex flex-col items-center py-20">
                            <div className="w-16 h-16 border-4 border-blue-200 dark:border-blue-900 border-t-blue-600 dark:border-t-blue-500 rounded-full animate-spin mb-6"></div>
                            <h2 className="text-xl font-semibold mb-2 dark:text-white">{t('processing.title')}</h2>
                            <p className="text-gray-500 dark:text-gray-400">{t('processing.description')}</p>
                        </div>
                    )}

                    {step === "result" && (
                        <div className="flex flex-col h-[60vh] md:h-[600px]">
                            <h2 className="text-2xl font-bold mb-4 dark:text-white">{t('result.title')}</h2>

                            {stats && (
                                <div className="grid grid-cols-2 gap-4 mb-4">
                                    <div className="bg-blue-50 dark:bg-blue-950/30 p-4 rounded-xl border border-blue-100 dark:border-blue-900">
                                        <div className="text-sm text-blue-600 dark:text-blue-400 font-medium mb-1">{t('result.stats.length')}</div>
                                        <div className="text-2xl font-bold text-blue-900 dark:text-blue-100">
                                            {(stats.length / 1000).toFixed(2)} <span className="text-base font-normal text-blue-700 dark:text-blue-300">km</span>
                                        </div>
                                    </div>
                                    <div className="bg-green-50 dark:bg-green-950/30 p-4 rounded-xl border border-green-100 dark:border-green-900">
                                        <div className="text-sm text-green-600 dark:text-green-400 font-medium mb-1">{t('result.stats.accuracy')}</div>
                                        <div className="text-2xl font-bold text-green-900 dark:text-green-100">
                                            {stats.accuracy.toFixed(0)}<span className="text-base font-normal text-green-700 dark:text-green-300">%</span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="flex-1 bg-gray-100 dark:bg-gray-950 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-800">
                                {routeData && <ResultMap ref={resultMapRef} center={center} zoom={13} routeData={routeData} />}
                            </div>
                            <div className="flex justify-between mt-6">
                                <Button data-testid="result-back-button" variant="outline" onClick={() => setStep(variant === 'A' ? "mode" : "area")}>{t('result.back')}</Button>
                                <div className="flex gap-3">
                                    <Button data-testid="result-share-button" variant="outline" onClick={() => setIsShareModalOpen(true)}>{t('result.share')}</Button>
                                    <Button data-testid="result-download-button" onClick={handleDownload}>{t('result.download')}</Button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Share Modal */}
            {stats && mode && (
                <ShareModal
                    isOpen={isShareModalOpen}
                    onClose={() => setIsShareModalOpen(false)}
                    getMap={() => resultMapRef.current?.getMap() ?? null}
                    routeData={routeData}
                    stats={stats}
                    mode={mode}
                />
            )}

            {/* Hidden Test Controls for Automated Browser Testing */}
            {/* These elements are invisible but accessible to browser automation tools */}
            {/* They allow programmatic image loading without OS file picker dialogs */}
            <div style={{ display: 'none' }} data-testid="test-controls">
                {/* Test image loaders - images from public folder */}
                <button id="test-load-star" data-testid="test-load-star" onClick={() => loadTestImage("star.png")}>Load Star</button>
                <button id="test-load-heart" data-testid="test-load-heart" onClick={() => loadTestImage("heart-v2.png")}>Load Heart</button>
                <button id="test-load-circle" data-testid="test-load-circle" onClick={() => loadTestImage("circle.png")}>Load Circle</button>
                <button id="test-load-abc" data-testid="test-load-abc" onClick={() => loadTestImage("test-images/abc.png")}>Load ABC</button>
                <button id="test-load-christmas-tree" data-testid="test-load-christmas-tree" onClick={() => loadTestImage("examples/christmas-tree.png")}>Load Christmas Tree</button>
                <button id="test-load-snowflake" data-testid="test-load-snowflake" onClick={() => loadTestImage("examples/snowflake.png")}>Load Snowflake</button>
                <button id="test-load-gift-box" data-testid="test-load-gift-box" onClick={() => loadTestImage("examples/gift-box.png")}>Load Gift Box</button>

                {/* Status indicators for test automation */}
                <span data-testid="current-step" data-value={step}>{step}</span>
                <span data-testid="has-image" data-value={!!image}>{String(!!image)}</span>
                <span data-testid="has-shape-points" data-value={!!shapePoints}>{String(!!shapePoints)}</span>
                <span data-testid="selected-mode" data-value={mode || ""}>{mode || "none"}</span>
                <span data-testid="has-route" data-value={!!routeData}>{String(!!routeData)}</span>
                <span data-testid="ui-variant" data-value={variant}>{variant}</span>
            </div>
        </div>
    );
}
