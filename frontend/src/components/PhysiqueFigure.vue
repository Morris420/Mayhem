<script setup>
import { computed } from 'vue'

// A front-view silhouette in dark blue with a neon edge. It morphs smoothly from a lean
// build (t = 0) to a heavy, muscular one (t = 1) as you log more workouts.
//
// `stage` is 1..5 and `progress` (0..1) is how far you are towards the next stage, so the
// body changes a little with every workout instead of jumping once per stage.
const props = defineProps({
  stage: { type: Number, default: 1 },
  progress: { type: Number, default: 0 },
})

let counter = 0
const uid = `pf${counter++}${Math.random().toString(36).slice(2, 6)}`

const t = computed(() => Math.min(1, Math.max(0, (props.stage - 1 + props.progress) / 4)))
// Pick a value between "lean" and "buff".
const L = (lean, buff) => lean + (buff - lean) * t.value

const f = (n) => Math.round(n * 10) / 10
const CX = 100

// Smooth curve through points (Catmull-Rom converted to cubic Béziers).
function curve(pts) {
  let d = ''
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] ?? p2
    d += ` C${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])} ${f(p2[1])}`
  }
  return d
}
const pt = (dx, y) => [CX + dx, y]

const sh = computed(() => L(50, 74)) // deltoid outer edge (half-width)
const chest = computed(() => L(36, 50))
const waist = computed(() => L(27, 31))

// Right half of head + neck + torso + leg (the left half is the mirror image).
const body = computed(() => {
  const ankle = L(17, 19)
  const g = L(7, 8) // gap between the ankles
  const pts = [
    pt(L(8, 14), 56), // neck, under the head
    pt(L(9, 17), 72),
    pt(L(11, 20), 78), // neck base
    pt(L(17, 33), 81),
    pt(L(26, 47), 86), // trapezius slope: much fuller when buff
    pt(sh.value - 8, 94), // meets the deltoid
    pt(chest.value, 125), // chest / lats
    pt(L(32, 42), 148),
    pt(waist.value, 176),
    pt(L(30, 37), 205), // hip
    pt(L(35, 46), 238), // thigh
    pt(L(26, 29), 285), // knee
    pt(L(27, 33), 312), // calf
    pt(ankle, 358),
    pt(ankle + 3, 372), // foot
    pt(ankle + 12, 381),
    pt(ankle + 9, 388),
    pt(g + 4, 388),
    pt(g - 1, 380),
    pt(g, 362),
    pt(L(8, 9), 312), // inner leg, going back up
    pt(L(6, 7), 285),
    pt(L(3, 4), 238),
    [CX - 0.6, 215], // crotch (the halves overlap slightly so no seam shows)
  ]
  const [first, ...rest] = pts
  return `M${f(first[0])} ${f(first[1])}${curve([first, ...rest])} L${CX - 0.6} 56 Z`
})

// Head: a smooth egg shape with a fuller jaw.
const head = computed(() => {
  const w = 17
  const pts = [
    [CX - 0.6, 7],
    [CX + 9, 8.5],
    [CX + w - 1, 20],
    [CX + w, 33],
    [CX + w - 2.5, 46],
    [CX + 10, 56],
    [CX + 4.5, 62],
    [CX - 0.6, 63.5],
  ]
  return `M${pts[0][0]} ${pts[0][1]}${curve(pts)} Z`
})

// Right arm: edge positions (relative to deltoid) and thickness per height, lean -> buff.
const arm = computed(() => {
  const rows = [
    // y, outer offset from deltoid, thickness lean, thickness buff
    [104, 0, 24, 38],
    [125, 1, 22, 36],
    [150, 2, 18, 30],
    [165, 3, 19, 28],
    [185, 6, 14, 20],
    [205, 10, 11, 13],
    [220, 13, 13, 16],
    [232, 14, 8, 9],
  ]
  const s = sh.value
  const outer = [pt(s - 24, 88), pt(s - 8, 92), ...rows.map(([y, d]) => pt(s + d, y))]
  const inner = rows
    .slice(2) // the top of the inside edge is hidden behind the torso
    .map(([y, d, a, b]) => pt(s + d - L(a, b), y))
    .reverse()
  const tip = pt(s + 14 - L(4, 4.5), 239)
  const all = [...outer, tip, ...inner]
  return `M${f(all[0][0])} ${f(all[0][1])}${curve(all)} Z`
})

