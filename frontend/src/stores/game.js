import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { api } from '@/lib/api'
import { useAuthStore } from './auth'
import { useToastStore } from './toasts'

// Everything the dashboard and the quest builder share: tasks, stats, achievements.
export const useGameStore = defineStore('game', () => {
  const dashboard = ref(null) // { user, stats, tiers, activity, achievements }
  const tasks = ref([])
  const catalog = ref([]) // achievements you can attach to a new quest
  const loading = ref(false)

  const pendingTasks = computed(() => tasks.value.filter((t) => !t.completed))
  const completedTasks = computed(() => tasks.value.filter((t) => t.completed))

  // The locked achievement you are closest to (only counts ones with progress).
  const nextAchievement = computed(() => {
    const locked = (dashboard.value?.achievements ?? []).filter(
      (a) => !a.unlocked && a.progress.pct > 0,
    )
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
    useToastStore().push({
      title: 'QUEST CREATED',
      message: `${res.data.title} · ${res.data.xp} XP`,
      kind: 'info',
      icon: 'scroll',
    })
    return res.data
  }

  async function completeTask(id) {
    const toasts = useToastStore()
    const res = await api.post(`/tasks/${id}/complete`)
    useAuthStore().user = { ...useAuthStore().user, ...res.user }

    toasts.push({ title: `+${res.task.xp} XP`, message: res.task.title, kind: 'success', icon: 'check' })
    if (res.leveled_up) {
      toasts.push({
        title: 'LEVEL UP',
        message: `You reached level ${res.user.level} · ${res.user.rank}-Rank`,
        kind: 'level',
        icon: 'zap',
      })
    }
    if (res.unlocked) {
      toasts.push({
        title: 'ACHIEVEMENT UNLOCKED',
        message: res.unlocked.name,
        kind: 'achievement',
        icon: res.unlocked.icon,
        duration: 7000,
      })
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
    pendingTasks, completedTasks, nextAchievement,
    refreshAll, loadCatalog, createTask, completeTask, deleteTask, reset,
  }
})
