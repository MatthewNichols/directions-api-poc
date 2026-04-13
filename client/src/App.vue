<script setup>
const tabs = [
  {
    name: 'Drive Time',
    to: '/'
  },
  {
    name: 'RelativeDistanceMap',
    to: '/relative-distance-map'
  }
];
</script>

<template>
  <main class="app-shell">
    <header class="app-header">
      <div>
        <p class="eyebrow">Directions API POC</p>
        <h1 class="app-title">Multi-demo frontend</h1>
      </div>

      <nav class="tab-bar" aria-label="Demo pages">
        <RouterLink
          v-for="tab in tabs"
          :key="tab.to"
          :to="tab.to"
          class="tab-link"
          active-class="is-active"
        >
          {{ tab.name }}
        </RouterLink>
      </nav>
    </header>

    <RouterView />
  </main>
</template>
