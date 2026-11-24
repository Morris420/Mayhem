<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import BodyPartIcon from '@/components/BodyPartIcon.vue'
import DayDetail from '@/components/DayDetail.vue'
import GooglePanel from '@/components/GooglePanel.vue'
import { api, describeError } from '@/lib/api'
import { useGameStore } from '@/stores/game'
import { useGoogleStore } from '@/stores/google'
import { useToastStore } from '@/stores/toasts'
import { TIER_META, addDays, fromISO, mondayOf, toISO } from '@/lib/tiers'

const game = useGameStore()
const google = useGoogleStore()
const toasts = useToastStore()

const HOUR_PX = 52
const GUTTER = '3.25rem'
const hours = Array.from({ length: 24 }, (_, i) => i)

// --- state --------------------------------------------------------------
const anchor = ref(new Date()) // the day you are looking at (the whole week is shown on wide screens)
const week = ref(null)
const error = ref('')
const loading = ref(false)
const busyId = ref(null)
const openDay = ref(null)
const googleOpen = ref(null) // null = automatic (open until connected)
const scroller = ref(null)
const now = ref(new Date())

const mq = typeof window !== 'undefined' ? window.matchMedia('(max-width: 767px)') : null
const isMobile = ref(mq?.matches ?? false)
const onMq = (e) => (isMobile.value = e.matches)

const weekStart = computed(() => mondayOf(anchor.value))
const anchorISO = computed(() => toISO(anchor.value))
const todayISO = computed(() => toISO(now.value))
const showGoogle = computed(() => googleOpen.value ?? (!!google.status && !google.status.connected))

const days = computed(() => {
  const all = week.value?.days ?? []
  return isMobile.value ? all.filter((d) => d.date === anchorISO.value) : all
})

const title = computed(() => {
  if (isMobile.value) return anchor.value.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
  const end = addDays(weekStart.value, 6)
  const f = (d, o) => d.toLocaleDateString(undefined, o)
  return `${f(weekStart.value, { day: 'numeric', month: 'short' })} – ${f(end, { day: 'numeric', month: 'short', year: 'numeric' })}`
})
const isCurrent = computed(() => (isMobile.value ? anchorISO.value === todayISO.value : toISO(weekStart.value) === toISO(mondayOf(now.value))))

const tzLabel = computed(() => {
  const off = -new Date().getTimezoneOffset() / 60
  const sign = off >= 0 ? '+' : '-'
  const abs = Math.abs(off)
  const h = Math.floor(abs)
  const m = Math.round((abs - h) * 60)
  return `GMT${sign}${h}${m ? ':' + String(m).padStart(2, '0') : ''}`
})

// --- loading ------------------------------------------------------------
let seq = 0
async function load() {
  const mine = ++seq
  error.value = ''
  loading.value = true
  try {
    const res = await api.get(`/calendar?start=${toISO(weekStart.value)}&days=7`)
    if (mine === seq) week.value = res
  } catch (e) {
    if (mine === seq) error.value = describeError(e)
  } finally {
    if (mine === seq) loading.value = false
  }
}

watch(() => toISO(weekStart.value), load)

function step(dir) {
  anchor.value = addDays(anchor.value, dir * (isMobile.value ? 1 : 7))
}
function goToday() {
  anchor.value = new Date()
  nextTick(scrollToNow)
}

async function complete(item) {
  busyId.value = item.task_id
  try {
    await game.completeTask(item.task_id)
    await load()
  } catch (e) {
    toasts.push({ title: 'Could not complete quest', message: e.message, kind: 'info', icon: 'alert' })
  } finally {
    busyId.value = null
  }
}

// --- layout -------------------------------------------------------------
const toMin = (t) => (t ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) : 0)
const dayName = (iso) => fromISO(iso).toLocaleDateString(undefined, { weekday: 'short' })
const dayNum = (iso) => fromISO(iso).getDate()
const pad = (n) => String(n).padStart(2, '0')

