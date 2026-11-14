<script setup>
import { computed, onMounted, ref } from 'vue'
import SystemPanel from '@/components/SystemPanel.vue'
import AppIcon from '@/components/AppIcon.vue'
import { useGameStore } from '@/stores/game'
import { ApiError } from '@/lib/api'
import { TIERS, TIER_META, TIER_XP } from '@/lib/tiers'

const game = useGameStore()

const title = ref('')
const description = ref('')
const tier = ref('C')
const achievementId = ref(null)
const submitting = ref(false)
const errors = ref({})
const generalError = ref('')
const confirmDeleteId = ref(null)

const xpPreview = computed(() => TIER_XP[tier.value])
const canSubmit = computed(() => title.value.trim().length > 0 && !submitting.value)
const inputClass =
  'w-full rounded-xl border border-cyan-500/30 bg-slate-950 px-3.5 py-2.5 font-mono text-sm text-cyan-100 shadow-inner placeholder:text-cyan-900 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 focus:outline-none'

async function submit() {
  errors.value = {}
  generalError.value = ''
  submitting.value = true
  try {
    await game.createTask({
      title: title.value.trim(),
      description: description.value.trim() || null,
      tier: tier.value,
      achievement_id: achievementId.value,
    })
    title.value = ''
    description.value = ''
    achievementId.value = null
  } catch (e) {
    if (e instanceof ApiError && e.status === 422) errors.value = e.errors
    else generalError.value = e instanceof ApiError ? e.message : 'Cannot reach the System.'
  } finally {
    submitting.value = false
  }
}

async function remove(id) {
  // Two-step delete: first click arms the button, second click confirms.
  if (confirmDeleteId.value !== id) {
    confirmDeleteId.value = id
    setTimeout(() => confirmDeleteId.value === id && (confirmDeleteId.value = null), 3000)
    return
  }
  confirmDeleteId.value = null
  await game.deleteTask(id)
}

onMounted(() => Promise.all([game.refreshAll(), game.loadCatalog()]).catch(() => {}))
</script>

