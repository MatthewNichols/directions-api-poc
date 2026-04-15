<script setup>
// ─── RelativeDistanceMapView ──────────────────────────────────────────────────
// Displays a Leaflet map centred on a "primary" location and overlays concentric
// distance rings to show how far away one or more "relative" locations are.
// The full form state (locations + ring settings) is serialised to a URL query
// parameter and to localStorage so the view can be bookmarked or shared.
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import AddressLookupDialog from '../components/AddressLookupDialog.vue';
import { createBaseTileLayer } from '../lib/maptiler';

// Monotonically-increasing counter used to assign unique IDs to dynamically
// added locations.  Starts at 3 because IDs 1 and 2 are used by the two
// default locations in the initial form state.
let nextLocationId = 3;
// localStorage key under which the serialised form state is persisted between
// page loads.
const storageKey = 'relative-distance-map-state';

const route = useRoute();
const router = useRouter();

// ─── Distance Ring Options ────────────────────────────────────────────────────
// Presented as a <select> in the toolbar.  Changing the value re-renders the
// ring overlay on the map without touching the location list.
const distanceOptions = [
  { label: '1 km rings', value: 1000 },
  { label: '5 km rings', value: 5000 },
  { label: '10 km rings', value: 10000 },
  { label: '25 km rings', value: 25000 },
  { label: '50 km rings', value: 50000 }
];

