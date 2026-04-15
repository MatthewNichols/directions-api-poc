// ─── Entry Point ─────────────────────────────────────────────────────────────
// Bootstraps the Vue 3 application.  The root component (App.vue) is mounted
// into the <div id="app"> element defined in index.html.  Vue Router is
// registered here so every component in the tree can use <RouterLink> and
// <RouterView> without additional imports.
import { createApp } from 'vue';

import App from './App.vue';
import router from './router';
import './styles.css';

createApp(App).use(router).mount('#app');