/** Timed Google events for one day as positioned blocks (overlaps share the width). */
function blocks(day) {
  const segs = (day.events ?? [])
    .filter((e) => !e.all_day)
    .map((e) => {
      const start = e.start_date === day.date ? toMin(e.start_time) : 0
      let end = e.end_date === day.date ? toMin(e.end_time) : 1440
      if (end <= start) end = Math.min(1440, start + 30)
      return { ev: e, start, end: Math.max(end, start + 24) }
    })
    .sort((a, b) => a.start - b.start || b.end - a.end)

  // greedy column assignment inside each group of overlapping events
  const out = []
  let group = []
  let groupEnd = -1
  const flush = () => {
    const cols = []
    for (const s of group) {
      let c = cols.findIndex((end) => end <= s.start)
      if (c === -1) {
        c = cols.length
        cols.push(0)
      }
      cols[c] = s.end
      s.col = c
    }
    for (const s of group) out.push({ ...s, cols: cols.length })
    group = []
  }
  for (const s of segs) {
    if (group.length && s.start >= groupEnd) flush()
    group.push(s)
    groupEnd = Math.max(groupEnd, s.end)
  }
  if (group.length) flush()

  return out.map((b) => ({
    key: b.ev.id + day.date,
    ev: b.ev,
    style: {
      top: `${(b.start / 60) * HOUR_PX}px`,
      height: `${Math.max(((b.end - b.start) / 60) * HOUR_PX - 2, 20)}px`,
      left: `calc(${(b.col / b.cols) * 100}% + 2px)`,
      width: `calc(${100 / b.cols}% - 4px)`,
    },
    short: b.end - b.start < 50,
  }))
}

const allDay = (day) => (day.events ?? []).filter((e) => e.all_day)
const maxQuests = computed(() => (isMobile.value ? 50 : 3))

const nowTop = computed(() => ((now.value.getHours() * 60 + now.value.getMinutes()) / 60) * HOUR_PX)

function scrollToNow() {
  if (!scroller.value) return
  const showsToday = days.value.some((d) => d.date === todayISO.value)
  const target = showsToday ? nowTop.value - HOUR_PX * 2 : HOUR_PX * 7
  scroller.value.scrollTop = Math.max(0, target)
}

// --- touch: swipe sideways = previous/next day on a phone ------------------
let touch = null
function onTouchStart(e) {
  touch = isMobile.value ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null
}
function onTouchEnd(e) {
  if (!touch) return
  const dx = e.changedTouches[0].clientX - touch.x
  const dy = e.changedTouches[0].clientY - touch.y
  touch = null
  if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.8) step(dx < 0 ? 1 : -1)
}

// --- lifecycle ---------------------------------------------------------
let timer
onMounted(async () => {
  mq?.addEventListener('change', onMq)
  timer = setInterval(() => (now.value = new Date()), 60_000)
  await load()
  await nextTick()
  scrollToNow()
})
onBeforeUnmount(() => {
  mq?.removeEventListener('change', onMq)
  clearInterval(timer)
})
</script>

