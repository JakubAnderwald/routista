"use client";

import { useState, useEffect } from "react";
import { useMap, useMapEvents, Circle } from "react-leaflet";
import { Button } from "@/components/ui/Button";
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

function MapController({ onCenterChange }: { onCenterChange: (center: [number, number]) => void }) {
    const map = useMapEvents({
        moveend: () => {
            const center = map.getCenter();
            onCenterChange([center.lat, center.lng]);
        },
    });
    return null;
}

function RecenterMap({ center }: { center: [number, number] }) {
    const map = useMap();
    useEffect(() => {
        map.flyTo(center, map.getZoom());
    }, [center, map]);
    return null;
}

export function AreaSelector({ onAreaSelect, initialCenter = [51.505, -0.09], initialRadius = 1000 }: AreaSelectorProps) {
    const [center, setCenter] = useState<[number, number]>(initialCenter);
    const [radius, setRadius] = useState(initialRadius);
    const [searchQuery, setSearchQuery] = useState("");
    const [isSearching, setIsSearching] = useState(false);

    useEffect(() => {
        onAreaSelect(center, radius);
    }, [center, radius, onAreaSelect]);

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!searchQuery.trim()) return;

        setIsSearching(true);
        try {
            const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}`);
            const data = await response.json();

            if (data && data.length > 0) {
                const { lat, lon } = data[0];
                setCenter([parseFloat(lat), parseFloat(lon)]);
            } else {
                alert("Location not found");
            }
        } catch (error) {
            console.error("Search failed", error);
            alert("Search failed. Please try again.");
        } finally {
            setIsSearching(false);
        }
    };

    return (
        <div className="relative w-full h-full">
            <Map center={center} zoom={13} className="w-full h-full">
                <MapController onCenterChange={setCenter} />
                <RecenterMap center={center} />
                <Circle center={center} radius={radius} pathOptions={{ color: 'blue', fillColor: 'blue', fillOpacity: 0.1 }} />
            </Map>

            {/* Search Bar */}
            <div className="absolute top-4 left-4 right-4 md:left-1/2 md:right-auto md:-translate-x-1/2 md:w-96 z-[1000]">
                <form onSubmit={handleSearch} className="relative">
                    <input
                        type="text"
                        placeholder="Search location (e.g. New York)"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 rounded-xl shadow-lg border-none focus:ring-2 focus:ring-blue-500 outline-none bg-white/90 backdrop-blur-sm"
                    />
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <Button
                        type="submit"
                        size="sm"
                        className="absolute right-2 top-1/2 -translate-y-1/2 h-8"
                        disabled={isSearching}
                    >
                        {isSearching ? "..." : "Go"}
                    </Button>
                </form>
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
