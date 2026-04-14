<script setup>
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';

import AddressLookupDialog from '../components/AddressLookupDialog.vue';
import { createBaseTileLayer } from '../lib/maptiler';

const form = reactive({
  startLatitude: '',
  startLongitude: '',
  endLatitude: '',
  endLongitude: ''
});

const result = ref(null);
const errorMessage = ref('');
const isSubmitting = ref(false);
const mapElement = ref(null);

// Address lookup dialog
const addressDialog = ref(null);
const addressDialogTarget = ref('');

function openAddressDialog(prefix) {
  addressDialogTarget.value = prefix;
  addressDialog.value.open();
}

function onAddressSelect({ latitude, longitude }) {
  if (addressDialogTarget.value === 'start') {
    form.startLatitude = String(latitude);
    form.startLongitude = String(longitude);
  } else {
    form.endLatitude = String(latitude);
    form.endLongitude = String(longitude);
  }
}

let map;
let mapFeatures;

function normalizeCoordinateSegment(value) {
  return value.trim();
}

function parseCoordinate(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }

  const numericValue = Number(value);

  return Number.isFinite(numericValue) ? numericValue : null;
}

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

function handleLatitudePaste(prefix, event) {
  const pastedText = event.clipboardData?.getData('text') ?? '';

  if (!applyCoordinatePair(prefix, pastedText)) {
    return;
  }

  event.preventDefault();
}

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

const hasMapPoints = computed(() => Boolean(startCoordinates.value || endCoordinates.value));

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
  if (map) {
    map.remove();
  }
});

watch([startCoordinates, endCoordinates], updateMap, { deep: true });

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