<template>
  <div class="grid grid-cols-1 gap-6 lg:grid-cols-12">
    <SystemPanel title="Create custom quest" icon="plus" corners class="lg:col-span-5">
      <form class="space-y-5 font-mono" @submit.prevent="submit">
        <div class="space-y-1">
          <label for="title" class="block text-[11px] text-cyan-300/80 uppercase">Quest objective / title</label>
          <input id="title" v-model="title" type="text" maxlength="120" placeholder="e.g. Run 20+ km" :class="inputClass" />
          <p v-for="m in errors.title" :key="m" class="text-[11px] text-red-300">⚠ {{ m }}</p>
        </div>

        <div class="space-y-1">
          <label for="description" class="block text-[11px] text-cyan-300/80 uppercase">Description <span class="text-slate-600">(optional)</span></label>
          <textarea id="description" v-model="description" rows="3" maxlength="1000" placeholder="What does clearing this quest look like?" :class="inputClass"></textarea>
          <p v-for="m in errors.description" :key="m" class="text-[11px] text-red-300">⚠ {{ m }}</p>
        </div>

        <fieldset class="space-y-2">
          <legend class="text-[11px] text-cyan-300/80 uppercase">Challenge tier</legend>
          <div class="grid grid-cols-6 gap-1.5">
            <button v-for="t in TIERS" :key="t" type="button" :aria-pressed="tier === t" class="rounded border py-2 text-sm font-black transition-all" :class="tier === t ? TIER_META[t].ring : 'border-slate-700 bg-slate-900 text-slate-500 hover:border-cyan-500 hover:text-cyan-300'" @click="tier = t">{{ t }}</button>
          </div>
          <div class="flex items-center justify-between rounded-lg border border-cyan-500/20 bg-slate-950/70 px-3 py-2 text-xs">
            <span :class="TIER_META[tier].text" class="font-bold uppercase">{{ tier }}-Rank · {{ TIER_META[tier].name }}</span>
            <span class="font-black text-cyan-300">+{{ xpPreview }} XP</span>
          </div>
          <p v-for="m in errors.tier" :key="m" class="text-[11px] text-red-300">⚠ {{ m }}</p>
        </fieldset>

        <fieldset class="space-y-2">
          <legend class="text-[11px] text-cyan-300/80 uppercase">Unlockable achievement <span class="text-slate-600">(optional)</span></legend>
          <div class="grid grid-cols-1 gap-1.5">
            <label class="flex cursor-pointer items-center gap-3 rounded-lg border p-2.5 transition-all" :class="achievementId === null ? 'border-cyan-400/60 bg-cyan-500/10' : 'border-slate-800 bg-slate-950/60 hover:border-cyan-500/40'">
              <input v-model="achievementId" type="radio" :value="null" class="sr-only" />
              <span class="flex h-8 w-8 items-center justify-center rounded border border-slate-700 text-slate-500"><AppIcon name="flag" class="h-4 w-4" /></span>
              <span class="text-xs text-slate-300">No achievement</span>
            </label>
            <label v-for="a in game.catalog" :key="a.id" class="flex cursor-pointer items-center gap-3 rounded-lg border p-2.5 transition-all" :class="achievementId === a.id ? 'border-amber-400/60 bg-amber-500/10' : 'border-slate-800 bg-slate-950/60 hover:border-amber-500/40'">
              <input v-model="achievementId" type="radio" :value="a.id" class="sr-only" />
              <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded border" :class="achievementId === a.id ? 'border-amber-400/60 text-amber-300' : 'border-slate-700 text-slate-400'"><AppIcon :name="a.icon" class="h-4 w-4" /></span>
              <span class="min-w-0">
                <span class="block truncate text-xs font-bold text-slate-200">{{ a.name }}</span>
                <span class="block truncate text-[10px] text-slate-500">{{ a.description }}</span>
              </span>
            </label>
          </div>
          <p class="text-[10px] text-slate-500">Complete every quest linked to an achievement to unlock it.</p>
          <p v-for="m in errors.achievement_id" :key="m" class="text-[11px] text-red-300">⚠ {{ m }}</p>
        </fieldset>

        <p v-if="generalError" role="alert" class="rounded-lg border border-red-500/40 bg-red-950/40 px-3 py-2 text-xs text-red-300">⚠ {{ generalError }}</p>

        <button type="submit" :disabled="!canSubmit" class="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 via-cyan-300 to-blue-400 px-4 py-3 text-xs font-black tracking-widest text-slate-950 uppercase shadow-[0_0_20px_rgba(34,211,238,0.4)] transition-all hover:from-cyan-300 hover:to-blue-300 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none">
          <AppIcon name="zap" class="h-4 w-4 fill-current" /> {{ submitting ? 'Creating…' : 'Initiate new quest' }}
        </button>
      </form>
    </SystemPanel>

    <SystemPanel title="All quests" icon="scroll" class="lg:col-span-7">
      <template #aside><span class="text-xs text-slate-400">{{ game.tasks.length }} TOTAL</span></template>

      <p v-if="!game.tasks.length" class="py-10 text-center font-mono text-xs text-slate-500">No quests yet — create your first one.</p>

      <ul v-else class="space-y-2 font-mono">
        <li v-for="t in game.tasks" :key="t.id" class="flex items-center gap-3 rounded-xl border bg-slate-950/70 p-3" :class="t.completed ? 'border-emerald-500/25 opacity-70' : 'border-cyan-500/25'">
          <span class="w-12 shrink-0 rounded border px-1.5 py-0.5 text-center text-[10px] font-bold" :class="TIER_META[t.tier].badge">{{ t.tier }}-RANK</span>
          <div class="min-w-0 flex-1">
            <div class="truncate text-sm font-bold" :class="t.completed ? 'text-slate-400 line-through' : 'text-cyan-100'">{{ t.title }}</div>
            <div class="flex flex-wrap gap-x-3 text-[10px] text-slate-500">
              <span>+{{ t.xp }} XP</span>
              <span v-if="t.achievement" class="text-amber-300/90">★ {{ t.achievement.name }}</span>
              <span v-if="t.completed" class="text-emerald-400">COMPLETED</span>
            </div>
          </div>
          <button type="button" class="flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] transition-colors" :class="confirmDeleteId === t.id ? 'border-red-500 bg-red-500/20 text-red-200' : 'border-slate-700 text-slate-400 hover:border-red-500/50 hover:text-red-300'" :aria-label="`Delete quest: ${t.title}`" @click="remove(t.id)">
            <AppIcon name="trash" class="h-3.5 w-3.5" /> {{ confirmDeleteId === t.id ? 'Confirm?' : '' }}
          </button>
        </li>
      </ul>
    </SystemPanel>
  </div>
</template>
