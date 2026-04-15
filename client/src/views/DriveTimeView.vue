<script setup>
// ─── DriveTimeView ────────────────────────────────────────────────────────────
// Lets users enter a start and end coordinate pair, calls the backend's
// POST /api/route-time endpoint, and displays the driving duration and total
// distance.  A live Leaflet map previews the entered points as soon as valid
// coordinates are present.
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';

import AddressLookupDialog from '../components/AddressLookupDialog.vue';
import { createBaseTileLayer } from '../lib/maptiler';

// ─── Form State ───────────────────────────────────────────────────────────────
// Held as a reactive object so the template can bind to individual fields and
// the computed coordinate parsers can react to any change.
const form = reactive({
  startLatitude: '',
  startLongitude: '',
  endLatitude: '',
  endLongitude: ''
});

const result = ref(null);
const errorMessage = ref('');
const isSubmitting = ref(false);
// Template ref for the map container <div>.
const mapElement = ref(null);

// ─── Address Lookup Dialog ────────────────────────────────────────────────────
// addressDialogTarget tracks which coordinate group ('start' or 'end') opened
// the dialog so the selected address can be written to the correct form fields.
const addressDialog = ref(null);
const addressDialogTarget = ref('');

function openAddressDialog(prefix) {
  addressDialogTarget.value = prefix;
  addressDialog.value.open();
}

// Called when the user picks a result inside AddressLookupDialog.
function onAddressSelect({ latitude, longitude }) {
  if (addressDialogTarget.value === 'start') {
    form.startLatitude = String(latitude);
    form.startLongitude = String(longitude);
  } else {
    form.endLatitude = String(latitude);
    form.endLongitude = String(longitude);
  }
}

// ─── Leaflet Map Instances ────────────────────────────────────────────────────
// Declared outside Vue's reactivity system because Leaflet manages its own
// internal state.  Wrapping map objects in ref() or reactive() can cause
// infinite re-render loops.
let map;
let mapFeatures;

// ─── Coordinate Parsing Utilities ─────────────────────────────────────────────
// These helpers are shared between the latitude input handler and the
// paste handler.  They allow users to paste a combined "lat,long" string
// (or lat/long, lat\long, or "lat long") into the latitude field and have both
// fields filled automatically.

// Trims whitespace from a single coordinate segment after splitting.
function normalizeCoordinateSegment(value) {
  return value.trim();
}

// Converts a string to a finite number, returning null on failure.
// Returning null (rather than NaN) lets callers use simple null-checks.
function parseCoordinate(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }

  const numericValue = Number(value);

  return Number.isFinite(numericValue) ? numericValue : null;
}

// Tries to interpret a string as a "lat separator long" pair.
// Accepted separators: comma, forward-slash, backslash, or a single space.
// Returns { latitude, longitude } as strings (preserving the original text so
// the input fields reflect what the user pasted), or null if the value doesn't
// match the expected two-segment format.
function extractCoordinatePair(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return null;
  }

  const normalizedValue = trimmedValue.replace(/\s*([,\\/])\s*/g, '$1').replace(/\s+/g, ' ');
  const segments = normalizedValue.split(/[,\\/ ]/).map(normalizeCoordinateSegment).filter(Boolean);

  if (segments.length !== 2) {
    return null;
  }

  const latitude = parseCoordinate(segments[0]);
  const longitude = parseCoordinate(segments[1]);

  if (latitude === null || longitude === null) {
    return null;
  }

  return {
    latitude: segments[0],
    longitude: segments[1]
  };
}

// Attempts to apply a combined coordinate string to the given form fields.
// Returns true if both fields were set, false if the value wasn't a valid pair.
function applyCoordinatePair(prefix, rawValue) {
  const coordinatePair = extractCoordinatePair(rawValue);

  if (!coordinatePair) {
    return false;
  }

  if (prefix === 'start') {
    form.startLatitude = coordinatePair.latitude;
    form.startLongitude = coordinatePair.longitude;
  } else {
    form.endLatitude = coordinatePair.latitude;
    form.endLongitude = coordinatePair.longitude;
  }

  return true;
}

// Intercepts paste events on the latitude input.  If the pasted text looks like
// a full coordinate pair the default paste is suppressed and both fields are
// filled; otherwise the browser's default paste behaviour is preserved.
function handleLatitudePaste(prefix, event) {
  const pastedText = event.clipboardData?.getData('text') ?? '';

  if (!applyCoordinatePair(prefix, pastedText)) {
    return;
  }

  event.preventDefault();
}

