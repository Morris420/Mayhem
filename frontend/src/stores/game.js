import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { api } from '@/lib/api'
import { useAuthStore } from './auth'
import { useToastStore } from './toasts'

// Everything the dashboard, calendar and quest builder share.
export const useGameStore = defineStore('game', () => {
  const dashboard = ref(null) // { user, today, stats, tiers, activity, achievements }
  const tasks = ref([]) // the quest library
  const catalog = ref([]) // achievements you can attach to a quest
  const loading = ref(false)

  const todayItems = computed(() => dashboard.value?.today.items ?? [])
  const pendingToday = computed(() => todayItems.value.filter((i) => !i.done))
  const doneToday = computed(() => todayItems.value.filter((i) => i.done))

  // The locked achievement you are closest to (only counts ones with progress).
  const nextAchievement = computed(() => {
    const locked = (dashboard.value?.achievements ?? []).filter((a) => !a.unlocked && a.progress.pct > 0)
    return locked.sort((a, b) => b.progress.pct - a.progress.pct)[0] ?? null
  })

  async function refreshAll() {
    loading.value = true
    try {
      const [d, t] = await Promise.all([api.get('/dashboard'), api.get('/tasks')])
      dashboard.value = d
      tasks.value = t.data
    } finally {
      loading.value = false
    }
  }

  async function loadCatalog() {
    catalog.value = await api.get('/achievements')
  }

  async function createTask(payload) {
    const res = await api.post('/tasks', payload)
    await refreshAll()
    useToastStore().push({ title: 'Quest created', message: `${res.data.title} · ${res.data.xp} XP`, kind: 'info', icon: 'scroll' })
    return res.data
  }

  /** schedule = { mode: 'none' } | { mode: 'date', date } | { mode: 'weekly', days: [1..7] } */
  async function setSchedule(id, schedule) {
    await api.put(`/tasks/${id}/schedule`, schedule)
    await refreshAll()
  }

  async function createAchievement(payload) {
    const res = await api.post('/achievements', payload)
    await Promise.all([loadCatalog(), refreshAll()])
    useToastStore().push({ title: 'Achievement created', message: res.name, kind: 'achievement', icon: res.icon })
    return res
  }

  async function deleteAchievement(id) {
    await api.delete(`/achievements/${id}`)
    await Promise.all([loadCatalog(), refreshAll()])
  }

  async function completeTask(id) {
    const toasts = useToastStore()
    const res = await api.post(`/tasks/${id}/complete`)
    useAuthStore().user = { ...useAuthStore().user, ...res.user }

    if (res.awarded) toasts.push({ title: `+${res.task.xp} XP`, message: res.task.title, kind: 'success', icon: 'check' })
    if (res.leveled_up) {
      toasts.push({ title: 'Level up', message: `You reached level ${res.user.level} · ${res.user.rank}-rank`, kind: 'level', icon: 'zap' })
    }
    if (res.unlocked) {
      toasts.push({ title: 'Achievement unlocked', message: res.unlocked.name, kind: 'achievement', icon: res.unlocked.icon, duration: 7000 })
    }
    await refreshAll()
  }

  async function deleteTask(id) {
    await api.delete(`/tasks/${id}`)
    await refreshAll()
  }

  function reset() {
    dashboard.value = null
    tasks.value = []
    catalog.value = []
  }

  return {
    dashboard, tasks, catalog, loading,
    todayItems, pendingToday, doneToday, nextAchievement,
    refreshAll, loadCatalog, createTask, setSchedule, createAchievement, deleteAchievement,
    completeTask, deleteTask, reset,
  }
})
