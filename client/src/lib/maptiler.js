// ─── MapTiler Tile Layer ──────────────────────────────────────────────────────
// The MapTiler API key is read from the Vite environment (VITE_MAPTILER_API_KEY
// in client/.env).  Vite bakes VITE_* variables into the compiled bundle at
// build time, which means the key is visible in the browser's source.  That is
// intentional: MapTiler tile keys are designed to be public (they can be
// restricted by domain in the MapTiler dashboard), unlike the server-side key
// which is kept in server/.env and never sent to the client.
import L from 'leaflet';

const mapTilerApiKey = import.meta.env.VITE_MAPTILER_API_KEY;

// Returns a configured Leaflet tile layer using the MapTiler Streets v2 style.
// tileSize 512 / zoomOffset -1 are required by MapTiler's high-DPI tile scheme:
// the server sends 512×512 tiles but Leaflet treats them as the equivalent of
// 256×256 tiles at one zoom level lower, keeping labels and icons the right size.
export function createBaseTileLayer() {
  if (!mapTilerApiKey) {
    throw new Error('VITE_MAPTILER_API_KEY is not configured. Add it to client/.env before loading the map.');
  }

  return L.tileLayer('https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key={key}', {
    key: mapTilerApiKey,
    tileSize: 512,
    zoomOffset: -1,
    maxZoom: 21,
    attribution:
      '&copy; <a href="https://www.maptiler.com/copyright/" target="_blank" rel="noreferrer">MapTiler</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>'
  });
}