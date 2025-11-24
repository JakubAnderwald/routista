"use client";

import { MapContainer, TileLayer, GeoJSON, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-defaulticon-compatibility/dist/leaflet-defaulticon-compatibility.css";
import "leaflet-defaulticon-compatibility";
import { useEffect } from "react";
import L from "leaflet";

import { GeoJsonObject } from "geojson";

interface ResultMapProps {
    center: [number, number];
    zoom: number;
    routeData: GeoJsonObject | null; // GeoJSON
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

export default function ResultMap({ center, zoom, routeData }: ResultMapProps) {
    return (
        <MapContainer center={center} zoom={zoom} scrollWheelZoom={true} className="h-full w-full">
            <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <MapUpdater center={center} zoom={zoom} routeData={routeData} />
            {routeData && <GeoJSON data={routeData} style={{ color: 'blue', weight: 4 }} />}
        </MapContainer>
    );
}
