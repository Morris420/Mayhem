import { ref } from 'vue'
import { defineStore } from 'pinia'
import { api } from '@/lib/api'

// Google Calendar connection state. Events themselves come with the calendar/day requests.
export const useGoogleStore = defineStore('google', () => {
  const status = ref(null)
  const syncing = ref(false)

  async function load() {
    status.value = await api.get('/google')
  }

  async function connect() {
    const { url } = await api.get('/google/connect')
    window.location.href = url
  }

  async function sync() {
    syncing.value = true
    try {
      const res = await api.post('/google/sync')
      status.value = res
      return res.result
    } finally {
      syncing.value = false
    }
  }

  async function setPush(enabled) {
    status.value = await api.put('/google/settings', { push_enabled: enabled })
  }

  async function disconnect() {
    status.value = await api.delete('/google')
  }

  function reset() {
    status.value = null
    syncing.value = false
  }

  return { status, syncing, load, connect, sync, setPush, disconnect, reset }
})
