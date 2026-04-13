<script setup>
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

let nextLocationId = 3;
const storageKey = 'relative-distance-map-state';

const route = useRoute();
const router = useRouter();

const distanceOptions = [
  { label: '1 km rings', value: 1000 },
  { label: '5 km rings', value: 5000 },
  { label: '10 km rings', value: 10000 },
  { label: '25 km rings', value: 25000 },
  { label: '50 km rings', value: 50000 }
];

const form = reactive({
  distanceIncrementMeters: 5000,
  ringColors: {
    odd: '#8ecae699',
    even: '#f7c873bf'
  },
  locations: [
    {
      id: 1,
      name: 'Primary location',
      latitude: '',
      longitude: ''
    },
    {
      id: 2,
      name: 'Relative location',
      latitude: '',
      longitude: ''
    }
  ]
});

const mapElement = ref(null);
const isApplyingRouteState = ref(false);
const isMapExpanded = ref(false);
const isFormVisible = ref(true);

let routeUpdateTimeout;

let map;
let mapFeatures;

function createLocation(name = '', latitude = '', longitude = '') {
  const location = {
    id: nextLocationId,
    name,
    latitude,
    longitude
  };

  nextLocationId += 1;
  return location;
}

function ensureMinimumLocations() {
  while (form.locations.length < 2) {
    form.locations.push(createLocation(`Relative location ${form.locations.length}`));
  }
}

function serializeFormState() {
  return JSON.stringify({
    distanceIncrementMeters: form.distanceIncrementMeters,
    ringColors: {
      odd: form.ringColors.odd,
      even: form.ringColors.even
    },
    locations: form.locations.map((location) => ({
      name: location.name,
      latitude: location.latitude,
      longitude: location.longitude
    }))
  });
}

function applySerializedState(serializedState) {
  if (typeof serializedState !== 'string' || !serializedState) {
    ensureMinimumLocations();
    return;
  }

  try {
    const parsedState = JSON.parse(serializedState);
    const parsedLocations = Array.isArray(parsedState.locations) ? parsedState.locations : [];
    const incrementExists = distanceOptions.some((option) => option.value === parsedState.distanceIncrementMeters);

    form.distanceIncrementMeters = incrementExists ? parsedState.distanceIncrementMeters : 5000;
    form.ringColors.odd = coercePersistedColor(parsedState.ringColors?.odd, '#8ecae699');
    form.ringColors.even = coercePersistedColor(parsedState.ringColors?.even, '#f7c873bf');
    form.locations = parsedLocations.map((location, index) => {
      return createLocation(
        typeof location?.name === 'string' ? location.name : index === 0 ? 'Primary location' : `Relative location ${index}`,
        coercePersistedCoordinate(location?.latitude),
        coercePersistedCoordinate(location?.longitude)
      );
    });
    ensureMinimumLocations();
  } catch {
    ensureMinimumLocations();
  }
}

function readStoredState() {
  try {
    return window.localStorage.getItem(storageKey) ?? '';
  } catch {
    return '';
  }
}

function writeStoredState(serializedState) {
  try {
    window.localStorage.setItem(storageKey, serializedState);
  } catch {
    // Ignore storage failures so the demo still works in restricted browsers.
  }
}

function coercePersistedCoordinate(value) {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return '';
}

function coercePersistedColor(value, fallback) {
  if (typeof value !== 'string') {
    return fallback;
  }

  const normalizedValue = value.trim();

  if (/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(normalizedValue)) {
    return normalizedValue;
  }

  return fallback;
}

function parseRingColor(value, fallback) {
  const normalizedValue = coercePersistedColor(value, fallback);

  if (normalizedValue.length === 9) {
    return {
      color: normalizedValue.slice(0, 7),
      opacity: Number((parseInt(normalizedValue.slice(7, 9), 16) / 255).toFixed(2))
    };
  }

  return {
    color: normalizedValue,
    opacity: 1
  };
}

function normalizeCoordinateSegment(value) {
  return value.trim();
}

