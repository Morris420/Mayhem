<script setup>
import { TIER_META } from '@/lib/tiers'

// Completed vs total quests for each difficulty tier.
defineProps({ tiers: { type: Array, required: true } })

const pct = (t) => (t.total ? Math.round((t.completed / t.total) * 100) : 0)
</script>

<template>
  <ul class="space-y-2.5 font-mono">
    <li v-for="t in tiers" :key="t.tier" class="flex items-center gap-3">
      <span class="w-14 shrink-0 rounded border px-1.5 py-0.5 text-center text-[10px] font-bold" :class="TIER_META[t.tier].badge">{{ t.tier }}-RANK</span>
      <div class="h-2.5 flex-1 overflow-hidden rounded-full border border-cyan-500/20 bg-slate-950 p-px" role="progressbar" :aria-valuenow="pct(t)" aria-valuemin="0" aria-valuemax="100" :aria-label="`${t.tier} tier completion`">
        <div class="h-full rounded-full transition-all duration-700" :class="TIER_META[t.tier].bar" :style="{ width: pct(t) + '%' }"></div>
      </div>
      <span class="w-12 shrink-0 text-right text-[11px] text-slate-400">{{ t.completed }}/{{ t.total }}</span>
    </li>
  </ul>
</template>
