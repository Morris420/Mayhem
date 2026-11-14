import { ref } from 'vue'
import { defineStore } from 'pinia'
import { api } from '@/lib/api'

export const useAuthStore = defineStore('auth', () => {
  const user = ref(null)
  // `loaded` becomes true after the first "who am I?" check, so the router
  // only asks the server once per page load.
  const loaded = ref(false)

  async function fetchUser() {
    try {
      user.value = (await api.get('/user')).data
    } catch {
      user.value = null
    } finally {
      loaded.value = true
    }
  }

  async function login(username, password, remember = false) {
    user.value = (await api.post('/login', { username, password, remember })).data
    loaded.value = true
  }

  async function register(username, password, passwordConfirmation) {
    user.value = (
      await api.post('/register', {
        username,
        password,
        password_confirmation: passwordConfirmation,
      })
    ).data
    loaded.value = true
  }

  async function logout() {
    try {
      await api.post('/logout')
    } finally {
      user.value = null
    }
  }

  return { user, loaded, fetchUser, login, register, logout }
})
