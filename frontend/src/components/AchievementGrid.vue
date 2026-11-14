<script setup>
import AppIcon from './AppIcon.vue'
import { TIER_META, shortDate } from '@/lib/tiers'

defineProps({ achievements: { type: Array, required: true } })
</script>

<template>
  <ul class="grid grid-cols-1 gap-3 font-mono sm:grid-cols-2">
    <li v-for="a in achievements" :key="a.id" class="relative flex gap-3 overflow-hidden rounded-xl border p-3.5 transition-all" :class="a.unlocked ? 'border-amber-400/50 bg-amber-950/20 shadow-[0_0_20px_rgba(245,158,11,0.15)]' : 'border-cyan-500/20 bg-slate-950/70'">
      <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border" :class="a.unlocked ? 'border-amber-400/60 bg-amber-500/15 text-amber-300' : 'border-slate-700 bg-slate-900 text-slate-500'">
        <AppIcon :name="a.unlocked ? a.icon : a.progress.pct > 0 ? a.icon : 'lock'" class="h-5 w-5" />
      </div>

      <div class="min-w-0 flex-1">
        <div class="flex items-start justify-between gap-2">
          <h3 class="text-xs font-bold" :class="a.unlocked ? 'text-amber-200' : 'text-slate-200'">{{ a.name }}</h3>
          <span class="shrink-0 rounded border px-1.5 text-[9px] font-bold" :class="TIER_META[a.tier].badge">{{ a.tier }}</span>
        </div>
        <p class="mt-0.5 text-[11px] leading-snug text-slate-400">{{ a.description }}</p>

        <div v-if="a.unlocked" class="mt-2 text-[10px] font-bold tracking-wider text-amber-300 uppercase">★ Unlocked {{ shortDate(a.unlocked_at) }}</div>
        <div v-else class="mt-2">
          <div class="h-1.5 overflow-hidden rounded-full border border-cyan-500/20 bg-slate-950" role="progressbar" :aria-valuenow="a.progress.pct" aria-valuemin="0" aria-valuemax="100" :aria-label="`${a.name} progress`">
            <div class="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-400 transition-all duration-700" :style="{ width: a.progress.pct + '%' }"></div>
          </div>
          <div class="mt-1 text-[10px] text-slate-500">
            <template v-if="a.linked_tasks">{{ a.progress.done }}/{{ a.linked_tasks }} linked quest{{ a.linked_tasks === 1 ? '' : 's' }} cleared</template>
            <template v-else>No quest linked yet</template>
          </div>
        </div>
      </div>
    </li>
  </ul>
</template>
