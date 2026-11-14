<script setup>
import { computed } from 'vue'

const props = defineProps({ pct: { type: Number, default: 0 } })
const r = 42
const circ = 2 * Math.PI * r
const offset = computed(() => circ * (1 - Math.min(100, Math.max(0, props.pct)) / 100))
</script>

<template>
  <div class="relative h-28 w-28" role="img" :aria-label="`${pct}% of quests completed`">
    <svg viewBox="0 0 100 100" class="h-full w-full -rotate-90">
      <circle cx="50" cy="50" :r="r" fill="none" stroke="#0f172a" stroke-width="9" />
      <circle cx="50" cy="50" :r="r" fill="none" stroke="#22d3ee" stroke-width="9" stroke-linecap="round" :stroke-dasharray="circ" :stroke-dashoffset="offset" class="transition-all duration-700" style="filter: drop-shadow(0 0 4px #22d3ee)" />
    </svg>
    <div class="absolute inset-0 flex flex-col items-center justify-center font-mono">
      <span class="text-2xl font-black text-cyan-200">{{ pct }}%</span>
      <span class="text-[9px] tracking-wider text-slate-500 uppercase">cleared</span>
    </div>
  </div>
</template>
