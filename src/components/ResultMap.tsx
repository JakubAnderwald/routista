"use client";

import { MapContainer, TileLayer, GeoJSON, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-defaulticon-compatibility/dist/leaflet-defaulticon-compatibility.css";
import "leaflet-defaulticon-compatibility";
import { useEffect, useRef, useImperativeHandle, forwardRef } from "react";
import L from "leaflet";

import { GeoJsonObject } from "geojson";

interface ResultMapProps {
    center: [number, number];
    zoom: number;
    routeData: GeoJsonObject | null; // GeoJSON
}

export interface ResultMapRef {
    getMap: () => L.Map | null;
}

// Internal component to capture map instance
function MapInstanceCapture({ onMapReady }: { onMapReady: (map: L.Map) => void }) {
    const map = useMap();
    
    useEffect(() => {
        onMapReady(map);
    }, [map, onMapReady]);
    
    return null;
}

function MapUpdater({ center, zoom, routeData }: ResultMapProps) {
    const map = useMap();

    useEffect(() => {
        map.setView(center, zoom);
    }, [center, zoom, map]);

    useEffect(() => {
        if (routeData) {
            const geoJsonLayer = L.geoJSON(routeData);
            const bounds = geoJsonLayer.getBounds();
            if (bounds.isValid()) {
                map.fitBounds(bounds, { padding: [50, 50] });
            }
        }
    }, [routeData, map]);

    return null;
}

const ResultMap = forwardRef<ResultMapRef, ResultMapProps>(function ResultMap(
    { center, zoom, routeData },
    ref
) {
    const mapInstanceRef = useRef<L.Map | null>(null);
    
    // Expose getMap method to parent
    useImperativeHandle(ref, () => ({
        getMap: () => mapInstanceRef.current,
    }), []);
    
    // Force re-mount when center changes to avoid some Leaflet synchronization issues
    const mapKey = `${center[0]}-${center[1]}-${zoom}`;

    return (
        <MapContainer
            key={mapKey}
            center={center}
            zoom={zoom}
            scrollWheelZoom={true}
            className="h-full w-full dark:invert dark:hue-rotate-180 dark:brightness-95 dark:contrast-90"
        >
            <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <MapInstanceCapture onMapReady={(map) => { mapInstanceRef.current = map; }} />
            <MapUpdater center={center} zoom={zoom} routeData={routeData} />
            {routeData && <GeoJSON data={routeData} style={{ color: 'blue', weight: 4 }} />}
        </MapContainer>
    );
});

export default ResultMap;
