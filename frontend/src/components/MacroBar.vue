<script setup>
import { computed } from 'vue'

// One goal: a label, a bar and a plain-language status ("310 kcal to go").
const props = defineProps({
  label: String,
  value: { type: Number, default: 0 },
  goal: { type: Number, default: 0 },
  unit: String,
  // 'under' | 'on' | 'over' for calories; 'under' | 'on' for protein (on = reached)
  state: { type: String, default: 'under' },
})

const pct = computed(() => Math.min(100, props.goal ? (props.value / props.goal) * 100 : 0))
const colors = {
  under: { bar: 'bg-sky-400', text: 'text-slate-400' },
  on: { bar: 'bg-emerald-400', text: 'text-emerald-300' },
  over: { bar: 'bg-amber-400', text: 'text-amber-300' },
}
const msg = computed(() => {
  const diff = Math.round(props.goal - props.value)
  if (props.state === 'on') return props.label === 'Protein' ? 'Goal reached' : 'On target'
  if (props.state === 'over') return `${Math.abs(diff)} ${props.unit} over`
  return `${diff} ${props.unit} to go`
})
</script>

<template>
  <div>
    <div class="mb-1.5 flex items-baseline justify-between">
      <span class="text-sm font-medium text-slate-200">{{ label }}</span>
      <span class="text-xs" :class="colors[state].text">{{ msg }}</span>
    </div>
    <div class="h-2.5 overflow-hidden rounded-full bg-slate-800" role="progressbar" :aria-valuenow="Math.round(pct)" aria-valuemin="0" aria-valuemax="100" :aria-label="`${label} progress`">
      <div class="h-full rounded-full transition-all duration-700" :class="colors[state].bar" :style="{ width: pct + '%' }"></div>
    </div>
    <div class="mt-1.5 text-2xl font-bold text-white tabular-nums">
      {{ Math.round(value) }} <span class="text-sm font-normal text-slate-500">/ {{ goal }} {{ unit }}</span>
    </div>
  </div>
</template>
