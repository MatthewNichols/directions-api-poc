<script setup>
import { reactive, ref } from 'vue';

const form = reactive({
  startLatitude: '',
  startLongitude: '',
  endLatitude: '',
  endLongitude: ''
});

const result = ref(null);
const errorMessage = ref('');
const isSubmitting = ref(false);

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

      <p v-if="errorMessage" class="feedback error">{{ errorMessage }}</p>

      <section v-if="result" class="result-panel">
        <p class="result-label">Drive time</p>
        <p class="result-value">{{ result.durationMinutes }} minutes</p>
        <p class="result-meta">{{ Math.round(result.distanceMeters / 1000 * 100) / 100 }} km total distance</p>
      </section>
    </section>
  </main>
</template>
