import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { api } from '@/lib/api'
import { useGameStore } from './game'
import { useToastStore } from './toasts'

// The AI coach: one conversation, and the quests it suggests.
export const useCoachStore = defineStore('coach', () => {
  const data = ref(null)
  const thinking = ref(false)

  const messages = computed(() => data.value?.messages ?? [])
  const left = computed(() => {
    const l = data.value?.limits
    return l ? Math.max(0, l.messages.max - l.messages.used) : 0
  })

  async function load() {
    data.value = await api.get('/coach')
  }

  // Every call returns the whole conversation, so the UI never has to patch it together.
  async function send(message) {
    thinking.value = true
    try {
      data.value = await api.post('/coach/messages', { message })
    } finally {
      thinking.value = false
    }
  }

  /** Today's briefing. Cheap to call: the server only asks the AI once a day. */
  async function daily() {
    if (data.value?.has_daily) return
    thinking.value = true
    try {
      data.value = await api.post('/coach/daily')
    } finally {
      thinking.value = false
    }
  }

  async function saveProfile(profile) {
    data.value = await api.put('/coach/profile', { profile })
    useToastStore().push({ title: 'Profile saved', message: 'The coach knows you better now.', icon: 'user' })
  }

  async function accept(id) {
    const res = await api.post(`/coach/proposals/${id}/accept`)
    data.value = res
    useToastStore().push({ title: 'Quest accepted', message: `${res.task.title} · ${res.task.xp} XP`, kind: 'success', icon: 'scroll' })
    await useGameStore().refreshAll() // it is a real quest now
  }

  async function dismiss(id) {
    data.value = await api.post(`/coach/proposals/${id}/dismiss`)
  }

  async function clear() {
    data.value = await api.delete('/coach')
  }

  function reset() {
    data.value = null
  }

  return { data, thinking, messages, left, load, send, daily, saveProfile, accept, dismiss, clear, reset }
})
