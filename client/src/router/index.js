/**
 * router/index.ts
 *
 * Automatic routes for `./src/pages/*.vue`
 */

// Composables
import {createRouter, createWebHistory} from 'vue-router/auto'
import App from '../App.vue'
import admin from '../pages/admin/index.vue'

const routes = [
  {
    path: '/',
    name: 'Home',
    component: App,
  },
  {
    path: '/admin',
    name: 'Admin Page',
    component: admin,
  }
]

const router = createRouter({
  mode: 'history',
  history: createWebHistory(import.meta.env.BASE_URL),
  routes
})

export default router