// Handles manual typing in the latitude input.  Each keystroke is tested
// against the coordinate-pair pattern so that pasting via the keyboard shortcut
// (which fires 'input', not 'paste') also triggers the auto-fill.
function handleLatitudeInput(prefix, event) {
  const nextValue = event.target.value;

  if (applyCoordinatePair(prefix, nextValue)) {
    return;
  }

  if (prefix === 'start') {
    form.startLatitude = nextValue;
    return;
  }

  form.endLatitude = nextValue;
}

// ─── Computed Coordinates ─────────────────────────────────────────────────────
// These computed refs drive both the map preview and the submit button.  They
// return null whenever either field cannot be parsed as a finite number, which
// lets the map and the form degrade gracefully with partial input.

const startCoordinates = computed(() => {
  const latitude = parseCoordinate(form.startLatitude);
  const longitude = parseCoordinate(form.startLongitude);

  if (latitude === null || longitude === null) {
    return null;
  }

  return { latitude, longitude };
});

const endCoordinates = computed(() => {
  const latitude = parseCoordinate(form.endLatitude);
  const longitude = parseCoordinate(form.endLongitude);

  if (latitude === null || longitude === null) {
    return null;
  }

  return { latitude, longitude };
});

// True when at least one valid coordinate pair exists; used to toggle the
// map status message between "enter coordinates" and "markers update as you type".
const hasMapPoints = computed(() => Boolean(startCoordinates.value || endCoordinates.value));

// ─── Map Rendering ────────────────────────────────────────────────────────────
// Redraws the feature layer (markers + dashed line) whenever the computed
// coordinates change.  Using a dedicated LayerGroup (mapFeatures) means a full
// map reinitialisation is never needed — clearLayers() removes old features
// before the new ones are drawn.
function updateMap() {
  if (!map || !mapFeatures) {
    return;
  }

  mapFeatures.clearLayers();

  const bounds = [];

  if (startCoordinates.value) {
    const point = [startCoordinates.value.latitude, startCoordinates.value.longitude];

    bounds.push(point);
    L.circleMarker(point, {
      radius: 10,
      color: '#f7c873',
      fillColor: '#ff8c42',
      fillOpacity: 0.95,
      weight: 2
    })
      .bindTooltip('Start', { direction: 'top', offset: [0, -8] })
      .addTo(mapFeatures);
  }

  if (endCoordinates.value) {
    const point = [endCoordinates.value.latitude, endCoordinates.value.longitude];

    bounds.push(point);
    L.circleMarker(point, {
      radius: 10,
      color: '#8ecae6',
      fillColor: '#219ebc',
      fillOpacity: 0.95,
      weight: 2
    })
      .bindTooltip('End', { direction: 'top', offset: [0, -8] })
      .addTo(mapFeatures);
  }

  // Draw a dashed straight line between the two points as a visual aid.
  // This is NOT the driving route — the route polyline would require an
  // additional API call to OpenRouteService.
  if (startCoordinates.value && endCoordinates.value) {
    L.polyline(
      [
        [startCoordinates.value.latitude, startCoordinates.value.longitude],
        [endCoordinates.value.latitude, endCoordinates.value.longitude]
      ],
      {
        color: '#f5efe6',
        dashArray: '10 8',
        opacity: 0.85,
        weight: 3
      }
    ).addTo(mapFeatures);
  }

  // Fit the viewport to the markers, or reset to a country-level US view when
  // no valid coordinates are present.
  if (bounds.length === 0) {
    map.setView([39.5, -98.35], 4);
    return;
  }

  if (bounds.length === 1) {
    map.setView(bounds[0], 10);
    return;
  }

  map.fitBounds(bounds, { padding: [36, 36] });
}

// ─── Lifecycle Hooks ──────────────────────────────────────────────────────────

onMounted(() => {
  map = L.map(mapElement.value, {
    zoomControl: true,
    attributionControl: true
  }).setView([39.5, -98.35], 4);

  createBaseTileLayer().addTo(map);

  mapFeatures = L.layerGroup().addTo(map);
  updateMap();
});

onBeforeUnmount(() => {
  // Remove the Leaflet instance to prevent memory leaks when the component
  // is torn down (e.g. navigating away via Vue Router).
  if (map) {
    map.remove();
  }
});

