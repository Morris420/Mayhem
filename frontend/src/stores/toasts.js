import { ref } from 'vue'
import { defineStore } from 'pinia'

// Small pop-up messages ("+50 XP", "LEVEL UP", "ACHIEVEMENT UNLOCKED").
export const useToastStore = defineStore('toasts', () => {
  const items = ref([])
  let nextId = 1

  function push({ title, message = '', kind = 'info', icon = 'zap', duration = 4500 }) {
    const id = nextId++
    items.value.push({ id, title, message, kind, icon })
    // Keep the screen tidy: only the 4 most recent toasts are shown.
    if (items.value.length > 4) items.value = items.value.slice(-4)
    setTimeout(() => dismiss(id), duration)
  }

  // Achievements the server unlocked for you (from gym, food or quests).
  function announceUnlocked(list = []) {
    for (const a of list) {
      push({ title: 'Achievement unlocked', message: a.name, kind: 'achievement', icon: a.icon, duration: 7000 })
    }
  }

  function dismiss(id) {
    items.value = items.value.filter((t) => t.id !== id)
  }

  return { items, push, announceUnlocked, dismiss }
})
