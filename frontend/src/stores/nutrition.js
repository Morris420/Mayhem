import { ref } from 'vue'
import { defineStore } from 'pinia'
import { api } from '@/lib/api'
import { toISO } from '@/lib/tiers'

// Calories + protein for one day at a time (today by default).
export const useNutritionStore = defineStore('nutrition', () => {
  const data = ref(null)
  const date = ref(toISO(new Date()))

  async function load(d = date.value) {
    date.value = d
    data.value = await api.get(`/nutrition?date=${d}`)
  }

  async function setGoals(goals) {
    data.value = await api.put('/nutrition/goals', { ...goals, date: date.value })
  }

  async function addEntry(payload) {
    data.value = await api.post('/nutrition/entries', { ...payload, date: date.value })
  }

  async function updateEntry(id, grams) {
    data.value = await api.put(`/nutrition/entries/${id}`, { grams })
  }

  async function deleteEntry(id) {
    data.value = await api.delete(`/nutrition/entries/${id}`)
  }

  function reset() {
    data.value = null
    date.value = toISO(new Date())
  }

  return { data, date, load, setGoals, addEntry, updateEntry, deleteEntry, reset }
})
