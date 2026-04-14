import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 3001);
const orsApiKey = process.env.ORS_API_KEY;
const mapTilerApiKey = process.env.MAPTILER_API_KEY;
const geoLookupCountry = process.env.GEO_LOOKUP_COUNTRY || '';
const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFilePath);
const clientDistPath = path.resolve(currentDirectory, '../../client/dist');

app.use(cors());
app.use(express.json());

function parseCoordinate(value, label) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    throw new Error(`${label} must be a valid number.`);
  }

  return numericValue;
}

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

app.get('/api/health', (_request, response) => {
  response.json({ ok: true });
});

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

app.use(express.static(clientDistPath));

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

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