function parseCoordinate(value) {
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

function applyCoordinatePair(location, rawValue) {
  const coordinatePair = extractCoordinatePair(rawValue);

  if (!coordinatePair) {
    return false;
  }

  location.latitude = coordinatePair.latitude;
  location.longitude = coordinatePair.longitude;
  return true;
}

function handleLatitudePaste(location, event) {
  const pastedText = event.clipboardData?.getData('text') ?? '';

  if (!applyCoordinatePair(location, pastedText)) {
    return;
  }

  event.preventDefault();
}

function handleLatitudeInput(location, event) {
  const nextValue = event.target.value;

  if (applyCoordinatePair(location, nextValue)) {
    return;
  }

  location.latitude = nextValue;
}

function addLocation() {
  form.locations.push(createLocation(`Relative location ${form.locations.length}`));
}

function removeLocation(id) {
  form.locations = form.locations.filter((location) => location.id !== id);
  ensureMinimumLocations();
}

function setExample() {
  form.locations[0].name = 'Boston';
  form.locations[0].latitude = '42.3601';
  form.locations[0].longitude = '-71.0589';

  form.locations[1].name = 'Cambridge';
  form.locations[1].latitude = '42.3736';
  form.locations[1].longitude = '-71.1097';

  if (form.locations.length === 2) {
    addLocation();
  }

  form.locations[2].name = 'Somerville';
  form.locations[2].latitude = '42.3876';
  form.locations[2].longitude = '-71.0995';
}

const validLocations = computed(() => {
  return form.locations
    .map((location, index) => {
      const latitude = parseCoordinate(location.latitude);
      const longitude = parseCoordinate(location.longitude);

      if (latitude === null || longitude === null) {
        return null;
      }

      return {
        id: location.id,
        name: location.name.trim() || `Location ${index + 1}`,
        latitude,
        longitude,
        isPrimary: index === 0
      };
    })
    .filter(Boolean);
});

const primaryLocation = computed(() => validLocations.value.find((location) => location.isPrimary) ?? null);

const relativeLocations = computed(() => validLocations.value.filter((location) => !location.isPrimary));

function formatDistance(distanceMeters) {
  return distanceMeters >= 1000 ? `${(distanceMeters / 1000).toFixed(distanceMeters % 1000 === 0 ? 0 : 1)} km` : `${distanceMeters} m`;
}

function getDistanceInMeters(fromLocation, toLocation) {
  return L.latLng(fromLocation.latitude, fromLocation.longitude).distanceTo(
    L.latLng(toLocation.latitude, toLocation.longitude)
  );
}

function updateMap() {
  if (!map || !mapFeatures) {
    return;
  }

  mapFeatures.clearLayers();

  const primary = primaryLocation.value;

  if (!primary) {
    map.setView([39.5, -98.35], 4);
    return;
  }

  const primaryPoint = [primary.latitude, primary.longitude];
  const bounds = [primaryPoint];

  L.circleMarker(primaryPoint, {
    radius: 12,
    color: '#f7c873',
    fillColor: '#ff8c42',
    fillOpacity: 0.98,
    weight: 3
  })
    .bindTooltip(`${primary.name} (primary)`, { direction: 'top', offset: [0, -8] })
    .addTo(mapFeatures);

  const increment = Number(form.distanceIncrementMeters);
  const maxDistance = relativeLocations.value.reduce((furthestDistance, location) => {
    return Math.max(furthestDistance, getDistanceInMeters(primary, location));
  }, increment * 3);
  const circleCount = Math.max(1, Math.ceil(maxDistance / increment));
  const outerRingRadius = increment * circleCount;
  const outerRingBounds = L.latLng(primary.latitude, primary.longitude).toBounds(outerRingRadius * 2);
  const oddRingStyle = parseRingColor(form.ringColors.odd, '#8ecae699');
  const evenRingStyle = parseRingColor(form.ringColors.even, '#f7c873bf');

  // Draw rings out to the furthest relative location, or at least 3 rings to give a sense of scale.
  for (let index = 1; index <= circleCount; index += 1) {
    const radius = increment * index;
    const ringStyle = index % 2 === 0 ? evenRingStyle : oddRingStyle;

    L.circle(primaryPoint, {
      radius,
      color: ringStyle.color,
      opacity: ringStyle.opacity,
      weight: index === circleCount ? 2.5 : 2,
      dashArray: index === circleCount ? '12 8' : '6 6',
      fillColor: ringStyle.color,
      fillOpacity: 0
    })
      .bindTooltip(formatDistance(radius), { permanent: index === circleCount, direction: 'right' })
      .addTo(mapFeatures);
  }

  relativeLocations.value.forEach((location) => {
    const point = [location.latitude, location.longitude];

    bounds.push(point);

    const distanceMeters = getDistanceInMeters(primary, location);

    L.circleMarker(point, {
      radius: 10,
      color: '#8ecae6',
      fillColor: '#219ebc',
      fillOpacity: 0.95,
      weight: 2
    })
      .bindTooltip(`${location.name} • ${formatDistance(distanceMeters)}`, { direction: 'top', offset: [0, -8] })
      .addTo(mapFeatures);

    L.polyline([primaryPoint, point], {
      color: '#f5efe6',
      dashArray: '8 8',
      opacity: 0.65,
      weight: 2
    }).addTo(mapFeatures);
  });

  if (bounds.length === 1) {
    map.fitBounds(outerRingBounds, { padding: [40, 40] });
    return;
  }

  const combinedBounds = L.latLngBounds(bounds);

  combinedBounds.extend(outerRingBounds);
  map.fitBounds(combinedBounds, { padding: [40, 40] });
}

function syncMapSize() {
  if (!map) {
    return;
  }

  requestAnimationFrame(() => {
    map.invalidateSize();
    updateMap();
  });
}

function toggleMapExpanded() {
  isMapExpanded.value = !isMapExpanded.value;
}

function toggleFormVisible() {
  isFormVisible.value = !isFormVisible.value;
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
  if (routeUpdateTimeout) {
    clearTimeout(routeUpdateTimeout);
  }

  if (map) {
    map.remove();
  }
});

