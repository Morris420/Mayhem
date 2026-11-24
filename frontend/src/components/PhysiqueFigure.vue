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

// Right half of neck + torso + leg (the left half is the mirror image).
//
// The neck starts at y = 40, which is *behind* the head, and it is always narrower than the
// jaw: that is what makes the head sit on the shoulders instead of stepping out of them.
const body = computed(() => {
  const ankle = L(17, 19)
  const g = L(7, 8) // gap between the ankles
  const pts = [
    pt(L(8.5, 11), 40), // neck, hidden behind the head
    pt(L(8.8, 11.2), 50), // ...and never wider than the jaw, or it steps out of the head
    pt(L(9.5, 13), 58), // neck base
    pt(L(10.5, 15), 64),
    pt(L(12, 19), 69), // the trapezius starts here...
    pt(L(16, 27), 76),
    pt(L(21, 37), 82),
    pt(sh.value - 24, 88), // ...and ends exactly where the arm begins, so there is no seam
    pt(sh.value - 8, 96), // under the deltoid
    pt(chest.value, 120), // chest
    pt(L(33, 44), 145), // lower ribs
    pt(waist.value, 170), // waist: the narrowest point
    pt(L(29, 35), 190), // iliac crest
    pt(L(31, 38), 208), // hip
    pt(L(35, 46), 240), // thigh
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
    pt(L(3, 4), 240),
    [CX - 0.6, 216], // crotch (the halves overlap slightly so no seam shows)
  ]
  const [first, ...rest] = pts
  return `M${f(first[0])} ${f(first[1])}${curve([first, ...rest])} L${CX - 0.6} 40 Z`
})

// Head: a skull, not an egg. Round cranium, widest at the temples, then a jaw that
// tapers to the chin. It is the same at every stage, because training does not
// change your head - which is also what makes the body read as bigger.
const head = computed(() => {
  const pts = [
    [CX - 0.6, 6],
    [CX + 7, 7.5], // crown
    [CX + 14.5, 14],
    [CX + 17, 25], // temple: the widest point
    [CX + 17, 34], // cheek, held wide so the taper below reads as a jaw
    [CX + 15.5, 42], // jaw angle
    [CX + 11, 50], // jawline
    [CX + 5, 56], // chin corner
    [CX - 0.6, 58], // chin
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
  // the corner at the top of this shape starts inside the torso, so only the round
  // part of the deltoid ever shows
  const outer = [pt(s - 32, 85), pt(s - 15, 92), pt(s - 4, 99), ...rows.map(([y, d]) => pt(s + d, y))]
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
  const w = L(9, 13)
  const wa = waist.value
  return [
    // the hollow at the base of the throat, and the collarbone running out to the shoulder
    { o: ramp(0, 0.25) * 0.5, d: `M${CX + 4} 92 Q${CX + 18} 94 ${CX + s - 19} 102` },
    // lower edge of the pec + sternum
    { o: ramp(0.05, 0.3), d: `M${CX + c - 5} 113 Q${CX + c * 0.5} ${L(130, 133)} ${CX + 1} 118` },
    { o: ramp(0.05, 0.3) * 0.7, d: `M${CX} 96 V124` },
    // deltoid separation + bicep
    { o: ramp(0.2), d: `M${CX + s - 15} 96 Q${CX + s - 22} 110 ${CX + s - 14} 128` },
    { o: ramp(0.4) * 0.8, d: `M${CX + s - 8} 132 Q${CX + s - 13} 142 ${CX + s - 9} 153` },
    // abs
    { o: ramp(0.2), d: `M${CX} 126 V166` },
    { o: ramp(0.25), d: `M${CX} 136 Q${CX + w / 2} 138.5 ${CX + w} 136 M${CX} 147 Q${CX + w / 2} 149.5 ${CX + w} 147 M${CX} 158 Q${CX + w / 2} 160.5 ${CX + w - 1} 158` },
    // obliques and lats
    { o: ramp(0.35), d: `M${CX + w + 4} 133 Q${CX + w + 8} 151 ${CX + w + 3} 168` },
    { o: ramp(0.5) * 0.9, d: `M${CX + c - 3} 126 Q${CX + c} 148 ${CX + wa + 2} 168` },
    // the V over the hips, which is what makes the waist read as a waist
    { o: ramp(0.3) * 0.85, d: `M${CX + L(21, 26)} 182 Q${CX + L(17, 21)} 199 ${CX + 5} 212` },
    // traps, following the slope down to the shoulder
    { o: ramp(0.5) * 0.9, d: `M${CX + L(10, 14)} 70 Q${CX + L(19, 33)} 79 ${CX + s - 21} 94` },
    // quads and calves
    { o: ramp(0.35), d: `M${CX + L(25, 32)} 242 Q${CX + L(27, 36)} 264 ${CX + L(17, 21)} 284` },
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
