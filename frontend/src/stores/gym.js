import { ref } from 'vue'
import { defineStore } from 'pinia'
import { api } from '@/lib/api'
import { useToastStore } from './toasts'

// Gym tracker state: your exercises, weight history, the week plan and physique stage.
export const useGymStore = defineStore('gym', () => {
  const data = ref(null) // { week, exercises, physique, stats }

  async function load() {
    data.value = await api.get('/gym')
  }

  async function loadStarter() {
    data.value = await api.post('/gym/starter')
  }

  async function saveExercise(payload, id = null) {
    data.value = id ? await api.put(`/gym/exercises/${id}`, payload) : await api.post('/gym/exercises', payload)
  }

  async function deleteExercise(id) {
    data.value = await api.delete(`/gym/exercises/${id}`)
  }

  async function logWeight(exercise, payload) {
    const toasts = useToastStore()
    const before = { records: exercise.records, stage: data.value.physique.stage }
    data.value = await api.post(`/gym/exercises/${exercise.id}/logs`, payload)

    const after = data.value.exercises.find((e) => e.id === exercise.id)
    toasts.push({ title: 'Logged', message: `${exercise.name} · ${payload.weight} kg`, kind: 'success', icon: 'dumbbell' })
    if (after && after.records > before.records) {
      toasts.push({ title: 'New personal record', message: `${exercise.name} · ${after.best} kg`, kind: 'achievement', icon: 'trophy', duration: 6000 })
    }
    toasts.announceUnlocked(data.value.unlocked)
    toasts.announceSkills(data.value.skill_level_ups)
    if (data.value.physique.stage > before.stage) {
      toasts.push({ title: 'Physique evolved', message: `You are now ${data.value.physique.name}`, kind: 'level', icon: 'zap', duration: 7000 })
    }
  }

  async function deleteLog(id) {
    data.value = await api.delete(`/gym/logs/${id}`)
  }

  function reset() {
    data.value = null
  }

  return { data, load, loadStarter, saveExercise, deleteExercise, logWeight, deleteLog, reset }
})