watch(validLocations, updateMap, { deep: true });
watch(() => form.distanceIncrementMeters, updateMap);
watch(() => [form.ringColors.odd, form.ringColors.even], updateMap);
watch(isMapExpanded, syncMapSize);
watch(isFormVisible, syncMapSize);

watch(
  () => route.query.state,
  (serializedState) => {
    const nextSerializedState = typeof serializedState === 'string' ? serializedState : readStoredState();

    if (nextSerializedState === serializeFormState()) {
      return;
    }

    isApplyingRouteState.value = true;
    applySerializedState(nextSerializedState);
    isApplyingRouteState.value = false;
  },
  { immediate: true }
);

watch(
  () => serializeFormState(),
  (serializedState) => {
    writeStoredState(serializedState);

    if (isApplyingRouteState.value || serializedState === route.query.state) {
      return;
    }

    if (routeUpdateTimeout) {
      clearTimeout(routeUpdateTimeout);
    }

    routeUpdateTimeout = setTimeout(() => {
      void router.replace({
        query: {
          ...route.query,
          state: serializedState
        }
      });
    }, 150);
  }
);
</script>

<template>
  <section class="page-shell">
    <section class="hero-card relative-distance-card">
      <p class="eyebrow">RelativeDistanceMap</p>
      <h1>Compare locations around a primary point.</h1>
      <p class="intro">
        Add named locations, paste coordinates in the same combined formats supported by Drive Time, and
        visualize each place relative to the first location in the list.
      </p>

      <div class="relative-distance-toolbar">
        <button class="ghost-button" type="button" @click="toggleFormVisible">
          {{ isFormVisible ? 'Hide location form' : 'Show location form' }}
        </button>

        <label class="select-field">
          <span>Distance ring increment</span>
          <select v-model.number="form.distanceIncrementMeters">
            <option v-for="option in distanceOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </label>

        <label class="color-field">
          <span>Odd ring color</span>
          <input v-model="form.ringColors.odd" class="color-input" type="color" alpha />
        </label>

        <label class="color-field">
          <span>Even ring color</span>
          <input v-model="form.ringColors.even" class="color-input" type="color" alpha />
        </label>
      </div>

      <p class="input-hint share-hint">This page saves its locations and ring size in the URL and local storage so the demo can be reloaded or shared.</p>

      <form v-if="isFormVisible" class="relative-distance-form" @submit.prevent>
        <section
          v-for="(location, index) in form.locations"
          :key="location.id"
          class="coordinate-group location-card"
        >
          <div class="location-card-header">
            <div>
              <p class="result-label">{{ index === 0 ? 'Primary' : `Relative ${index}` }}</p>
              <h2>{{ index === 0 ? 'Center point' : 'Comparison point' }}</h2>
            </div>

            <button
              v-if="index > 0"
              class="ghost-button compact-button"
              type="button"
              @click="removeLocation(location.id)"
            >
              Remove
            </button>
          </div>

          <label>
            <span>Name</span>
            <input v-model="location.name" type="text" placeholder="Location name" />
          </label>

          <label>
            <span>Latitude</span>
            <input
              :value="location.latitude"
              type="text"
              inputmode="decimal"
              :placeholder="index === 0 ? '42.3601 or 42.3601,-71.0589' : '42.3736 or 42.3736,-71.1097'"
              @input="handleLatitudeInput(location, $event)"
              @paste="handleLatitudePaste(location, $event)"
            />
            <small class="input-hint">Paste lat,long, lat/long, lat\long, or lat long to fill both fields.</small>
          </label>

          <label>
            <span>Longitude</span>
            <input v-model="location.longitude" type="number" step="any" placeholder="-71.0589" />
          </label>
        </section>

        <div class="form-action-row">
          <button class="ghost-button" type="button" @click="setExample">Load example locations</button>
          <button class="primary-button add-location-button" type="button" @click="addLocation">Add location</button>
        </div>
      </form>

      <section :class="['map-panel', { 'map-panel-expanded': isMapExpanded, 'map-panel-tall': !isFormVisible && !isMapExpanded }]">
        <div class="map-panel-header">
          <div>
            <p class="result-label">Relative map</p>
            <h2>Primary-centered view with distance rings</h2>
          </div>
          <div class="map-panel-actions">
            <p class="map-status">
              {{ primaryLocation ? `${relativeLocations.length} relative location${relativeLocations.length === 1 ? '' : 's'} shown around ${primaryLocation.name}.` : 'Enter a valid primary location to start the map.' }}
            </p>
            <button class="ghost-button compact-button" type="button" @click="toggleMapExpanded">
              {{ isMapExpanded ? 'Exit full window' : 'Full window map' }}
            </button>
          </div>
        </div>
        <div ref="mapElement" class="map-canvas" aria-label="Map showing the primary location, relative locations, and distance rings"></div>
      </section>
    </section>
  </section>
</template>
