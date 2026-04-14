# directions-api-poc

A Node/Express + Vue 3 proof of concept with two map views:

- **Drive Time** (`/`) — enter two lat/long pairs, hit the backend, get driving duration and distance from OpenRouteService.
- **Relative Distance Map** (`/relative-distance-map`) — place a primary location and any number of comparison points; renders distance rings and straight-line distances using Leaflet with no backend call.

## Stack

| Layer | Tech |
|---|---|
| Backend | Node 20 / Express 4, ESM (`"type": "module"`) |
| Frontend | Vue 3 + Vite 6, Vue Router 4 |
| Maps | Leaflet 1.9 + MapTiler Streets tile layer |
| Routing API | OpenRouteService v2 (driving-car profile) |
| Dev runner | `concurrently` from the root workspace |

## Project structure

```
directions-api-poc/
├── package.json           # root workspace (server + client), dev/build scripts
├── server/
│   ├── package.json       # Express, cors, dotenv
│   ├── .env.example
│   └── src/index.js       # single-file Express server
└── client/
    ├── package.json       # Vue, Leaflet, vue-router, Vite
    ├── .env.example
    ├── vite.config.js
    └── src/
        ├── main.js
        ├── router/index.js
        ├── lib/maptiler.js        # tile layer factory, reads VITE_MAPTILER_API_KEY
        └── views/
            ├── DriveTimeView.vue
            └── RelativeDistanceMapView.vue
```

## Getting started

### 1. Install

```bash
npm install          # installs all workspaces from the root
```

### 2. Set up env files

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env
```

Fill in the keys:

`server/.env`
```env
ORS_API_KEY=your_openrouteservice_api_key_here
PORT=3001
```

`client/.env`
```env
VITE_MAPTILER_API_KEY=your_maptiler_api_key_here
```

### 3. Run in dev mode

```bash
npm run dev          # starts server (port 3001) and Vite dev server (port 5173) concurrently
```

Individual workspace scripts:

```bash
npm run dev:server   # node --watch server/src/index.js
npm run dev:client   # vite (client/)
```

### 4. Open the app

- Frontend dev server: `http://localhost:5173`
- Backend only: `http://localhost:3001`

In dev, Vite proxies `/api/*` requests to the Express server. In production (Docker), Express serves both.

## API

### `GET /api/health`

Returns `{ "ok": true }`.

### `POST /api/route-time`

Request body:

```json
{
  "start": { "latitude": 42.3601, "longitude": -71.0589 },
  "end":   { "latitude": 42.3736, "longitude": -71.1097 }
}
```

Success response:

```json
{
  "durationSeconds": 780.6,
  "durationMinutes": 13.01,
  "distanceMeters": 5800.2
}
```

Error responses follow `{ "error": "...", "details": "..." }`.

## Frontend notes

### Coordinate paste parsing

Both views accept a combined `lat,long` paste into the latitude field. Supported separators: `,` `/` `\` or a space. Pasting `42.3601,-71.0589` into the latitude input fills both latitude and longitude automatically.

### Relative Distance Map — state persistence

State (locations, ring increment, ring colors) is serialized to JSON and synced to:

- The URL query string (`?state=...`) with a 150 ms debounce — shareable links.
- `localStorage` key `relative-distance-map-state` — survives page reload without the query param.

Ring colors are stored as 8-character hex strings (`#rrggbbaa`). The color pickers use the native `<input type="color" alpha>` attribute.

## Scripts reference

| Command | What it does |
|---|---|
| `npm run dev` | Runs server + client in parallel |
| `npm run dev:server` | Express with `--watch` (auto-restarts on file change) |
| `npm run dev:client` | Vite HMR dev server |
| `npm run build` | Builds client to `client/dist/` |
| `npm run check:server` | `node --check` syntax check on the server entry |

## Docker / Coolify

The container builds the Vue frontend at image build time and serves it from the same Express process.

### Build args vs runtime env

| Variable | Where it's needed | How |
|---|---|---|
| `VITE_MAPTILER_API_KEY` | Build time (Vite injects into JS bundle) | Docker `ARG` / Coolify build arg |
| `ORS_API_KEY` | Runtime (Express reads `process.env`) | Docker `-e` / Coolify env var |
| `PORT` | Runtime (defaults to `3001`) | Optional |

### Local Docker

```bash
docker build \
  --build-arg VITE_MAPTILER_API_KEY=your_maptiler_key \
  -t directions-api-poc .

docker run --rm -p 3001:3001 \
  -e ORS_API_KEY=your_ors_key \
  directions-api-poc
```

Open `http://localhost:3001`.

### Local Docker Compose

```bash
ORS_API_KEY=your_ors_key \
VITE_MAPTILER_API_KEY=your_maptiler_key \
docker compose up --build
```

### Coolify — Dockerfile flow

- Build Pack: `Dockerfile`
- Port: `3001`
- Health Check Path: `/api/health`
- Environment variables:
  - `ORS_API_KEY` (runtime)
  - `VITE_MAPTILER_API_KEY` (must also be set as a **build arg** so Vite picks it up at image build time)

### Coolify — Docker Compose flow

- Compose File: `./docker-compose.yml`
- Service: `directions-api-poc`
- Port: `3001`
- Health Check Path: `/api/health`
- Same env vars as above.
