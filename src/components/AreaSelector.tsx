"use client";

import { useState, useEffect, useRef } from "react";
import { useMap, useMapEvents, Circle } from "react-leaflet";
import dynamic from "next/dynamic";

import { Search } from "lucide-react";

// Dynamic import for Map to avoid SSR issues
const Map = dynamic(() => import("@/components/Map"), {
    ssr: false,
    loading: () => <div className="w-full h-full bg-gray-100 animate-pulse" />
});

interface AreaSelectorProps {
    onAreaSelect: (center: [number, number], radius: number) => void;
    initialCenter?: [number, number];
    initialRadius?: number;
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

export function AreaSelector({ onAreaSelect, initialCenter = [51.505, -0.09], initialRadius = 1000 }: AreaSelectorProps) {
    const [center, setCenter] = useState<[number, number]>(initialCenter);
    const [radius, setRadius] = useState(initialRadius);
    const [searchQuery, setSearchQuery] = useState("");
    const [isSearching, setIsSearching] = useState(false);
    const [suggestions, setSuggestions] = useState<RadarAddress[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [blurTimeoutId, setBlurTimeoutId] = useState<NodeJS.Timeout | null>(null);
    const isProgrammaticMoveRef = useRef(false);

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
                const radarKey = process.env.NEXT_PUBLIC_RADAR_LIVE_PK || process.env.NEXT_PUBLIC_RADAR_TEST_PK;
                const response = await fetch(`https://api.radar.io/v1/search/autocomplete?query=${encodeURIComponent(searchQuery)}&limit=5&publishableKey=${radarKey}`);
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
        <div className="relative w-full h-full">
            <Map center={center} zoom={13} className="w-full h-full">
                <MapController onCenterChange={setCenter} isProgrammaticMoveRef={isProgrammaticMoveRef} />
                <RecenterMap center={center} radius={radius} isProgrammaticMoveRef={isProgrammaticMoveRef} />
                <Circle center={center} radius={radius} pathOptions={{ color: 'blue', fillColor: 'blue', fillOpacity: 0.1 }} />
            </Map>

            {/* Search Bar */}
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

            <div className="absolute bottom-6 left-6 right-6 bg-white/90 dark:bg-gray-800/90 backdrop-blur-md p-4 rounded-xl shadow-lg z-[1000]">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                    Area Size: {Math.round(radius)} meters
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
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    Drag the map to position the center. Adjust the slider to change the area size.
                </p>
            </div>
        </div>
    );
}
