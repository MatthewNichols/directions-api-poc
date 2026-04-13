# directions-api-poc

A small Node/Express plus Vue proof of concept for looking up drive time between two latitude/longitude pairs with OpenRouteService.

## Stack

- Express backend in `server/`
- Vue 3 + Vite frontend in `client/`
- OpenRouteService API key loaded from `server/.env`

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

4. Start both apps:

	```bash
	npm run dev
	```

5. Open the frontend at `http://localhost:5173`

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
