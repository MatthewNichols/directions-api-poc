// ─── Imports ────────────────────────────────────────────────────────────────
// cors     – allows the Vite dev server (port 5173) to call this Express server
//            (port 3001) without browser same-origin blocks. Not needed in
//            production because Express serves the built client itself.
// dotenv   – loads key=value pairs from server/.env into process.env at startup.
// express  – minimal Node web framework; provides routing, middleware, and
//            static-file serving.
// path / fileURLToPath – Node builtins used to locate the built client assets
//            relative to this file. Because the project uses ES modules
//            ("type":"module" in package.json) the usual __dirname global is not
//            available, so we reconstruct it from import.meta.url.
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Load environment variables from server/.env (ORS_API_KEY, MAPTILER_API_KEY, etc.)
dotenv.config();

// ─── App & Config ────────────────────────────────────────────────────────────
const app = express();

// Port can be overridden at runtime (e.g. inside Docker). Defaults to 3001.
const port = Number(process.env.PORT || 3001);

// Third-party API keys read once at startup. Endpoints check for their presence
// before making outbound requests so callers get a clear 500 rather than a
// cryptic auth failure from the upstream service.
const orsApiKey = process.env.ORS_API_KEY;
const mapTilerApiKey = process.env.MAPTILER_API_KEY;

// Optional ISO 3166-1 alpha-2 country code (e.g. "US") that narrows geocoding
// results to a single country. Leave blank to search globally.
const geoLookupCountry = process.env.GEO_LOOKUP_COUNTRY || '';

// Reconstruct __dirname for ES-module context so we can resolve the path to the
// pre-built Vue client bundle that Express will serve in production.
const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFilePath);
const clientDistPath = path.resolve(currentDirectory, '../../client/dist');

// ─── Middleware ───────────────────────────────────────────────────────────────
// Allow cross-origin requests (needed during local development).
app.use(cors());
// Parse incoming JSON request bodies so route handlers can read req.body.
app.use(express.json());

// ─── Validation Helpers ───────────────────────────────────────────────────────

// Converts a raw value (string from query params, number from JSON body, etc.)
// to a finite JavaScript number. Throws a descriptive error if conversion fails
// so callers can surface a useful 400 message to the client.
function parseCoordinate(value, label) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    throw new Error(`${label} must be a valid number.`);
  }

  return numericValue;
}

