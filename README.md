# directions-api-poc

A small Node/Express plus Vue proof of concept for looking up drive time between two latitude/longitude pairs with OpenRouteService.

## Stack

- Express backend in `server/`
- Vue 3 + Vite frontend in `client/`
- OpenRouteService API key loaded from `server/.env`
- MapTiler API key loaded from `client/.env`

## Getting started

1. Install dependencies:

	```bash
	npm install
	```

2. Create your env file:

	```bash
	cp server/.env.example server/.env
	```

3. Add your OpenRouteService API key to `server/.env`:

	```env
	ORS_API_KEY=your_key_here
	```

	4. Add your MapTiler API key to `client/.env`:

		```bash
		cp client/.env.example client/.env
		```

		```env
		VITE_MAPTILER_API_KEY=your_key_here
		```

	5. Start both apps:

	```bash
	npm run dev
	```

	6. Open the frontend at `http://localhost:5173`

The backend exposes `POST /api/route-time` and expects this payload:

```json
{
  "start": { "latitude": 42.3601, "longitude": -71.0589 },
  "end": { "latitude": 42.3736, "longitude": -71.1097 }
}
```

Successful responses look like:

```json
{
  "durationSeconds": 780.6,
  "durationMinutes": 13.01,
  "distanceMeters": 5800.2
}
```

## Docker / Coolify

This repo can be deployed to Coolify with either the root `Dockerfile` or the root `docker-compose.yml`.

### What the container does

- Builds the Vue frontend from `client/`
- Runs the Express backend from `server/`
- Serves the built frontend from the same Express process

### Local Docker test

Build the image:

```bash
docker build -t directions-api-poc .
```

Run it with your ORS key:

```bash
docker run --rm -p 3001:3001 -e ORS_API_KEY=your_ors_key_here directions-api-poc
```

Then open `http://localhost:3001`

### Local Docker Compose test

Run the stack with:

```bash
ORS_API_KEY=your_ors_key_here VITE_MAPTILER_API_KEY=your_maptiler_key_here docker compose up --build
```

Then open `http://localhost:3001`

### Coolify setup

If you use the Dockerfile flow in Coolify, use these settings:

- Build Pack: `Dockerfile`
- Dockerfile Location: `./Dockerfile`
- Port: `3001`
- Health Check Path: `/api/health`

If you use the Docker Compose flow in Coolify:

- Compose File: `./docker-compose.yml`
- Service: `directions-api-poc`
- Port: `3001`
- Health Check Path: `/api/health`

Add this environment variable in Coolify:

- `ORS_API_KEY=your_openrouteservice_key`
- `VITE_MAPTILER_API_KEY=your_maptiler_key`

Optional environment variable:

- `PORT=3001`

If you use the Dockerfile flow, make sure Coolify passes `VITE_MAPTILER_API_KEY` as a build argument too, since Vite injects it into the frontend at build time.

Coolify can expose the app on your chosen domain or generated URL. The frontend and API will both be served from the same container, so no extra reverse proxy setup is required.
