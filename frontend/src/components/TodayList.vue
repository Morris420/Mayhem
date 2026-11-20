<script setup>
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import AppIcon from './AppIcon.vue'
import { TIER_META } from '@/lib/tiers'

// "Today" quest list. Used on the dashboard; items come from the planner API.
const props = defineProps({
  pending: { type: Array, required: true },
  done: { type: Array, required: true },
  busyId: { type: Number, default: null },
})
defineEmits(['complete'])

const showDone = ref(false)
const visibleDone = computed(() => (showDone.value ? props.done : []))
</script>

<template>
  <div class="space-y-2">
    <div v-if="!pending.length && !done.length" class="rounded-lg border border-dashed border-slate-700 p-6 text-center">
      <p class="text-sm font-medium text-slate-200">Nothing planned for today</p>
      <p class="mt-1 text-sm text-slate-400">Create a quest, or schedule one from your library.</p>
      <RouterLink :to="{ name: 'quests' }" class="mt-4 inline-flex items-center gap-2 rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400">
        <AppIcon name="plus" class="h-4 w-4" /> New quest
      </RouterLink>
    </div>

    <p v-else-if="!pending.length" class="rounded-lg bg-emerald-500/10 p-4 text-center text-sm text-emerald-300">
      All done for today. Nice work.
    </p>

    <article v-for="t in pending" :key="t.task_id" class="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-900 p-3 transition-colors hover:border-slate-700">
      <button type="button" :disabled="busyId === t.task_id" :aria-label="`Complete: ${t.title}`" class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-slate-600 text-transparent transition-colors hover:border-emerald-400 hover:text-emerald-400 focus-visible:border-emerald-400 focus-visible:text-emerald-400 disabled:animate-pulse" @click="$emit('complete', t.task_id)">
        <AppIcon name="check" class="h-3.5 w-3.5" />
      </button>
      <div class="min-w-0 flex-1">
        <h3 class="truncate text-sm font-medium text-slate-100">{{ t.title }}</h3>
        <p class="flex flex-wrap items-center gap-x-3 text-xs text-slate-500">
          <span v-if="t.overdue" class="flex items-center gap-1 text-amber-400"><AppIcon name="alert" class="h-3 w-3" /> Overdue</span>
          <span v-if="t.kind === 'recurring'" class="flex items-center gap-1"><AppIcon name="repeat" class="h-3 w-3" /> Repeats</span>
          <span v-if="t.description" class="truncate">{{ t.description }}</span>
          <span v-if="t.achievement" class="flex items-center gap-1 text-amber-300/80"><AppIcon :name="t.achievement.icon" class="h-3 w-3" /> {{ t.achievement.name }}</span>
        </p>
      </div>
      <div class="flex shrink-0 items-center gap-2">
        <span class="rounded px-1.5 py-0.5 text-[11px] font-semibold" :class="TIER_META[t.tier].badge">{{ t.tier }}</span>
        <span class="w-14 text-right text-xs font-medium text-slate-300">+{{ t.xp }} XP</span>
      </div>
    </article>

    <template v-if="done.length">
      <button type="button" class="flex w-full items-center justify-between pt-2 text-xs text-slate-500 hover:text-slate-300" @click="showDone = !showDone">
        <span>Completed today ({{ done.length }})</span>
        <span>{{ showDone ? 'Hide' : 'Show' }}</span>
      </button>
      <article v-for="t in visibleDone" :key="t.task_id" class="flex items-center gap-3 rounded-lg bg-slate-900/40 p-3 opacity-70">
        <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400"><AppIcon name="check" class="h-3.5 w-3.5" /></span>
        <span class="min-w-0 flex-1 truncate text-sm text-slate-400 line-through">{{ t.title }}</span>
        <span class="text-xs text-emerald-400">+{{ t.xp }} XP</span>
      </article>
    </template>
  </div>
</template>
