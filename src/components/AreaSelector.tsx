"use client";

import { useState, useEffect } from "react";
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

interface NominatimResult {
    lat: string;
    lon: string;
    display_name: string;
}

function MapController({ onCenterChange }: { onCenterChange: (center: [number, number]) => void }) {
    const map = useMapEvents({
        moveend: () => {
            const center = map.getCenter();
            onCenterChange([center.lat, center.lng]);
        },
    });
    return null;
}

function RecenterMap({ center, radius }: { center: [number, number], radius: number }) {
    const map = useMap();
    useEffect(() => {
        // Calculate appropriate zoom level based on radius
        // Larger radius = smaller zoom level
        const zoom = Math.max(10, Math.min(18, Math.round(14 - Math.log2(radius / 1000))));

        // Use setView instead of flyTo to remove animation
        map.setView(center, zoom);
    }, [center, radius, map]);
    return null;
}

export function AreaSelector({ onAreaSelect, initialCenter = [51.505, -0.09], initialRadius = 1000 }: AreaSelectorProps) {
    const [center, setCenter] = useState<[number, number]>(initialCenter);
    const [radius, setRadius] = useState(initialRadius);
    const [searchQuery, setSearchQuery] = useState("");
    const [isSearching, setIsSearching] = useState(false);
    const [suggestions, setSuggestions] = useState<NominatimResult[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);

    useEffect(() => {
        onAreaSelect(center, radius);
    }, [center, radius, onAreaSelect]);

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
                const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=5`);
                const data = await response.json();
                setSuggestions(data || []);
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

    const handleSuggestionClick = (suggestion: NominatimResult) => {
        const { lat, lon, display_name } = suggestion;
        setCenter([parseFloat(lat), parseFloat(lon)]);
        setSearchQuery(display_name);
        setShowSuggestions(false);
    };

    return (
        <div className="relative w-full h-full">
            <Map center={center} zoom={13} className="w-full h-full">
                <MapController onCenterChange={setCenter} />
                <RecenterMap center={center} radius={radius} />
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
                        onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                        className="w-full pl-10 pr-4 py-3 rounded-xl shadow-lg border-none focus:ring-2 focus:ring-blue-500 outline-none bg-white/90 backdrop-blur-sm"
                    />
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                    {isSearching && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                        </div>
                    )}

                    {/* Suggestions dropdown */}
                    {showSuggestions && suggestions.length > 0 && (
                        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-lg max-h-60 overflow-y-auto">
                            {suggestions.map((suggestion, index) => (
                                <button
                                    key={index}
                                    type="button"
                                    onClick={() => handleSuggestionClick(suggestion)}
                                    className="w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors border-b border-gray-100 last:border-b-0 first:rounded-t-xl last:rounded-b-xl"
                                >
                                    <p className="text-sm font-medium text-gray-900">{suggestion.display_name}</p>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <div className="absolute bottom-6 left-6 right-6 bg-white/90 backdrop-blur-md p-4 rounded-xl shadow-lg z-[1000]">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                    Area Size: {Math.round(radius)} meters
                </label>
                <input
                    type="range"
                    min="500"
                    max="10000"
                    step="100"
                    value={radius}
                    onChange={(e) => setRadius(Number(e.target.value))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
                <p className="text-xs text-gray-500 mt-2">
                    Drag the map to position the center. Adjust the slider to change the area size.
                </p>
            </div>
        </div>
    );
}
