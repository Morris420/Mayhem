<script setup>
import { computed } from 'vue'

const props = defineProps({ done: { type: Number, default: 0 }, total: { type: Number, default: 0 } })
const r = 42
const circ = 2 * Math.PI * r
const pct = computed(() => (props.total ? Math.round((props.done / props.total) * 100) : 0))
const offset = computed(() => circ * (1 - pct.value / 100))
</script>

<template>
  <div class="relative h-24 w-24 shrink-0" role="img" :aria-label="`${done} of ${total} quests done today`">
    <svg viewBox="0 0 100 100" class="h-full w-full -rotate-90">
      <circle cx="50" cy="50" :r="r" fill="none" stroke="#1e293b" stroke-width="9" />
      <circle cx="50" cy="50" :r="r" fill="none" stroke="#22d3ee" stroke-width="9" stroke-linecap="round" :stroke-dasharray="circ" :stroke-dashoffset="offset" class="transition-all duration-700" />
    </svg>
    <div class="absolute inset-0 flex flex-col items-center justify-center">
      <span class="text-xl font-bold text-white">{{ done }}/{{ total }}</span>
      <span class="text-[10px] text-slate-500">today</span>
    </div>
  </div>
</template>
