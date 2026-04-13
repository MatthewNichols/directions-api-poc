import { createRouter, createWebHistory } from 'vue-router';

import DriveTimeView from '../views/DriveTimeView.vue';
import RelativeDistanceMapView from '../views/RelativeDistanceMapView.vue';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'drive-time',
      component: DriveTimeView
    },
    {
      path: '/relative-distance-map',
      name: 'relative-distance-map',
      component: RelativeDistanceMapView
    }
  ]
});

export default router;
