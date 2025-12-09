"use client";

import { useState, useEffect, useRef } from "react";
import { useMap, useMapEvents, Circle } from "react-leaflet";
import dynamic from "next/dynamic";
import { useTranslations } from 'next-intl';

import { Search, Footprints, Bike, Car } from "lucide-react";
import { cn } from "@/lib/utils";

export type TransportMode = "foot-walking" | "cycling-regular" | "driving-car";

// Mode-specific route length presets with radius values
const MODE_PRESETS: Record<TransportMode, { id: string; radius: number; desc: string }[]> = {
    "foot-walking": [
        { id: "short", radius: 600, desc: "~2 km" },
        { id: "medium", radius: 1500, desc: "~5 km" },
        { id: "long", radius: 3000, desc: "~10 km" },
    ],
    "cycling-regular": [
        { id: "short", radius: 1500, desc: "~5 km" },
        { id: "medium", radius: 3000, desc: "~10 km" },
        { id: "long", radius: 6000, desc: "~20 km" },
    ],
    "driving-car": [
        { id: "short", radius: 3000, desc: "~10 km" },
        { id: "medium", radius: 6000, desc: "~20 km" },
        { id: "long", radius: 10000, desc: "~40 km" },
    ],
};

const TRANSPORT_MODES = [
    { id: "foot-walking" as TransportMode, icon: Footprints },
    { id: "cycling-regular" as TransportMode, icon: Bike },
    { id: "driving-car" as TransportMode, icon: Car },
] as const;

const PRESET_TOLERANCE = 50; // meters tolerance for matching preset

// Dynamic import for Map to avoid SSR issues
const Map = dynamic(() => import("@/components/Map"), {
    ssr: false,
    loading: () => <div className="w-full h-full bg-gray-100 animate-pulse" />
});

interface AreaSelectorProps {
    onAreaSelect: (center: [number, number], radius: number) => void;
    initialCenter?: [number, number];
    initialRadius?: number;
    // Mode props are optional - when not provided, mode selector is hidden (A/B test variant A)
    mode?: TransportMode | null;
    onModeChange?: (mode: TransportMode) => void;
}

interface RadarAddress {
    latitude: number;
    longitude: number;
    formattedAddress: string;
}

function MapController({ onCenterChange, isProgrammaticMoveRef }: { onCenterChange: (center: [number, number]) => void, isProgrammaticMoveRef: React.MutableRefObject<boolean> }) {
    const map = useMapEvents({
        moveend: () => {
            // Only update if this wasn't a programmatic move
            if (!isProgrammaticMoveRef.current) {
                const center = map.getCenter();
                onCenterChange([center.lat, center.lng]);
            }
            isProgrammaticMoveRef.current = false;
        },
    });
    return null;
}

function RecenterMap({ center, radius, isProgrammaticMoveRef }: { center: [number, number], radius: number, isProgrammaticMoveRef: React.MutableRefObject<boolean> }) {
    const map = useMap();
    useEffect(() => {
        // Calculate appropriate zoom level based on radius
        // Larger radius = smaller zoom level
        const zoom = Math.max(10, Math.min(18, Math.round(14 - Math.log2(radius / 1000))));

        // Mark this as a programmatic move
        isProgrammaticMoveRef.current = true;
        // Use setView instead of flyTo to remove animation
        map.setView(center, zoom);
    }, [center, radius, map, isProgrammaticMoveRef]);
    return null;
}

