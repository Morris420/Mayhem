<script setup>
import { computed } from 'vue'
import AppIcon from './AppIcon.vue'
import { RANKS, rankInfo, rankProgress } from '@/lib/ranks'
import { hunterId } from '@/lib/tiers'

// The hero card at the top of the dashboard. It looks more impressive the higher your rank,
// and shows the things you earned: level, title, streaks, medals.
const props = defineProps({
  user: { type: Object, required: true },
  stats: { type: Object, required: true },
  today: { type: Object, required: true },
  achievements: { type: Array, default: () => [] },
  gym: { type: Object, default: null }, // /api/gym payload (optional)
  dietStreak: { type: Number, default: 0 },
})

const r = computed(() => rankInfo(props.user.rank))
const progress = computed(() => rankProgress(props.user.level))

// Level ring around the crest: how far to the next level.
const RING = 2 * Math.PI * 58
const ringOffset = computed(() => RING * (1 - props.user.progress_pct / 100))

const medals = computed(() => {
  const weight = { S: 6, A: 5, B: 4, C: 3, D: 2, E: 1 }
  return props.achievements
    .filter((a) => a.unlocked)
    .sort((a, b) => (weight[b.tier] ?? 0) - (weight[a.tier] ?? 0) || String(b.unlocked_at).localeCompare(String(a.unlocked_at)))
    .slice(0, 4)
})
const emptyMedals = computed(() => Math.max(0, 4 - medals.value.length))

// Title shown under the name: your newest top achievement, else the rank title.
const title = computed(() => medals.value[0]?.name ?? props.user.title)

const embers = Array.from({ length: 14 }, (_, i) => ({ left: `${(i * 37) % 100}%`, delay: `${(i * 0.7) % 6}s`, size: 2 + (i % 3) }))

const frame = computed(() => {
  const g = r.value.glow
  return {
    borderColor: r.value.color,
    boxShadow: g ? `0 0 ${10 + g * 8}px ${r.value.soft}, inset 0 0 ${20 + g * 10}px ${r.value.soft}` : 'none',
    background: `radial-gradient(ellipse at 12% 0%, ${r.value.soft}, transparent 55%), radial-gradient(ellipse at 100% 100%, ${r.value.soft}, transparent 50%), #0a0f19`,
  }
})

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}
</script>

