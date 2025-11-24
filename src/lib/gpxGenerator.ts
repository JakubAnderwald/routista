import { FeatureCollection } from "geojson";

export function generateGPX(geoJson: FeatureCollection): string {
    if (!geoJson || !geoJson.features) return "";

    let gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Routista" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>Routista Route</name>
    <trkseg>
`;

    // Extract coordinates from GeoJSON
    // Assuming FeatureCollection with LineString features
    for (const feature of geoJson.features) {
        if (feature.geometry.type === "LineString") {
            for (const coord of feature.geometry.coordinates) {
                // GeoJSON is [lng, lat], GPX expects lat, lon attributes
                gpx += `      <trkpt lat="${coord[1]}" lon="${coord[0]}"></trkpt>\n`;
            }
        }
    }

    gpx += `    </trkseg>
  </trk>
</gpx>`;

    return gpx;
}

export function downloadGPX(gpxContent: string, filename: string = "route.gpx") {
    const blob = new Blob([gpxContent], { type: "application/gpx+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
