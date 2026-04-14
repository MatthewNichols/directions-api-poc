import L from 'leaflet';

const mapTilerApiKey = import.meta.env.VITE_MAPTILER_API_KEY;

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