<script setup>
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';

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

let map;
let mapFeatures;

function parseCoordinate(value) {
  const numericValue = Number(value);

  return Number.isFinite(numericValue) ? numericValue : null;
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

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

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
  <main class="page-shell">
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
          <h2>Start</h2>
          <label>
            <span>Latitude</span>
            <input v-model="form.startLatitude" type="number" step="any" placeholder="42.3601" required />
          </label>
          <label>
            <span>Longitude</span>
            <input v-model="form.startLongitude" type="number" step="any" placeholder="-71.0589" required />
          </label>
        </div>

        <div class="coordinate-group">
          <h2>End</h2>
          <label>
            <span>Latitude</span>
            <input v-model="form.endLatitude" type="number" step="any" placeholder="42.3736" required />
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
        <p class="result-meta">{{ Math.round(result.distanceMeters / 1000 * 100) / 100 }} km total distance</p>
      </section>
    </section>
  </main>
</template>
