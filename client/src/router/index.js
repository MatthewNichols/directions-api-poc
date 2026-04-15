// ─── Router ───────────────────────────────────────────────────────────────────
// Declares the two demo pages and maps them to URL paths.  createWebHistory()
// uses the browser's History API so URLs look like /relative-distance-map
// rather than /#/relative-distance-map.  The Express server has a matching
// SPA-fallback rule so hard-refreshing on any of these paths still returns
// index.html instead of a 404.
import { createRouter, createWebHistory } from 'vue-router';

import DriveTimeView from '../views/DriveTimeView.vue';
import RelativeDistanceMapView from '../views/RelativeDistanceMapView.vue';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    // ─ Home: drive-time duration estimator ──────────────────────────────────
    {
      path: '/',
      name: 'drive-time',
      component: DriveTimeView
    },
    // ─ Relative distance map: visualise multiple locations around a primary ─
    {
      path: '/relative-distance-map',
      name: 'relative-distance-map',
      component: RelativeDistanceMapView
    }
  ]
});

export default router;