<template>
  <header class="relative overflow-hidden rounded-2xl border-2 p-5 sm:p-6" :style="frame" :data-rank="user.rank">
    <!-- decoration that grows with rank -->
    <div v-if="r.glow >= 2" class="pointer-events-none absolute inset-0 opacity-[0.07]" aria-hidden="true" :style="{ backgroundImage: `repeating-linear-gradient(60deg, ${r.color} 0 1px, transparent 1px 38px), repeating-linear-gradient(-60deg, ${r.color} 0 1px, transparent 1px 38px)` }"></div>
    <div v-if="r.glow >= 3" class="banner-sheen pointer-events-none absolute inset-x-0 top-0 h-0.5" aria-hidden="true" :style="{ backgroundImage: `linear-gradient(90deg, transparent, ${r.color}, transparent)` }"></div>
    <div v-if="r.glow >= 4" class="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <span v-for="(e, i) in embers" :key="i" class="ember absolute bottom-0 rounded-full" :style="{ left: e.left, animationDelay: e.delay, width: e.size + 'px', height: e.size + 'px', background: r.color }"></span>
    </div>

    <div class="relative flex flex-col gap-6 md:flex-row md:items-center">
      <!-- crest -->
      <div class="flex shrink-0 justify-center md:block">
        <div class="relative h-32 w-32 shrink-0 sm:h-36 sm:w-36" role="img" :aria-label="`Rank ${user.rank}, level ${user.level}`">
          <svg viewBox="0 0 140 140" class="h-full w-full -rotate-90" aria-hidden="true">
            <circle cx="70" cy="70" r="58" fill="none" stroke="rgba(148,163,184,0.15)" stroke-width="5" />
            <circle cx="70" cy="70" r="58" fill="none" :stroke="r.color" stroke-width="5" stroke-linecap="round" :stroke-dasharray="RING" :stroke-dashoffset="ringOffset" style="transition: stroke-dashoffset 0.9s ease" />
          </svg>
          <svg viewBox="0 0 100 100" class="absolute inset-0 m-auto h-[68%] w-[68%]" aria-hidden="true">
            <polygon points="50,4 91,27 91,73 50,96 9,73 9,27" :fill="r.soft" :stroke="r.color" stroke-width="3" :class="r.glow >= 4 && 'crest-pulse'" />
            <polygon v-if="r.glow >= 2" points="50,14 83,33 83,67 50,86 17,67 17,33" fill="none" :stroke="r.color" stroke-width="1" opacity="0.5" />
            <text x="50" y="64" text-anchor="middle" font-size="44" font-weight="800" :fill="r.color" font-family="inherit">{{ user.rank }}</text>
          </svg>
          <span class="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full border bg-[#0a0f19] px-3 py-0.5 text-xs font-bold whitespace-nowrap text-white" :style="{ borderColor: r.color }">Level {{ user.level }}</span>
        </div>

      </div>

      <!-- identity + progress -->
      <div class="min-w-0 flex-1">
        <div>
          <p class="text-sm text-slate-400">{{ greeting() }}</p>
          <h1 class="truncate text-2xl font-bold text-white sm:text-3xl">{{ user.username }}</h1>
          <p class="mt-0.5 text-base font-semibold" :style="{ color: r.color }">{{ title }}</p>
        </div>
        <p class="mt-1 text-xs tracking-wide text-slate-400 uppercase">{{ user.rank }}-rank · {{ r.name }} · {{ user.guild }} · {{ hunterId(user.id) }}</p>

        <div class="mt-4">
          <div class="mb-1.5 flex justify-between text-xs">
            <span class="text-slate-400">Level {{ user.level }} → {{ user.level + 1 }}</span>
            <span class="font-medium text-slate-200">{{ user.xp_into_level }} / {{ user.xp_for_next }} XP</span>
          </div>
          <div class="h-2 overflow-hidden rounded-full bg-slate-800" role="progressbar" :aria-valuenow="user.progress_pct" aria-valuemin="0" aria-valuemax="100" aria-label="XP progress to next level">
            <div class="h-full rounded-full transition-all duration-700" :style="{ width: user.progress_pct + '%', background: r.color }"></div>
          </div>
        </div>

        <!-- rank track -->
        <div class="mt-4 flex items-center gap-1.5" :aria-label="progress.next ? `${progress.levelsLeft} levels to ${progress.next.rank}-rank` : 'Highest rank reached'">
          <template v-for="(k, i) in RANKS" :key="k.rank">
            <span class="flex h-6 w-6 items-center justify-center rounded-md border text-[11px] font-bold" :style="k.min <= user.level ? { borderColor: k.color, color: k.color, background: k.soft } : { borderColor: '#1e293b', color: '#475569' }">{{ k.rank }}</span>
            <span v-if="i < RANKS.length - 1" class="h-px w-3 sm:w-6" :style="{ background: RANKS[i + 1].min <= user.level ? RANKS[i + 1].color : '#1e293b' }"></span>
          </template>
          <span class="ml-2 text-xs text-slate-500">{{ progress.next ? `${progress.levelsLeft} level${progress.levelsLeft === 1 ? '' : 's'} to ${progress.next.rank}-rank` : 'Top rank reached' }}</span>
        </div>

        <dl class="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <div class="flex items-center gap-2.5 rounded-lg bg-slate-800/60 px-3 py-2"><AppIcon name="flame" class="h-4 w-4 shrink-0 text-amber-400" /><div><dd class="leading-none font-bold text-white">{{ stats.streak }} day streak</dd><dt class="mt-0.5 text-[11px] text-slate-400">quests</dt></div></div>
          <div class="flex items-center gap-2.5 rounded-lg bg-slate-800/60 px-3 py-2"><AppIcon name="target" class="h-4 w-4 shrink-0 text-cyan-300" /><div><dd class="leading-none font-bold text-white">{{ stats.completions }}</dd><dt class="mt-0.5 text-[11px] text-slate-400">quests cleared</dt></div></div>
          <div class="flex items-center gap-2.5 rounded-lg bg-slate-800/60 px-3 py-2"><AppIcon name="dumbbell" class="h-4 w-4 shrink-0 text-emerald-300" /><div><dd class="leading-none font-bold text-white">{{ gym?.stats.sessions ?? 0 }}</dd><dt class="mt-0.5 text-[11px] text-slate-400">workouts{{ gym ? ' · ' + gym.physique.name : '' }}</dt></div></div>
          <div class="flex items-center gap-2.5 rounded-lg bg-slate-800/60 px-3 py-2"><AppIcon name="utensils" class="h-4 w-4 shrink-0 text-lime-300" /><div><dd class="leading-none font-bold text-white">{{ dietStreak }}</dd><dt class="mt-0.5 text-[11px] text-slate-400">diet streak</dt></div></div>
        </dl>
      </div>

      <!-- medals -->
      <div class="md:w-44 md:shrink-0">
        <p class="mb-2 text-xs tracking-wide text-slate-400 uppercase">Medals · {{ stats.achievements_unlocked }}/{{ stats.achievements_total }}</p>
        <ul class="flex gap-2 md:grid md:grid-cols-2" aria-label="Top achievements">
          <li v-for="m in medals" :key="m.id" class="flex h-14 w-14 items-center justify-center rounded-xl border bg-amber-400/10 text-amber-300 md:h-[4.5rem] md:w-full" :style="{ borderColor: 'rgba(251,191,36,0.45)' }" :title="`${m.name}: ${m.description}`">
            <AppIcon :name="m.icon" class="h-6 w-6" />
          </li>
          <li v-for="n in emptyMedals" :key="'e' + n" class="flex h-14 w-14 items-center justify-center rounded-xl border border-dashed border-slate-700 text-slate-700 md:h-[4.5rem] md:w-full" aria-hidden="true"><AppIcon name="lock" class="h-5 w-5" /></li>
        </ul>
      </div>
    </div>
  </header>
</template>
