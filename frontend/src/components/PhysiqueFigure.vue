<script setup>
import { computed } from 'vue'

// Neon-blue body that gets visibly bigger and more defined with each stage (1..5).
const props = defineProps({ stage: { type: Number, default: 1 } })

const t = computed(() => (Math.min(5, Math.max(1, props.stage)) - 1) / 4) // 0..1
const lerp = (a, b) => a + (b - a) * t.value

const sw = computed(() => lerp(30, 54)) // half shoulder width
const ww = computed(() => lerp(21, 25)) // half waist width
const arm = computed(() => lerp(9, 19)) // arm thickness
const leg = computed(() => lerp(13, 24)) // leg thickness
const delt = computed(() => lerp(7, 15)) // shoulder cap radius
const neck = computed(() => lerp(12, 21))

const cx = 100
const torso = computed(
  () => `M${cx - sw.value} 84 Q${cx} 74 ${cx + sw.value} 84 L${cx + ww.value} 170 Q${cx} 178 ${cx - ww.value} 170 Z`,
)
// Limbs are drawn as a thick polyline: a neon outline under a dark fill.
const limbs = computed(() => {
  const a = sw.value + 6
  return [
    { pts: `${cx - a},96 ${cx - a - 8},142 ${cx - a - 5},188`, w: arm.value },
    { pts: `${cx + a},96 ${cx + a + 8},142 ${cx + a + 5},188`, w: arm.value },
    { pts: `${cx - ww.value / 2 - 4},176 ${cx - ww.value / 2 - 8},240 ${cx - ww.value / 2 - 6},300`, w: leg.value },
    { pts: `${cx + ww.value / 2 + 4},176 ${cx + ww.value / 2 + 8},240 ${cx + ww.value / 2 + 6},300`, w: leg.value },
  ]
})
const shoulders = computed(() => [cx - sw.value + 2, cx + sw.value - 2])
</script>

<template>
  <svg viewBox="0 0 200 330" class="h-full w-full" role="img" :aria-label="`Physique stage ${stage} of 5`" style="filter: drop-shadow(0 0 7px rgba(34, 211, 238, 0.55))">
    <defs>
      <linearGradient id="phys-body" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#0e3a52" />
        <stop offset="100%" stop-color="#08202f" />
      </linearGradient>
    </defs>

    <ellipse cx="100" cy="316" rx="62" ry="7" fill="none" stroke="#22d3ee" stroke-opacity="0.5" />

    <!-- limbs: outline first, then the dark fill on top -->
    <template v-for="(l, i) in limbs" :key="i">
      <polyline :points="l.pts" fill="none" stroke="#22d3ee" :stroke-width="l.w + 3" stroke-linecap="round" stroke-linejoin="round" />
    </template>
    <template v-for="(l, i) in limbs" :key="'f' + i">
      <polyline :points="l.pts" fill="none" stroke="url(#phys-body)" :stroke-width="l.w" stroke-linecap="round" stroke-linejoin="round" />
    </template>

    <!-- neck + head -->
    <rect :x="cx - neck / 2" y="52" :width="neck" height="30" rx="4" fill="url(#phys-body)" stroke="#22d3ee" stroke-width="1.6" />
    <circle cx="100" cy="38" r="17" fill="url(#phys-body)" stroke="#22d3ee" stroke-width="2" />

    <!-- torso -->
    <path :d="torso" fill="url(#phys-body)" stroke="#22d3ee" stroke-width="2.4" stroke-linejoin="round" />

    <!-- shoulder caps -->
    <circle v-for="x in shoulders" :key="x" :cx="x" cy="92" :r="delt" fill="url(#phys-body)" stroke="#22d3ee" stroke-width="2" />

    <!-- definition appears with each stage -->
    <g fill="none" stroke="#67e8f9" stroke-width="1.6" stroke-linecap="round" stroke-opacity="0.85">
      <template v-if="stage >= 2">
        <path :d="`M${cx - sw * 0.62} 108 Q${cx - sw * 0.3} 122 ${cx} 112`" />
        <path :d="`M${cx + sw * 0.62} 108 Q${cx + sw * 0.3} 122 ${cx} 112`" />
      </template>
      <template v-if="stage >= 3">
        <path :d="`M${cx} 126 L${cx} 166`" />
        <path :d="`M${cx - 11} 138 H${cx + 11} M${cx - 11} 150 H${cx + 11} M${cx - 10} 162 H${cx + 10}`" />
      </template>
      <template v-if="stage >= 4">
        <path :d="`M${cx - sw * 0.9} 112 Q${cx - ww * 1.2} 140 ${cx - ww} 166`" />
        <path :d="`M${cx + sw * 0.9} 112 Q${cx + ww * 1.2} 140 ${cx + ww} 166`" />
        <path :d="`M${cx - ww / 2 - 8} 196 Q${cx - ww / 2 - 4} 226 ${cx - ww / 2 - 7} 246`" />
        <path :d="`M${cx + ww / 2 + 8} 196 Q${cx + ww / 2 + 4} 226 ${cx + ww / 2 + 7} 246`" />
      </template>
      <template v-if="stage >= 5">
        <path :d="`M${cx - neck / 2 - 1} 70 L${cx - sw * 0.6} 88`" />
        <path :d="`M${cx + neck / 2 + 1} 70 L${cx + sw * 0.6} 88`" />
        <circle :cx="cx - sw - 9" cy="120" r="4.5" stroke-opacity="0.7" />
        <circle :cx="cx + sw + 9" cy="120" r="4.5" stroke-opacity="0.7" />
      </template>
    </g>
  </svg>
</template>
