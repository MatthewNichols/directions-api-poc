<script setup>
// ─── AddressLookupDialog ──────────────────────────────────────────────────────
// A modal <dialog> that lets users search for a place name and select a result
// to fill in the latitude/longitude fields of the parent form.  The search is
// forwarded to the backend's /api/geocode proxy so the MapTiler API key is
// never exposed in the browser bundle.
//
// Usage:
//   <AddressLookupDialog ref="dialog" @select="onSelect" />
//   dialog.value.open()               // open the modal
//   // @select fires with { latitude, longitude } when the user picks a result
import { ref } from 'vue';

const emit = defineEmits(['select']);

const dialog = ref(null);
const searchQuery = ref('');
const candidates = ref([]);
const searchError = ref('');
const isSearching = ref(false);

// Reset transient state and open the native <dialog> element.
function open() {
  searchQuery.value = '';
  candidates.value = [];
  searchError.value = '';
  dialog.value.showModal();
}

function close() {
  dialog.value.close();
}

// Sends the current query to /api/geocode and stores the returned GeoJSON
// features as selectable candidates.  Errors are shown inline; no throws.
async function searchAddress() {
  const query = searchQuery.value.trim();

  if (!query) {
    return;
  }

  isSearching.value = true;
  searchError.value = '';
  candidates.value = [];

  try {
    const response = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
    const data = await response.json();

    if (!response.ok) {
      searchError.value = data.error || 'Search failed.';
      return;
    }

    candidates.value = data.features ?? [];

    if (candidates.value.length === 0) {
      searchError.value = 'No results found.';
    }
  } catch (error) {
    searchError.value = error instanceof Error ? error.message : 'Unexpected error.';
  } finally {
    isSearching.value = false;
  }
}

// Allow submitting the search with the Enter key inside the text input.
function handleKeydown(event) {
  if (event.key === 'Enter') {
    searchAddress();
  }
}

// Extract the coordinate pair from the selected GeoJSON feature and emit it to
// the parent.  GeoJSON stores coordinates as [longitude, latitude], so they are
// destructured in reverse order here.
function selectCandidate(feature) {
  const [longitude, latitude] = feature.geometry.coordinates;

  emit('select', { latitude, longitude });
  close();
}

defineExpose({ open });
</script>

<template>
  <dialog ref="dialog" class="address-dialog">
    <div class="address-dialog-header">
      <h2>Look up address</h2>
      <button class="ghost-button compact-button" type="button" @click="close">Close</button>
    </div>

    <div class="address-search-row">
      <input
        v-model="searchQuery"
        type="text"
        placeholder="123 Main St, Springfield..."
        @keydown="handleKeydown"
      />
      <button class="primary-button" type="button" :disabled="isSearching" @click="searchAddress">
        {{ isSearching ? 'Searching...' : 'Search' }}
      </button>
    </div>

    <p v-if="searchError" class="feedback error">{{ searchError }}</p>

    <ul v-if="candidates.length > 0" class="candidate-list">
      <li v-for="feature in candidates" :key="feature.id" class="candidate-item">
        <button type="button" class="candidate-button" @click="selectCandidate(feature)">
          <span class="candidate-name">{{ feature.place_name }}</span>
          <span class="candidate-coords">{{ feature.geometry.coordinates[1].toFixed(5) }}, {{ feature.geometry.coordinates[0].toFixed(5) }}</span>
        </button>
      </li>
    </ul>
  </dialog>
</template>
