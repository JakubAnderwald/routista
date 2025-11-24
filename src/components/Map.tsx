"use client";


import { MapContainer, TileLayer } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-defaulticon-compatibility/dist/leaflet-defaulticon-compatibility.css";
import "leaflet-defaulticon-compatibility";

interface MapProps {
    center?: [number, number];
    zoom?: number;
    className?: string;
    children?: React.ReactNode;
}

export default function Map({ center = [51.505, -0.09], zoom = 13, className = "h-full w-full", children }: MapProps) {
    return (
        <MapContainer center={center} zoom={zoom} scrollWheelZoom={true} className={className}>
            <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {children}
        </MapContainer>
    );
}
