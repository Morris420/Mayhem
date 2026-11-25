import { ref } from 'vue'
import { defineStore } from 'pinia'
import { api } from '@/lib/api'

// Your fighter, as the server computes it from your skills: stat multipliers,
// max health / guard and abilities. The game only ever reads these.
export const useArenaStore = defineStore('arena', () => {
  const loadout = ref(null) // { stats: { hp, damage, guard }, maxHp, maxGuard, abilities, levels }

  async function load() {
    loadout.value = await api.get('/arena/loadout')
    return loadout.value
  }

  function reset() {
    loadout.value = null
  }

  return { loadout, load, reset }
})