export function AreaSelector({ onAreaSelect, initialCenter = [51.505, -0.09], initialRadius = 1000, mode, onModeChange }: AreaSelectorProps) {
    const t = useTranslations('AreaSelector');
    const [center, setCenter] = useState<[number, number]>(initialCenter);
    const [radius, setRadius] = useState(initialRadius);
    const [searchQuery, setSearchQuery] = useState("");
    const [isSearching, setIsSearching] = useState(false);
    const [suggestions, setSuggestions] = useState<RadarAddress[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [blurTimeoutId, setBlurTimeoutId] = useState<NodeJS.Timeout | null>(null);
    const isProgrammaticMoveRef = useRef(false);

    // Get presets for current mode (default to walking if no mode selected)
    const currentPresets = MODE_PRESETS[mode || "foot-walking"];

    // Check if current radius matches a preset (within tolerance)
    const getActivePreset = () => {
        for (const preset of currentPresets) {
            if (Math.abs(radius - preset.radius) <= PRESET_TOLERANCE) {
                return preset.id;
            }
        }
        return null;
    };

    const activePreset = getActivePreset();

    // Whether to show mode selector (only when mode props are provided)
    const showModeSelector = mode !== undefined && onModeChange !== undefined;

    // When mode changes, adjust radius to equivalent preset if one was selected
    const handleModeChange = (newMode: TransportMode) => {
        if (!onModeChange) return;
        
        const oldPresets = MODE_PRESETS[mode || "foot-walking"];
        const newPresets = MODE_PRESETS[newMode];
        
        // Find which preset was active (if any)
        const activePresetIndex = oldPresets.findIndex(p => Math.abs(radius - p.radius) <= PRESET_TOLERANCE);
        
        if (activePresetIndex !== -1) {
            // Set radius to equivalent preset in new mode
            setRadius(newPresets[activePresetIndex].radius);
        }
        
        onModeChange(newMode);
    };

    useEffect(() => {
        onAreaSelect(center, radius);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [center, radius]);

    //Cleanup blur timeout on unmount
    useEffect(() => {
        return () => {
            if (blurTimeoutId) {
                clearTimeout(blurTimeoutId);
            }
        };
    }, [blurTimeoutId]);

    // Live search for suggestions
    useEffect(() => {
        const searchLocations = async () => {
            if (!searchQuery.trim()) {
                setSuggestions([]);
                setShowSuggestions(false);
                return;
            }

            setIsSearching(true);
            try {
                const response = await fetch('/api/radar/autocomplete', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ query: searchQuery }),
                });
                const data = await response.json();
                setSuggestions(data.addresses || []);
                setShowSuggestions(true);
            } catch (error) {
                console.error("Search failed", error);
                setSuggestions([]);
            } finally {
                setIsSearching(false);
            }
        };

        const timer = setTimeout(searchLocations, 300);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    const handleSuggestionClick = (suggestion: RadarAddress) => {
        // Clear any pending blur timeout
        if (blurTimeoutId) {
            clearTimeout(blurTimeoutId);
            setBlurTimeoutId(null);
        }

        const { latitude, longitude, formattedAddress } = suggestion;
        setCenter([latitude, longitude]);
        setSearchQuery(formattedAddress);
        setShowSuggestions(false);
    };

    const handleInputBlur = () => {
        // Delay hiding suggestions to allow click events to fire on mobile
        const timeoutId = setTimeout(() => {
            setShowSuggestions(false);
        }, 200);
        setBlurTimeoutId(timeoutId);
    };

    return (
        <div className="flex flex-col w-full h-full">
            {/* Map Container */}
            <div className="relative flex-1 min-h-0">
                <Map center={center} zoom={13} className="w-full h-full">
                    <MapController onCenterChange={setCenter} isProgrammaticMoveRef={isProgrammaticMoveRef} />
                    <RecenterMap center={center} radius={radius} isProgrammaticMoveRef={isProgrammaticMoveRef} />
                    <Circle center={center} radius={radius} pathOptions={{ color: 'blue', fillColor: 'blue', fillOpacity: 0.1 }} />
                </Map>

                {/* Search Bar - overlaid on map */}
                <div className="absolute top-4 left-4 right-4 md:left-1/2 md:right-auto md:-translate-x-1/2 md:w-96 z-[1000]">
                    <div className="relative">
                        <input
                            type="text"
                            placeholder="Search location (e.g. New York)"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onFocus={() => {
                                // Clear any pending blur timeout when refocusing
                                if (blurTimeoutId) {
                                    clearTimeout(blurTimeoutId);
                                    setBlurTimeoutId(null);
                                }
                                if (suggestions.length > 0) {
                                    setShowSuggestions(true);
                                }
                            }}
                            onBlur={handleInputBlur}
                            className="w-full pl-10 pr-4 py-3 rounded-xl shadow-lg border-none focus:ring-2 focus:ring-blue-500 outline-none bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm text-gray-900 dark:text-white placeholder:text-gray-500 dark:placeholder:text-gray-400"
                        />
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 w-5 h-5" />
                        {isSearching && (
                            <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                            </div>
                        )}

                        {/* Suggestions dropdown */}
                        {showSuggestions && suggestions.length > 0 && (
                            <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-gray-800 rounded-xl shadow-lg max-h-60 overflow-y-auto">
                                {suggestions.map((suggestion, index) => (
                                    <button
                                        key={index}
                                        type="button"
                                        onMouseDown={(e) => {
                                            // Prevent blur event from firing before click
                                            e.preventDefault();
                                            handleSuggestionClick(suggestion);
                                        }}
                                        onTouchStart={(e) => {
                                            // For mobile touch events
                                            e.preventDefault();
                                            handleSuggestionClick(suggestion);
                                        }}
                                        className="w-full text-left px-4 py-3 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors border-b border-gray-100 dark:border-gray-700 last:border-b-0 first:rounded-t-xl last:rounded-b-xl"
                                    >
                                        <p className="text-sm font-medium text-gray-900 dark:text-white">{suggestion.formattedAddress}</p>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Controls Panel - below map */}
            <div className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 p-4">
                <div className="flex flex-col md:flex-row md:items-start gap-4">
                    {/* Transportation Mode Selector - only shown when mode props provided (Variant B) */}
                    {showModeSelector && (
                        <div className="flex-1">
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                                {t('transportMode')}
                            </label>
                            <div className="grid grid-cols-3 gap-2">
                                {TRANSPORT_MODES.map((m) => {
                                    const Icon = m.icon;
                                    const isSelected = mode === m.id;
                                    return (
                                        <button
                                            key={m.id}
                                            onClick={() => handleModeChange(m.id)}
                                            className={cn(
                                                "flex items-center justify-center gap-2 py-2 px-3 rounded-lg border-2 transition-all",
                                                isSelected
                                                    ? "border-blue-600 bg-blue-50 dark:bg-blue-950/30"
                                                    : "border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700"
                                            )}
                                        >
                                            <Icon className={cn(
                                                "w-4 h-4",
                                                isSelected ? "text-blue-600 dark:text-blue-400" : "text-gray-600 dark:text-gray-300"
                                            )} />
                                            <span className={cn(
                                                "text-sm font-semibold",
                                                isSelected ? "text-blue-600 dark:text-blue-400" : "text-gray-700 dark:text-gray-200"
                                            )}>
                                                {t(m.id)}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Route Length Presets */}
                    <div className="flex-1">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                            {t('routeLength')}
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                            {currentPresets.map((preset) => {
                                const isActive = activePreset === preset.id;
                                return (
                                    <button
                                        key={preset.id}
                                        onClick={() => setRadius(preset.radius)}
                                        className={cn(
                                            "flex flex-col items-center py-2 px-3 rounded-lg border-2 transition-all text-center",
                                            isActive
                                                ? "border-blue-600 bg-blue-50 dark:bg-blue-950/30"
                                                : "border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700"
                                        )}
                                    >
                                        <span className={cn(
                                            "text-sm font-semibold",
                                            isActive ? "text-blue-600 dark:text-blue-400" : "text-gray-700 dark:text-gray-200"
                                        )}>
                                            {t(preset.id)}
                                        </span>
                                        <span className={cn(
                                            "text-xs",
                                            isActive ? "text-blue-500 dark:text-blue-400" : "text-gray-500 dark:text-gray-400"
                                        )}>
                                            {preset.desc}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Fine-tune Slider */}
                    <div className="flex-1">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                            {t('fineTune')}: {Math.round(radius)} {t('meters')}
                        </label>
                        <input
                            type="range"
                            min="500"
                            max="10000"
                            step="100"
                            value={radius}
                            onChange={(e) => setRadius(Number(e.target.value))}
                            className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
