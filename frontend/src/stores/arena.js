import { ref } from 'vue'
import { defineStore } from 'pinia'
import { api } from '@/lib/api'

// The arena's server side: your fighter's stats and abilities, computed from your
// skills by the backend (ArenaRules / Loadout). The client never works these out
// itself; the simulation takes them as an input.
export const useArenaStore = defineStore('arena', () => {
  const loadout = ref(null)
  const failed = ref(false)

  // Always fresh: a quest finished a minute ago may have levelled a skill.
  async function load() {
    failed.value = false
    try {
      loadout.value = await api.get('/arena/loadout')
    } catch (e) {
      // The arena still works offline / with the API down: base stats, no abilities.
      failed.value = true
      loadout.value = null
      console.warn('[arena] loadout failed to load, using the base stats', e)
    }
    return loadout.value
  }

  return { loadout, failed, load }
})