// ─── Form State ───────────────────────────────────────────────────────────────
const form = reactive({
  distanceIncrementMeters: 5000,
  // Hex colours (with optional two-digit alpha suffix, e.g. '#8ecae699') for
  // alternating distance rings.  Odd rings = 1st, 3rd, 5th…; even = 2nd, 4th…
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

// Template ref for the map container <div>.
const mapElement = ref(null);
// Flag set while applySerializedState() is running so the form-change watcher
// does not try to push a URL update while we are already applying one.
const isApplyingRouteState = ref(false);
const isMapExpanded = ref(false);
const isFormVisible = ref(true);

// Debounce handle for URL pushes — we wait 150 ms after the last keystroke
// before updating the URL to avoid polluting the browser history.
let routeUpdateTimeout;

// ─── Map Icons ────────────────────────────────────────────────────────────────
// SVG house icon used for relative (non-primary) location markers.  Using a
// DivIcon lets us inline SVG so no external image file is required.
const houseIcon = L.divIcon({
  html: `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="24" viewBox="0 0 22 24">
    <polygon points="11,1 21,10 1,10" fill="#219ebc" stroke="#8ecae6" stroke-width="1.5" stroke-linejoin="round"/>
    <rect x="3" y="10" width="16" height="13" rx="1.5" fill="#219ebc" stroke="#8ecae6" stroke-width="1.5"/>
    <rect x="8" y="16" width="6" height="7" rx="1" fill="rgba(142,202,230,0.55)" stroke="#8ecae6" stroke-width="1"/>
  </svg>`,
  className: '',
  iconSize: [22, 24],
  iconAnchor: [11, 24],
  tooltipAnchor: [0, -24]
});

// ─── Leaflet Map Instances ────────────────────────────────────────────────────
// Kept outside Vue's reactivity system to avoid Leaflet/Proxy conflicts.
let map;
let mapFeatures;

// ─── Location Helpers ─────────────────────────────────────────────────────────

// Factory for location objects.  Assigning a stable numeric id lets Vue's
// v-for track items correctly when locations are added or removed.
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

// Guarantees the form always has at least two locations (primary + one relative)
// regardless of how many were loaded from persisted state.
function ensureMinimumLocations() {
  while (form.locations.length < 2) {
    form.locations.push(createLocation(`Relative location ${form.locations.length}`));
  }
}

// ─── State Serialisation ──────────────────────────────────────────────────────
// The form state is stored as a JSON string in both the URL query parameter
// (?state=…) and localStorage.  This makes the view bookmarkable and shareable:
// a URL with a state param will restore the exact locations and ring settings.

// Produces the canonical JSON string for the current form state.  Only the
// fields that should be persisted are included (id is excluded because it is
// regenerated on load).
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

// Parses a serialised state string and updates the reactive form.  Falls back
// to two empty default locations if parsing fails or the string is empty.
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

// ─── localStorage Helpers ─────────────────────────────────────────────────────

function readStoredState() {
  try {
    return window.localStorage.getItem(storageKey) ?? '';
  } catch {
    return '';
  }
}

// Storage errors are silently ignored so the demo continues to work in
// browsers with localStorage disabled or in private-browsing mode.
function writeStoredState(serializedState) {
  try {
    window.localStorage.setItem(storageKey, serializedState);
  } catch {
    // Ignore storage failures so the demo still works in restricted browsers.
  }
}

// ─── Persistence Coercion Helpers ─────────────────────────────────────────────
// These helpers sanitise values read from JSON / localStorage before writing
// them into the reactive form, preventing malformed stored data from breaking
// the UI.

// Accepts a string or number coordinate value and returns a string, or '' if
// the value cannot be sensibly coerced.
function coercePersistedCoordinate(value) {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return '';
}

// Returns the value unchanged if it is a valid 6- or 8-digit hex colour
// string (with or without a two-digit alpha suffix), otherwise returns the
// provided fallback.
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

// Converts a hex-with-alpha colour string (e.g. '#8ecae699') to separate
// color and opacity values that Leaflet's circle options understand.
// For a 6-digit hex (no alpha) the opacity is returned as 1.
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

// ─── Coordinate Parsing Utilities ─────────────────────────────────────────────
// Same pattern as DriveTimeView: these allow pasting a "lat,long" string into
// the latitude field to auto-fill both latitude and longitude at once.

function normalizeCoordinateSegment(value) {
  return value.trim();
}

// Converts a string to a finite number, returning null on failure.
function parseCoordinate(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }

  const numericValue = Number(value);

  return Number.isFinite(numericValue) ? numericValue : null;
}

// Tries to split a value into a lat/long pair using common separators
// (comma, slash, backslash, space).  Returns { latitude, longitude } as
// strings, or null if the value doesn't look like a pair.
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

// Writes both latitude and longitude on the given location object if the raw
// value parses as a coordinate pair.  Returns true on success so callers can
// skip their own fallback logic.
function applyCoordinatePair(location, rawValue) {
  const coordinatePair = extractCoordinatePair(rawValue);

  if (!coordinatePair) {
    return false;
  }

  location.latitude = coordinatePair.latitude;
  location.longitude = coordinatePair.longitude;
  return true;
}

// Intercepts paste events on the latitude input for a given location.
function handleLatitudePaste(location, event) {
  const pastedText = event.clipboardData?.getData('text') ?? '';

  if (!applyCoordinatePair(location, pastedText)) {
    return;
  }

  event.preventDefault();
}

// Handles typing in the latitude input.  Each keystroke is tested against the
// coordinate-pair pattern so keyboard-shortcut pastes are also handled.
function handleLatitudeInput(location, event) {
  const nextValue = event.target.value;

  if (applyCoordinatePair(location, nextValue)) {
    return;
  }

  location.latitude = nextValue;
}

// ─── Address Lookup Dialog ────────────────────────────────────────────────────
// addressDialogLocationId tracks which location card opened the dialog so the
// selected address is written to the correct entry in form.locations.
const addressDialog = ref(null);
const addressDialogLocationId = ref(null);

function openAddressDialog(location) {
  addressDialogLocationId.value = location.id;
  addressDialog.value.open();
}

// Called when the user selects a geocoding result inside AddressLookupDialog.
function onAddressSelect({ latitude, longitude }) {
  const location = form.locations.find((l) => l.id === addressDialogLocationId.value);

  if (location) {
    location.latitude = String(latitude);
    location.longitude = String(longitude);
  }
}

// ─── Location Management ──────────────────────────────────────────────────────

function addLocation() {
  form.locations.push(createLocation(`Relative location ${form.locations.length}`));
}

// Removes a location by id and ensures the minimum of two locations is kept.
function removeLocation(id) {
  form.locations = form.locations.filter((location) => location.id !== id);
  ensureMinimumLocations();
}

// Populates the form with five well-known Boston landmarks so users can
// immediately see the map in action without typing any coordinates.
function setExample() {
  const examples = [
    { name: 'Boston Common',   latitude: '42.3551', longitude: '-71.0657' },
    { name: 'Fenway Park',     latitude: '42.3467', longitude: '-71.0972' },
    { name: 'Logan Airport',   latitude: '42.3656', longitude: '-71.0096' },
    { name: 'Harvard Square',  latitude: '42.3736', longitude: '-71.1190' },
    { name: 'South Station',   latitude: '42.3519', longitude: '-71.0552' },
  ];

  while (form.locations.length < examples.length) {
    addLocation();
  }

  examples.forEach((example, index) => {
    form.locations[index].name = example.name;
    form.locations[index].latitude = example.latitude;
    form.locations[index].longitude = example.longitude;
  });

  form.locations.splice(examples.length);
  ensureMinimumLocations();
}

// ─── Computed Locations ───────────────────────────────────────────────────────
// validLocations filters out any row where either coordinate field is empty or
// non-numeric, so the map never tries to render invalid points.

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
        // The first entry in the list is always the primary (centre) location.
        isPrimary: index === 0
      };
    })
    .filter(Boolean);
});

const primaryLocation = computed(() => validLocations.value.find((location) => location.isPrimary) ?? null);

const relativeLocations = computed(() => validLocations.value.filter((location) => !location.isPrimary));

// ─── Distance Helpers ─────────────────────────────────────────────────────────

// Human-readable distance string: shows metres below 1 km, km above.
function formatDistance(distanceMeters) {
  return distanceMeters >= 1000 ? `${(distanceMeters / 1000).toFixed(distanceMeters % 1000 === 0 ? 0 : 1)} km` : `${distanceMeters} m`;
}