// Validates a { latitude, longitude } object and returns both values as numbers.
// Used by the /api/route-time handler to validate the start and end coordinates
// before sending them to OpenRouteService.
function validateLatLongPair(input, prefix) {
  if (!input || typeof input !== 'object') {
    throw new Error(`${prefix} coordinates are required.`);
  }

  const latitude = parseCoordinate(input.latitude, `${prefix} latitude`);
  const longitude = parseCoordinate(input.longitude, `${prefix} longitude`);

  if (latitude < -90 || latitude > 90) {
    throw new Error(`${prefix} latitude must be between -90 and 90.`);
  }

  if (longitude < -180 || longitude > 180) {
    throw new Error(`${prefix} longitude must be between -180 and 180.`);
  }

  return { latitude, longitude };
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// GET /api/geocode?q=<search text>
// Proxies a forward-geocoding request to MapTiler's geocoding API and returns
// the raw GeoJSON FeatureCollection response. The client uses the results to
// let users search for place names instead of typing raw coordinates.
//
// Why proxy instead of calling MapTiler directly from the browser?
//   Keeping the API key on the server prevents it from being visible in the
//   compiled JavaScript bundle that browsers download.
app.get('/api/geocode', async (request, response) => {
  if (!mapTilerApiKey) {
    response.status(500).json({
      error: 'MAPTILER_API_KEY is not configured. Add it to server/.env before calling this endpoint.'
    });
    return;
  }

  const query = typeof request.query.q === 'string' ? request.query.q.trim() : '';

  if (!query) {
    response.status(400).json({ error: 'Query parameter "q" is required.' });
    return;
  }

  const url = new URL(`https://api.maptiler.com/geocoding/${encodeURIComponent(query)}.json`);
  url.searchParams.set('key', mapTilerApiKey);

  if (geoLookupCountry) {
    url.searchParams.set('country', geoLookupCountry.toLowerCase());
  }

  try {
    const geocodeResponse = await fetch(url.toString());

    if (!geocodeResponse.ok) {
      const errorText = await geocodeResponse.text();

      response.status(geocodeResponse.status).json({
        error: 'MapTiler geocoding request failed.',
        details: errorText
      });
      return;
    }

    const data = await geocodeResponse.json();

    response.json(data);
  } catch (error) {
    response.status(500).json({
      error: 'Unable to fetch geocoding results.',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/health
// Lightweight liveness check. Used by Docker / Coolify to confirm the process
// is up and accepting connections before routing traffic to it.
app.get('/api/health', (_request, response) => {
  response.json({ ok: true });
});

// POST /api/route-time
// Accepts a start and end coordinate pair, calls the OpenRouteService (ORS)
// driving-car directions endpoint, and returns a simplified summary with
// duration (seconds + minutes) and distance (meters).
//
// Request body: { start: { latitude, longitude }, end: { latitude, longitude } }
// Success response: { durationSeconds, durationMinutes, distanceMeters }
//
// NOTE: ORS expects coordinates as [longitude, latitude] (GeoJSON order),
//       which is the reverse of the more common "lat, long" convention.
app.post('/api/route-time', async (request, response) => {
  if (!orsApiKey) {
    response.status(500).json({
      error: 'ORS_API_KEY is not configured. Add it to server/.env before calling this endpoint.'
    });
    return;
  }

  let start;
  let end;

  try {
    start = validateLatLongPair(request.body.start, 'Start');
    end = validateLatLongPair(request.body.end, 'End');
  } catch (error) {
    response.status(400).json({ error: error.message });
    return;
  }

  try {
    const orsResponse = await fetch('https://api.openrouteservice.org/v2/directions/driving-car', {
      method: 'POST',
      headers: {
        Authorization: orsApiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        coordinates: [
          [start.longitude, start.latitude],
          [end.longitude, end.latitude]
        ]
      })
    });

    if (!orsResponse.ok) {
      const errorText = await orsResponse.text();

      response.status(orsResponse.status).json({
        error: 'OpenRouteService request failed.',
        details: errorText
      });
      return;
    }

    const data = await orsResponse.json();
    const summary = data?.routes?.[0]?.summary;

    if (!summary) {
      response.status(502).json({ error: 'OpenRouteService response did not include a route summary.' });
      return;
    }

    response.json({
      durationSeconds: summary.duration,
      durationMinutes: Number((summary.duration / 60).toFixed(2)),
      distanceMeters: summary.distance
    });
  } catch (error) {
    response.status(500).json({
      error: 'Unable to fetch route information.',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// ─── Static Files & SPA Fallback ─────────────────────────────────────────────
// Serve the pre-built Vue app (client/dist/) as static files. In development,
// Vite runs its own dev server and this middleware is never reached for the
// frontend. In production (Docker), Express serves both the API and the UI.
app.use(express.static(clientDistPath));

// SPA fallback: for any non-/api/ GET request that doesn't match a static file,
// return the Vue app's index.html so that client-side routing (Vue Router)
// can handle the path. Without this, a hard refresh on e.g. /relative-distance-map
// would return a 404 from Express instead of loading the app.
app.get('*', (request, response, next) => {
  if (request.path.startsWith('/api/')) {
    next();
    return;
  }

  response.sendFile(path.join(clientDistPath, 'index.html'), (error) => {
    if (error) {
      next();
    }
  });
});

// ─── Start Server ─────────────────────────────────────────────────────────────
app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
