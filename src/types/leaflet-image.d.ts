declare module 'leaflet-image' {
    import type L from 'leaflet';
    
    type LeafletImageCallback = (err: Error | null, canvas: HTMLCanvasElement) => void;
    
    function leafletImage(map: L.Map, callback: LeafletImageCallback): void;
    
    export default leafletImage;
}

