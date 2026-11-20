<script setup>
import { computed } from 'vue'
import { WEEKDAYS } from '@/lib/tiers'

// Edits a quest schedule. v-model is { mode: 'none'|'weekly'|'date', days: [], date: '' }.
const model = defineModel({ type: Object, required: true })

const modes = [
  { value: 'none', label: 'No schedule' },
  { value: 'weekly', label: 'Repeat weekly' },
  { value: 'date', label: 'One date' },
]

const allDays = computed(() => model.value.days.length === 7)

function setMode(mode) {
  const next = { ...model.value, mode }
  // Switching to weekly with nothing picked yet: start from every day so it is never empty.
  if (mode === 'weekly' && next.days.length === 0) next.days = [1, 2, 3, 4, 5, 6, 7]
  model.value = next
}

function toggleDay(n) {
  const days = model.value.days.includes(n) ? model.value.days.filter((d) => d !== n) : [...model.value.days, n].sort()
  model.value = { ...model.value, days }
}

function toggleEvery() {
  model.value = { ...model.value, days: allDays.value ? [] : [1, 2, 3, 4, 5, 6, 7] }
}
</script>

<template>
  <div class="space-y-3">
    <div class="inline-flex rounded-lg bg-slate-800 p-0.5 text-xs" role="group" aria-label="Schedule type">
      <button v-for="m in modes" :key="m.value" type="button" :aria-pressed="model.mode === m.value" class="rounded-md px-3 py-1.5 font-medium transition-colors" :class="model.mode === m.value ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-slate-200'" @click="setMode(m.value)">
        {{ m.label }}
      </button>
    </div>

    <div v-if="model.mode === 'weekly'" class="space-y-2">
      <div class="flex flex-wrap gap-1.5">
        <button v-for="d in WEEKDAYS" :key="d.n" type="button" :aria-pressed="model.days.includes(d.n)" :aria-label="d.long" class="h-9 w-11 rounded-lg border text-xs font-semibold transition-colors" :class="model.days.includes(d.n) ? 'border-cyan-500 bg-cyan-500/15 text-cyan-200' : 'border-slate-700 text-slate-400 hover:border-slate-500'" @click="toggleDay(d.n)">
          {{ d.short }}
        </button>
      </div>
      <label class="flex cursor-pointer items-center gap-2 text-xs text-slate-300">
        <input type="checkbox" :checked="allDays" class="h-4 w-4 accent-cyan-500" @change="toggleEvery" />
        Every day of the week
      </label>
    </div>

    <input v-else-if="model.mode === 'date'" v-model="model.date" type="date" class="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 focus:outline-none" aria-label="Date" />
  </div>
</template>
