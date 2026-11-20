<script setup>
import { computed, ref } from 'vue'

// Bar chart of the last N days. Hand-drawn SVG: no chart library needed.
const props = defineProps({ data: { type: Array, required: true } })

const metric = ref('completed') // 'completed' | 'xp'

const W = 560, H = 190
const pad = { left: 30, right: 6, top: 18, bottom: 26 }

const values = computed(() => props.data.map((d) => d[metric.value]))
// Round the top of the scale up to something tidy so gridlines read nicely.
const max = computed(() => {
  const m = Math.max(...values.value, 0)
  if (metric.value === 'completed') return Math.max(4, m)
  return Math.max(50, Math.ceil(m / 50) * 50)
})

const slot = computed(() => (W - pad.left - pad.right) / props.data.length)
const barW = computed(() => Math.min(24, slot.value * 0.62))
const plotH = H - pad.top - pad.bottom

const bars = computed(() =>
  props.data.map((d, i) => {
    const v = d[metric.value]
    const h = (v / max.value) * plotH
    const date = new Date(d.date + 'T00:00:00')
    return {
      x: pad.left + i * slot.value + (slot.value - barW.value) / 2,
      y: pad.top + plotH - h,
      h,
      v,
      label: String(date.getDate()),
      isToday: i === props.data.length - 1,
      tip: `${date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}: ${d.completed} quest${d.completed === 1 ? '' : 's'} · ${d.xp} XP`,
    }
  }),
)

const gridLines = computed(() =>
  [0, 0.5, 1].map((f) => ({ y: pad.top + plotH - f * plotH, label: Math.round(max.value * f) })),
)
const total = computed(() => values.value.reduce((a, b) => a + b, 0))
const toggle = 'rounded-md px-2.5 py-1 text-xs font-medium transition-colors'
</script>

<template>
  <div>
    <div class="mb-2 flex items-center justify-between">
      <span class="text-xs text-slate-400">
        Last {{ data.length }} days · <strong class="text-slate-100">{{ total }}</strong> {{ metric === 'xp' ? 'XP' : 'quests' }}
      </span>
      <div class="flex gap-0.5 rounded-lg bg-slate-800 p-0.5">
        <button type="button" :class="[toggle, metric === 'completed' ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-slate-200']" @click="metric = 'completed'">Quests</button>
        <button type="button" :class="[toggle, metric === 'xp' ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-slate-200']" @click="metric = 'xp'">XP</button>
      </div>
    </div>

    <svg :viewBox="`0 0 ${W} ${H}`" class="h-auto w-full" role="img" :aria-label="`Bar chart of ${metric === 'xp' ? 'XP earned' : 'quests completed'} over the last ${data.length} days`">
      <defs>
        <linearGradient id="bar-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#22d3ee" />
          <stop offset="100%" stop-color="#0ea5e9" />
        </linearGradient>
      </defs>

      <g v-for="g in gridLines" :key="g.y">
        <line :x1="pad.left" :x2="W - pad.right" :y1="g.y" :y2="g.y" stroke="#1e293b" stroke-dasharray="3 4" />
        <text :x="pad.left - 6" :y="g.y + 3" text-anchor="end" font-size="9" fill="#64748b">{{ g.label }}</text>
      </g>

      <g v-for="(b, i) in bars" :key="i">
        <title>{{ b.tip }}</title>
        <!-- faint track so empty days still show a slot -->
        <rect :x="b.x" :y="pad.top" :width="barW" :height="plotH" rx="3" fill="#111827" />
        <rect v-if="b.v > 0" :x="b.x" :y="b.y" :width="barW" :height="b.h" rx="3" :fill="b.isToday ? 'url(#bar-grad)' : '#334155'" />
        <text v-if="b.v > 0" :x="b.x + barW / 2" :y="b.y - 4" text-anchor="middle" font-size="9" fill="#cbd5e1">{{ b.v }}</text>
        <text :x="b.x + barW / 2" :y="H - 8" text-anchor="middle" font-size="9" :fill="b.isToday ? '#22d3ee' : '#64748b'" :font-weight="b.isToday ? 'bold' : 'normal'">{{ b.label }}</text>
      </g>
    </svg>
  </div>
</template>
