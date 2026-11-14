<script setup>
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import AppIcon from './AppIcon.vue'
import { TIER_META } from '@/lib/tiers'

const props = defineProps({
  pending: { type: Array, required: true },
  completed: { type: Array, required: true },
  busyId: { type: Number, default: null },
})
defineEmits(['complete'])

const showAllDone = ref(false)
const doneShown = computed(() => (showAllDone.value ? props.completed : props.completed.slice(0, 3)))
</script>

<template>
  <div class="space-y-3 font-mono">
    <div v-if="!pending.length && !completed.length" class="rounded-xl border border-dashed border-cyan-500/30 bg-slate-950/60 p-6 text-center">
      <p class="text-sm text-cyan-200">NO ACTIVE QUESTS</p>
      <p class="mt-1 text-xs text-slate-400">The System has nothing assigned. Build your first quest.</p>
      <RouterLink :to="{ name: 'quests' }" class="mt-4 inline-flex items-center gap-2 rounded-lg border border-cyan-400 bg-cyan-500/20 px-4 py-2 text-xs font-bold tracking-wider text-cyan-200 uppercase hover:bg-cyan-500/30">
        <AppIcon name="plus" class="h-3.5 w-3.5" /> Create quest
      </RouterLink>
    </div>

    <p v-else-if="!pending.length" class="rounded-xl border border-emerald-500/40 bg-emerald-950/20 p-4 text-center text-xs text-emerald-300">
      ✔ ALL QUESTS CLEARED — add more in the quest builder.
    </p>

    <article v-for="t in pending" :key="t.id" class="flex items-center gap-3 rounded-xl border border-cyan-500/30 bg-slate-950/80 p-3.5 transition-all hover:border-cyan-400/60">
      <button type="button" :disabled="busyId === t.id" :aria-label="`Complete quest: ${t.title}`" class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-cyan-500/50 bg-cyan-500/10 text-transparent transition-all hover:border-emerald-400 hover:bg-emerald-500/20 hover:text-emerald-400 focus-visible:text-emerald-400 disabled:animate-pulse" @click="$emit('complete', t.id)">
        <AppIcon name="check" class="h-4 w-4" />
      </button>
      <div class="min-w-0 flex-1">
        <h3 class="truncate text-sm font-bold text-cyan-100">{{ t.title }}</h3>
        <p v-if="t.description" class="truncate text-[11px] text-slate-400">{{ t.description }}</p>
        <p v-if="t.achievement" class="mt-0.5 flex items-center gap-1 text-[10px] text-amber-300/90">
          <AppIcon :name="t.achievement.icon" class="h-3 w-3" /> unlocks {{ t.achievement.name }}
        </p>
      </div>
      <div class="flex shrink-0 flex-col items-end gap-1">
        <span class="rounded border px-2 py-0.5 text-[10px] font-bold" :class="TIER_META[t.tier].badge">{{ t.tier }}-RANK</span>
        <span class="text-[11px] font-bold text-cyan-300">+{{ t.xp }} XP</span>
      </div>
    </article>

    <template v-if="completed.length">
      <div class="flex items-center justify-between pt-2 text-[11px] text-slate-500">
        <span class="tracking-wider uppercase">Completed ({{ completed.length }})</span>
        <button v-if="completed.length > 3" type="button" class="text-cyan-400 hover:text-cyan-300" @click="showAllDone = !showAllDone">
          {{ showAllDone ? 'show less' : 'show all' }}
        </button>
      </div>
      <article v-for="t in doneShown" :key="t.id" class="flex items-center gap-3 rounded-xl border border-emerald-500/25 bg-slate-950/50 p-3 opacity-80">
        <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-emerald-400 bg-emerald-500/20 text-emerald-400"><AppIcon name="check" class="h-3.5 w-3.5" /></span>
        <span class="min-w-0 flex-1 truncate text-xs text-slate-300 line-through decoration-emerald-500/50">{{ t.title }}</span>
        <span class="shrink-0 rounded border border-emerald-500/30 bg-emerald-950/50 px-2 py-0.5 text-[10px] font-bold text-emerald-400">+{{ t.xp }} XP</span>
      </article>
    </template>
  </div>
</template>