// Re-render map features whenever either computed coordinate changes.
watch([startCoordinates, endCoordinates], updateMap, { deep: true });

// ─── Form Submission ──────────────────────────────────────────────────────────

// POST /api/route-time with the current start and end coordinates.
// The backend validates the payload and forwards it to OpenRouteService;
// the result is a simplified summary with duration and distance.
async function submitForm() {
  errorMessage.value = '';
  result.value = null;
  isSubmitting.value = true;

  try {
    const response = await fetch('/api/route-time', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        start: {
          latitude: form.startLatitude,
          longitude: form.startLongitude
        },
        end: {
          latitude: form.endLatitude,
          longitude: form.endLongitude
        }
      })
    });

    const payload = await response.json();

    if (!response.ok) {
      errorMessage.value = payload.details || payload.error || 'Request failed.';
      return;
    }

    result.value = payload;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Unexpected error.';
  } finally {
    isSubmitting.value = false;
  }
}

// Fills the form with a short Boston-area route so users can try the feature
// without needing to know any real coordinates.
function setExample() {
  form.startLatitude = '42.3601';
  form.startLongitude = '-71.0589';
  form.endLatitude = '42.3736';
  form.endLongitude = '-71.1097';
}
</script>

<template>
  <section class="page-shell">
    <section class="hero-card">
      <p class="eyebrow">OpenRouteService Drive Time</p>
      <h1>Estimate travel time between two coordinate pairs.</h1>
      <p class="intro">
        Enter a start and end latitude/longitude, submit the request, and the backend will return the
        driving duration from OpenRouteService.
      </p>

      <button class="ghost-button" type="button" @click="setExample">Load example coordinates</button>

      <form class="coordinate-form" @submit.prevent="submitForm">
        <div class="coordinate-group">
          <div class="coordinate-group-header">
            <h2>Start</h2>
            <button class="ghost-button compact-button" type="button" @click="openAddressDialog('start')">Look up address</button>
          </div>
          <label>
            <span>Latitude</span>
            <input
              :value="form.startLatitude"
              type="text"
              inputmode="decimal"
              placeholder="42.3601 or 42.3601,-71.0589"
              required
              @input="handleLatitudeInput('start', $event)"
              @paste="handleLatitudePaste('start', $event)"
            />
            <small class="input-hint">Paste lat,long, lat/long, lat\long, or lat long to fill both fields.</small>
          </label>
          <label>
            <span>Longitude</span>
            <input v-model="form.startLongitude" type="number" step="any" placeholder="-71.0589" required />
          </label>
        </div>

        <div class="coordinate-group">
          <div class="coordinate-group-header">
            <h2>End</h2>
            <button class="ghost-button compact-button" type="button" @click="openAddressDialog('end')">Look up address</button>
          </div>
          <label>
            <span>Latitude</span>
            <input
              :value="form.endLatitude"
              type="text"
              inputmode="decimal"
              placeholder="42.3736 or 42.3736,-71.1097"
              required
              @input="handleLatitudeInput('end', $event)"
              @paste="handleLatitudePaste('end', $event)"
            />
            <small class="input-hint">Paste lat,long, lat/long, lat\long, or lat long to fill both fields.</small>
          </label>
          <label>
            <span>Longitude</span>
            <input v-model="form.endLongitude" type="number" step="any" placeholder="-71.1097" required />
          </label>
        </div>

        <button class="primary-button" type="submit" :disabled="isSubmitting">
          {{ isSubmitting ? 'Calculating...' : 'Get drive time' }}
        </button>
      </form>

      <AddressLookupDialog ref="addressDialog" @select="onAddressSelect" />

      <section class="map-panel">
        <div class="map-panel-header">
          <div>
            <p class="result-label">Coordinate map</p>
            <h2>Live marker preview</h2>
          </div>
          <p class="map-status">{{ hasMapPoints ? 'Markers update as you type.' : 'Enter coordinates to place markers.' }}</p>
        </div>
        <div ref="mapElement" class="map-canvas" aria-label="Map showing entered start and end coordinates"></div>
      </section>

      <p v-if="errorMessage" class="feedback error">{{ errorMessage }}</p>

      <section v-if="result" class="result-panel">
        <p class="result-label">Drive time</p>
        <p class="result-value">{{ result.durationMinutes }} minutes</p>
        <p class="result-meta">{{ Math.round((result.distanceMeters / 1000) * 100) / 100 }} km total distance</p>
      </section>
    </section>
  </section>
</template>
