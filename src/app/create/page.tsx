"use client";

import { useState } from "react";
import { ImageUpload } from "@/components/ImageUpload";
import { ModeSelector, TransportMode } from "@/components/ModeSelector";
import { Button } from "@/components/ui/Button";
import dynamic from "next/dynamic";
import { extractShapeFromImage } from "@/lib/imageProcessing";
import { scalePointsToGeo, calculateRouteLength, calculateRouteAccuracy } from "@/lib/geoUtils";
import { generateGPX, downloadGPX } from "@/lib/gpxGenerator";
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

// Dynamic import for Map to avoid SSR issues
const Map = dynamic(() => import("@/components/Map"), {
    ssr: false,
    loading: () => <div className="w-full h-full bg-gray-100 animate-pulse flex items-center justify-center text-gray-400">Loading Map...</div>
});

import { FeatureCollection } from "geojson";

export default function CreatePage() {
    const [step, setStep] = useState<"upload" | "area" | "mode" | "processing" | "result">("upload");
    const [image, setImage] = useState<File | null>(null);
    const [center, setCenter] = useState<[number, number]>([51.505, -0.09]);
    const [radius, setRadius] = useState(1000);
    const [mode, setMode] = useState<TransportMode | null>(null);
    const [routeData, setRouteData] = useState<FeatureCollection | null>(null);
    const [shapePoints, setShapePoints] = useState<[number, number][] | null>(null);
    const [stats, setStats] = useState<{ length: number; accuracy: number } | null>(null);

    const handleImageSelect = async (file: File) => {
        setImage(file);
        try {
            const points = await extractShapeFromImage(file);
            setShapePoints(points);
        } catch (e) {
            console.error("Failed to extract shape", e);
            alert("Could not extract shape from image. Please try another image.");
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

    const handleAreaSelect = (c: [number, number], r: number) => {
        setCenter(c);
        setRadius(r);
    };

    const handleGenerate = async () => {
        if (!shapePoints || !mode) return;

        setStep("processing");

        try {
            // 1. Scale points
            const geoPoints = scalePointsToGeo(shapePoints, center, radius);

            // 2. Generate route on client-side
            const { generateRoute } = await import("@/lib/routeGenerator");
            const data = await generateRoute({ coordinates: geoPoints, mode });
            setRouteData(data);

            // Calculate stats
            const length = calculateRouteLength(data);
            const accuracy = calculateRouteAccuracy(geoPoints, data, radius);
            setStats({ length, accuracy });

            setStep("result");

        } catch (error) {
            console.error(error);
            alert("Error generating route. Please try again.");
            setStep("mode");
        }
    };

    const handleDownload = () => {
        if (routeData) {
            const gpx = generateGPX(routeData);
            downloadGPX(gpx, "routista-route.gpx");
        }
    };

    return (
        <div className="container mx-auto px-4 py-8 min-h-[calc(100vh-64px)]">
            <div className="max-w-4xl mx-auto">
                {/* Progress Steps */}
                <div className="flex items-center justify-between mb-12 px-4">
                    {["Upload", "Area", "Mode", "Result"].map((s, i) => {
                        const stepIndex = ["upload", "area", "mode", "result"].indexOf(s.toLowerCase());
                        const currentStepIndex = ["upload", "area", "mode", "processing", "result"].indexOf(step);
                        const active = currentStepIndex >= stepIndex;

                        return (
                            <div key={s} className="flex flex-col items-center relative z-10">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold mb-2 transition-colors ${active ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-500"}`}>
                                    {i + 1}
                                </div>
                                <span className={`text-sm font-medium ${active ? "text-blue-600" : "text-gray-500"}`}>{s}</span>
                            </div>
                        );
                    })}
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 md:p-8">
                    {step === "upload" && (
                        <div className="flex flex-col items-center">
                            <h2 className="text-2xl font-bold mb-2">Upload Your Shape</h2>
                            <p className="text-gray-500 mb-8 text-center">
                                Choose an image with a clear shape (e.g., a heart, star, or logo).
                            </p>
                            <ImageUpload onImageSelect={handleImageSelect} className="max-w-xl mb-8" />
                            <div className="flex justify-end w-full max-w-xl">
                                <Button
                                    disabled={!image || !shapePoints}
                                    onClick={() => setStep("area")}
                                >
                                    Next: Select Area
                                </Button>
                            </div>
                        </div>
                    )}

                    {step === "area" && (
                        <div className="flex flex-col h-[600px]">
                            <h2 className="text-2xl font-bold mb-4">Select Area</h2>
                            <div className="flex-1 bg-gray-100 rounded-xl overflow-hidden relative border border-gray-200">
                                <AreaSelector
                                    onAreaSelect={handleAreaSelect}
                                    initialCenter={center}
                                    initialRadius={radius}
                                />
                            </div>
                            <div className="flex justify-between mt-6">
                                <Button variant="outline" onClick={() => setStep("upload")}>Back</Button>
                                <Button onClick={() => setStep("mode")}>Next: Choose Mode</Button>
                            </div>
                        </div>
                    )}

                    {step === "mode" && (
                        <div className="flex flex-col items-center">
                            <h2 className="text-2xl font-bold mb-8">Choose Transportation Mode</h2>
                            <ModeSelector selectedMode={mode} onSelect={setMode} />
                            <div className="flex justify-between w-full mt-8 max-w-3xl">
                                <Button variant="outline" onClick={() => setStep("area")}>Back</Button>
                                <Button disabled={!mode} onClick={handleGenerate}>Generate Route</Button>
                            </div>
                        </div>
                    )}

                    {step === "processing" && (
                        <div className="flex flex-col items-center py-20">
                            <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-6"></div>
                            <h2 className="text-xl font-semibold mb-2">Crunching the numbers...</h2>
                            <p className="text-gray-500">Matching your shape to the road network.</p>
                        </div>
                    )}

                    {step === "result" && (
                        <div className="flex flex-col h-[600px]">
                            <h2 className="text-2xl font-bold mb-4">Your Route</h2>

                            {stats && (
                                <div className="grid grid-cols-2 gap-4 mb-4">
                                    <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                                        <div className="text-sm text-blue-600 font-medium mb-1">Route Length</div>
                                        <div className="text-2xl font-bold text-blue-900">
                                            {(stats.length / 1000).toFixed(2)} <span className="text-base font-normal text-blue-700">km</span>
                                        </div>
                                    </div>
                                    <div className="bg-green-50 p-4 rounded-xl border border-green-100">
                                        <div className="text-sm text-green-600 font-medium mb-1">Shape Accuracy</div>
                                        <div className="text-2xl font-bold text-green-900">
                                            {stats.accuracy.toFixed(0)}<span className="text-base font-normal text-green-700">%</span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="flex-1 bg-gray-100 rounded-xl overflow-hidden border border-gray-200">
                                {routeData && <ResultMap center={center} zoom={13} routeData={routeData} />}
                            </div>
                            <div className="flex justify-between mt-6">
                                <Button variant="outline" onClick={() => setStep("mode")}>Back</Button>
                                <Button onClick={handleDownload}>Download GPX</Button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Hidden Test Controls for Automated Browser Testing */}
            <div style={{ display: 'none' }}>
                <button id="test-load-star" onClick={() => loadTestImage("star.png")}>Load Star</button>
                <button id="test-load-heart" onClick={() => loadTestImage("heart.png")}>Load Heart</button>
                <button id="test-load-circle" onClick={() => loadTestImage("circle.png")}>Load Circle</button>
            </div>
        </div>
    );
}
