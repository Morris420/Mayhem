import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import { setUnauthorizedHandler } from './lib/api'
import { useAuthStore } from './stores/auth'
import { useGameStore } from './stores/game'

const app = createApp(App)

// Pinia must be installed before the router, because the router guard uses a store.
app.use(createPinia())
app.use(router)

// If the server ever says "you're not logged in" (session expired), bounce to login.
setUnauthorizedHandler(() => {
  useAuthStore().user = null
  useGameStore().reset()
  if (router.currentRoute.value.name !== 'login') {
    router.push({ name: 'login', query: { redirect: router.currentRoute.value.fullPath } })
  }
})

app.mount('#app')