<template>
  <div class="flex flex-col gap-3" :style="{ minHeight: 'calc(100dvh - 8.5rem)' }">
    <!-- toolbar -->
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="min-w-0">
        <h1 class="text-xl font-bold text-white">Calendar</h1>
        <p class="truncate text-sm text-slate-400" aria-live="polite">{{ title }}</p>
      </div>

      <div class="flex items-center gap-2">
        <span v-if="week && !isMobile" class="mr-1 hidden text-sm text-slate-400 lg:inline">
          <strong class="text-slate-100">{{ week.summary.done }}</strong> of {{ week.summary.planned }} done ·
          <strong class="text-slate-100">{{ week.summary.xp_done }}</strong> / {{ week.summary.xp_planned }} XP
        </span>
        <button type="button" class="flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:border-slate-500 hover:text-white" :aria-expanded="showGoogle" @click="googleOpen = !showGoogle">
          <span class="h-2 w-2 rounded-full" :class="google.status?.connected ? 'bg-emerald-400' : 'bg-slate-600'"></span>
          Google
        </button>
        <button type="button" class="rounded-lg border border-slate-700 p-2 text-slate-300 hover:border-slate-500 hover:text-white" :aria-label="isMobile ? 'Previous day' : 'Previous week'" @click="step(-1)"><AppIcon name="chevron-left" class="h-4 w-4" /></button>
        <button type="button" :disabled="isCurrent" class="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:border-slate-500 hover:text-white disabled:opacity-40" @click="goToday">{{ isMobile ? 'Today' : 'This week' }}</button>
        <button type="button" class="rounded-lg border border-slate-700 p-2 text-slate-300 hover:border-slate-500 hover:text-white" :aria-label="isMobile ? 'Next day' : 'Next week'" @click="step(1)"><AppIcon name="chevron-right" class="h-4 w-4" /></button>
      </div>
    </div>

    <div v-show="showGoogle"><GooglePanel @synced="load" /></div>

    <div v-if="error" class="rounded-xl border border-red-500/40 bg-red-500/10 p-6 text-center text-sm text-red-300">
      {{ error }} <button type="button" class="ml-3 underline" @click="load">Retry</button>
    </div>

    <div v-else-if="!week" class="animate-pulse rounded-xl border border-slate-800 bg-slate-900/50 p-10 text-center text-sm text-slate-500">Loading…</div>

    <!-- the grid: one scroll area, day header + all-day band stay pinned on top -->
    <div v-else ref="scroller" class="relative min-h-[28rem] flex-1 overflow-y-auto rounded-xl border border-slate-800 bg-slate-900/40 transition-opacity" :class="loading && 'opacity-60'" :style="{ maxHeight: 'calc(100dvh - 11rem)' }" aria-label="Week calendar" @touchstart.passive="onTouchStart" @touchend.passive="onTouchEnd">
      <!-- pinned header -->
      <div class="sticky top-0 z-20 border-b border-slate-800 bg-[#0d1119]">
        <div class="grid" :style="{ gridTemplateColumns: `${GUTTER} repeat(${days.length}, minmax(0, 1fr))` }">
          <div class="flex items-end justify-center pb-2 text-[11px] text-slate-500">{{ tzLabel }}</div>

          <section v-for="d in days" :key="d.date" :aria-label="d.date" class="min-w-0 border-l border-slate-800/80 px-1.5 pt-2 pb-2">
            <button type="button" class="mx-auto flex flex-col items-center rounded-lg px-2 py-0.5 hover:bg-slate-800/60" :aria-label="`Open journal for ${d.date}`" @click="openDay = d.date">
              <span class="text-[11px] font-medium uppercase" :class="d.is_today ? 'text-cyan-300' : 'text-slate-500'">{{ dayName(d.date) }}</span>
              <span class="flex h-9 w-9 items-center justify-center rounded-full text-lg font-semibold" :class="d.is_today ? 'bg-cyan-500 text-slate-950' : 'text-slate-200'">{{ dayNum(d.date) }}</span>
            </button>

            <!-- blips: gym, diet, achievements -->
            <div class="mt-1.5 flex flex-wrap justify-center gap-1">
              <RouterLink v-if="d.workout" :to="{ name: 'gym' }" class="flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px]" :class="d.workout.trained ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-cyan-500/30 bg-cyan-500/5 text-cyan-300'" :aria-label="`Workout: ${d.workout.body_parts.join(', ')}`">
                <BodyPartIcon v-for="p in d.workout.body_parts.slice(0, isMobile ? 4 : 2)" :key="p" :part="p" class="h-4 w-4" />
                <span v-if="isMobile || d.workout.trained">{{ d.workout.trained ? 'Trained' : 'Workout' }}</span>
              </RouterLink>
              <span v-if="d.diet" :data-testid="d.diet.ok ? 'diet-ok' : 'diet-logged'" class="flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px]" :class="d.diet.ok ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-slate-700 text-slate-400'" :title="`${d.diet.kcal} kcal · ${d.diet.protein} g protein`">
                <AppIcon :name="d.diet.ok ? 'check' : 'utensils'" class="h-3 w-3" />{{ d.diet.ok ? 'Diet' : '' }}
              </span>
              <span v-if="d.achievements" data-testid="ach-badge" class="flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[11px] text-amber-300" :title="`${d.achievements} achievement${d.achievements === 1 ? '' : 's'} unlocked`">
                <AppIcon name="trophy" class="h-3 w-3" />{{ d.achievements }}
              </span>
            </div>

            <!-- all-day: google events + quests -->
            <ul v-if="allDay(d).length" class="mt-1.5 space-y-0.5" aria-label="All-day events">
              <li v-for="ev in allDay(d)" :key="ev.id" class="truncate rounded bg-sky-500/20 px-1.5 py-0.5 text-[11px] text-sky-100" :title="ev.title">{{ ev.title }}</li>
            </ul>

            <ul v-if="d.items.length" class="mt-1.5 space-y-0.5">
              <li v-for="it in d.items.slice(0, maxQuests)" :key="it.task_id" class="flex items-center gap-1.5 rounded px-1 py-0.5 text-[11px]" :class="it.done ? 'text-slate-500' : 'text-slate-200'">
                <button v-if="it.can_complete && !it.done" type="button" :disabled="busyId === it.task_id" :aria-label="`Complete: ${it.title}`" class="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border-2 border-slate-500 text-transparent hover:border-emerald-400 hover:text-emerald-400" @click="complete(it)"><AppIcon name="check" class="h-2 w-2" /></button>
                <span v-else-if="it.done" class="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-emerald-500/25 text-emerald-400"><AppIcon name="check" class="h-2 w-2" /></span>
                <span v-else class="h-3.5 w-3.5 shrink-0 rounded-full border-2 border-dashed border-slate-700"></span>
                <span class="min-w-0 flex-1 truncate" :class="it.done && 'line-through'" :title="it.title">{{ it.title }}</span>
                <span class="shrink-0 rounded px-1 text-[10px] font-semibold" :class="TIER_META[it.tier].badge">{{ it.tier }}</span>
              </li>
              <li v-if="d.items.length > maxQuests"><button type="button" class="px-1 text-[11px] text-slate-500 hover:text-slate-200" @click="openDay = d.date">+{{ d.items.length - maxQuests }} more</button></li>
            </ul>
          </section>
        </div>
      </div>

      <!-- hours -->
      <div class="relative grid" :style="{ gridTemplateColumns: `${GUTTER} repeat(${days.length}, minmax(0, 1fr))`, height: `${24 * HOUR_PX}px` }">
        <div class="relative" aria-hidden="true">
          <span v-for="h in hours.slice(1)" :key="h" class="absolute right-2 -translate-y-1/2 text-[11px] text-slate-500 tabular-nums" :style="{ top: `${h * HOUR_PX}px` }">{{ pad(h) }}:00</span>
        </div>

        <div v-for="d in days" :key="d.date" class="relative border-l border-slate-800/80" :class="d.is_today && 'bg-cyan-500/[0.03]'" :style="{ backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${HOUR_PX - 1}px, rgba(51,65,85,0.45) ${HOUR_PX - 1}px, rgba(51,65,85,0.45) ${HOUR_PX}px)` }" :data-day="d.date">
          <component :is="b.ev.link ? 'a' : 'button'" v-for="b in blocks(d)" :key="b.key" v-bind="b.ev.link ? { href: b.ev.link, target: '_blank', rel: 'noopener' } : { type: 'button' }" class="absolute overflow-hidden rounded-md border-l-[3px] border-sky-400 bg-sky-500/25 px-1.5 py-0.5 text-left text-[11px] leading-tight text-sky-50 hover:bg-sky-500/40" :class="b.short && 'flex items-center gap-1'" :style="b.style" :title="`${b.ev.start_time}–${b.ev.end_time} ${b.ev.title}`" data-testid="timed-event" @click="!b.ev.link && (openDay = d.date)">
            <span class="font-medium text-sky-200 tabular-nums">{{ b.ev.start_time }}</span>
            <span class="break-words" :class="!b.short && 'block'">{{ b.ev.title }}</span>
          </component>

          <div v-if="d.date === todayISO" class="pointer-events-none absolute inset-x-0 z-10 flex items-center" :style="{ top: `${nowTop}px` }" aria-hidden="true">
            <span class="-ml-1 h-2 w-2 rounded-full bg-rose-400"></span><span class="h-px flex-1 bg-rose-400/80"></span>
          </div>
        </div>
      </div>
    </div>

    <DayDetail v-if="openDay" :date="openDay" @close="openDay = null" />
  </div>
</template>