// Muscle definition: each group fades in as the body gets bigger.
const ramp = (from, span = 0.35) => Math.min(1, Math.max(0, (t.value - from) / span))
const details = computed(() => {
  const c = chest.value
  const s = sh.value
  const w = L(9, 12)
  const wa = waist.value
  return [
    // collarbone
    { o: ramp(0, 0.2) * 0.45, d: `M${CX + 4} 89 Q${CX + 16} 90 ${CX + s - 18} 99` },
    // lower edge of the pec + sternum
    { o: ramp(0.05, 0.3), d: `M${CX + c - 4} 118 Q${CX + c * 0.55} ${L(138, 142)} ${CX + 1} 122` },
    { o: ramp(0.05, 0.3) * 0.7, d: `M${CX} 100 V128` },
    // deltoid separation + bicep
    { o: ramp(0.2), d: `M${CX + s - 15} 95 Q${CX + s - 22} 110 ${CX + s - 14} 128` },
    { o: ramp(0.4) * 0.8, d: `M${CX + s - 8} 132 Q${CX + s - 13} 142 ${CX + s - 9} 153` },
    // abs
    { o: ramp(0.2), d: `M${CX} 130 V174` },
    { o: ramp(0.25), d: `M${CX} 142 Q${CX + w / 2} 144.5 ${CX + w} 142 M${CX} 154 Q${CX + w / 2} 156.5 ${CX + w} 154 M${CX} 166 Q${CX + w / 2} 168.5 ${CX + w - 1} 166` },
    // obliques and lats
    { o: ramp(0.35), d: `M${CX + w + 4} 138 Q${CX + w + 8} 156 ${CX + w + 3} 174` },
    { o: ramp(0.5) * 0.9, d: `M${CX + c - 3} 130 Q${CX + c} 152 ${CX + wa + 2} 174` },
    // traps
    { o: ramp(0.55) * 0.9, d: `M${CX + L(12, 22)} 82 Q${CX + L(22, 40)} 86 ${CX + s - 14} 96` },
    // quads and calves
    { o: ramp(0.35), d: `M${CX + L(25, 32)} 240 Q${CX + L(27, 36)} 262 ${CX + L(17, 21)} 282` },
    { o: ramp(0.55) * 0.8, d: `M${CX + L(20, 27)} 296 Q${CX + L(22, 30)} 312 ${CX + L(15, 20)} 330` },
  ]
})
</script>

<template>
  <svg viewBox="0 0 200 400" class="h-full w-full" role="img" :aria-label="`Physique stage ${stage} of 5`" style="filter: drop-shadow(0 0 6px rgba(56, 189, 248, 0.5))">
    <defs>
      <linearGradient :id="`${uid}-fill`" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="400">
        <stop offset="0%" stop-color="#14456f" />
        <stop offset="55%" stop-color="#0b2744" />
        <stop offset="100%" stop-color="#071729" />
      </linearGradient>
      <g :id="`${uid}-half`">
        <path :d="body" />
        <path :d="head" />
        <path :d="arm" />
      </g>
      <g :id="`${uid}-lines`">
        <path v-for="(l, i) in details" :key="i" :d="l.d" :opacity="l.o" />
      </g>
    </defs>

    <ellipse cx="100" cy="391" rx="70" ry="6" fill="none" stroke="#38bdf8" stroke-opacity="0.35" />

    <!-- 1) neon edge: the outline is painted first and then covered by the fill, so only the outer edge shows -->
    <g fill="none" stroke="#38bdf8" stroke-width="3" stroke-linejoin="round">
      <use :href="`#${uid}-half`" />
      <use :href="`#${uid}-half`" transform="translate(200 0) scale(-1 1)" />
    </g>
    <!-- 2) body fill -->
    <g :fill="`url(#${uid}-fill)`">
      <use :href="`#${uid}-half`" />
      <use :href="`#${uid}-half`" transform="translate(200 0) scale(-1 1)" />
    </g>
    <!-- 3) muscle definition -->
    <g fill="none" stroke="#7dd3fc" stroke-width="1.5" stroke-linecap="round">
      <use :href="`#${uid}-lines`" />
      <use :href="`#${uid}-lines`" transform="translate(200 0) scale(-1 1)" />
    </g>
  </svg>
</template>