// Uses Leaflet's built-in Haversine calculation for a great-circle distance.
function getDistanceInMeters(fromLocation, toLocation) {
  return L.latLng(fromLocation.latitude, fromLocation.longitude).distanceTo(
    L.latLng(toLocation.latitude, toLocation.longitude)
  );
}

// ─── Map Rendering ────────────────────────────────────────────────────────────
// Redraws the entire feature layer whenever validLocations, distanceIncrement,
// or ring colours change.  The ring count is calculated dynamically: the rings
// are drawn out to whichever is further — the most-distant relative location or
// three rings — so there is always a meaningful sense of scale even with only
// one location entered.
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
  // Ensure rings extend at least to the furthest relative location, or three
  // rings minimum so the scale is always visible.
  const maxDistance = relativeLocations.value.reduce((furthestDistance, location) => {
    return Math.max(furthestDistance, getDistanceInMeters(primary, location));
  }, increment * 3);
  const circleCount = Math.max(1, Math.ceil(maxDistance / increment));
  const outerRingRadius = increment * circleCount;
  // toBounds(diameter) returns a LatLngBounds square centred on the primary
  // point that covers the outermost ring; used for the initial viewport fit.
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
      // The outermost ring gets a slightly heavier dashed border to mark the edge.
      weight: index === circleCount ? 2.5 : 2,
      dashArray: index === circleCount ? '12 8' : '6 6',
      fillColor: ringStyle.color,
      fillOpacity: 0
    })
      .addTo(mapFeatures);
  }

  // Render each relative location as a house marker with a dashed line back to
  // the primary point and a tooltip showing the name and straight-line distance.
  relativeLocations.value.forEach((location) => {
    const point = [location.latitude, location.longitude];

    bounds.push(point);

    const distanceMeters = getDistanceInMeters(primary, location);

    L.marker(point, { icon: houseIcon })
      .bindTooltip(`${location.name} • ${formatDistance(distanceMeters)}`, { direction: 'top', offset: [0, -4] })
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

  // Expand the bounds to include the outer ring so the rings are never clipped
  // by the viewport even when all relative locations are close to the primary.
  const combinedBounds = L.latLngBounds(bounds);

  combinedBounds.extend(outerRingBounds);
  map.fitBounds(combinedBounds, { padding: [40, 40] });
}

// Called after expand/collapse transitions that change the map container size.
// invalidateSize() tells Leaflet to remeasure the container and redraw tiles.
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
  if (routeUpdateTimeout) {
    clearTimeout(routeUpdateTimeout);
  }

  // Remove the Leaflet instance to prevent memory leaks on navigation.
  if (map) {
    map.remove();
  }
});

// ─── Reactive Watchers ────────────────────────────────────────────────────────

watch(validLocations, updateMap, { deep: true });
watch(() => form.distanceIncrementMeters, updateMap);
watch(() => [form.ringColors.odd, form.ringColors.even], updateMap);
// Re-measure the map canvas whenever its container size changes.
watch(isMapExpanded, syncMapSize);
watch(isFormVisible, syncMapSize);

// ─── URL / localStorage State Sync ───────────────────────────────────────────
// Two-way synchronisation between the form state and the URL query parameter:
//
//  • Outbound (form → URL): whenever serializeFormState() changes, the URL is
//    updated via router.replace() after a 150 ms debounce.  The state is also
//    written to localStorage so reloading without a URL parameter restores the
//    last session.
//
//  • Inbound (URL → form): if route.query.state changes (e.g. browser back/
//    forward, or the page is opened with a shared URL), the form is updated to
//    match.  When there is no URL parameter the stored localStorage value is
//    used as a fallback.
//
// isApplyingRouteState guards against the inbound handler triggering an outbound
// URL update, which would create a feedback loop.

watch(
  () => route.query.state,
  (serializedState) => {
    const nextSerializedState = typeof serializedState === 'string' ? serializedState : readStoredState();

    // Skip if the URL state already matches what's in the form to avoid
    // resetting cursor positions or triggering unnecessary re-renders.
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

    // Debounce URL updates so every keystroke doesn't create a history entry.
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
          :class="['coordinate-group', 'location-card', { 'has-remove-button': index > 0 }]"
        >
          <button
            v-if="index > 0"
            class="remove-location-button"
            type="button"
            aria-label="Remove location"
            @click="removeLocation(location.id)"
          >×</button>

          <div class="location-card-header">
            <div>
              <p class="result-label">{{ index === 0 ? 'Primary' : `Relative ${index}` }}</p>
              <h2>{{ index === 0 ? 'Center point' : 'Comparison point' }}</h2>
            </div>

            <button class="lookup-address-button ghost-button compact-button" type="button" @click="openAddressDialog(location)">Look up address</button>
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

      <AddressLookupDialog ref="addressDialog" @select="onAddressSelect" />
    </section>
  </section>
</template>
