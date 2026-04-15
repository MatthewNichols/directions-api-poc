<script setup>
// ─── App Shell ────────────────────────────────────────────────────────────────
// Top-level layout component.  It renders a persistent header with a tab bar
// for navigating between demos, and a <RouterView> placeholder where the active
// page component is mounted.  New demos can be added by appending an entry to
// the tabs array (the router/index.js route list must be updated in parallel).
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
