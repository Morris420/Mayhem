<script setup>
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import BodyPartIcon from '@/components/BodyPartIcon.vue'
import DayDetail from '@/components/DayDetail.vue'
import GooglePanel from '@/components/GooglePanel.vue'
import { api, describeError } from '@/lib/api'
import { useGameStore } from '@/stores/game'
import { useToastStore } from '@/stores/toasts'
import { TIER_META, WEEKDAYS, addDays, fromISO, mondayOf, toISO } from '@/lib/tiers'

const game = useGameStore()
const toasts = useToastStore()

const weekStart = ref(mondayOf(new Date()))
const week = ref(null)
const error = ref('')
const busyId = ref(null)
const openDay = ref(null)

const rangeLabel = computed(() => {
  const end = addDays(weekStart.value, 6)
  const f = (d, o) => d.toLocaleDateString(undefined, o)
  return `${f(weekStart.value, { day: 'numeric', month: 'short' })} – ${f(end, { day: 'numeric', month: 'short', year: 'numeric' })}`
})
const isThisWeek = computed(() => toISO(weekStart.value) === toISO(mondayOf(new Date())))

async function load() {
  error.value = ''
  try {
    week.value = await api.get(`/calendar?start=${toISO(weekStart.value)}&days=7`)
  } catch (e) {
    error.value = describeError(e)
  }
}

function go(weeks) {
  weekStart.value = addDays(weekStart.value, weeks * 7)
  load()
}
function goToday() {
  weekStart.value = mondayOf(new Date())
  load()
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

const dayName = (iso) => WEEKDAYS[(fromISO(iso).getDay() + 6) % 7].short
const dayNum = (iso) => fromISO(iso).getDate()

onMounted(load)
</script>

<template>
  <div class="space-y-5">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-xl font-bold text-white">Calendar</h1>
        <p class="text-sm text-slate-400">{{ rangeLabel }}</p>
      </div>

      <div class="flex items-center gap-2">
        <span v-if="week" class="mr-2 hidden text-sm text-slate-400 sm:inline">
          <strong class="text-slate-100">{{ week.summary.done }}</strong> of {{ week.summary.planned }} done ·
          <strong class="text-slate-100">{{ week.summary.xp_done }}</strong> / {{ week.summary.xp_planned }} XP
        </span>
        <button type="button" class="rounded-lg border border-slate-700 p-2 text-slate-300 hover:border-slate-500 hover:text-white" aria-label="Previous week" @click="go(-1)"><AppIcon name="chevron-left" class="h-4 w-4" /></button>
        <button type="button" :disabled="isThisWeek" class="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:border-slate-500 hover:text-white disabled:opacity-40" @click="goToday">This week</button>
        <button type="button" class="rounded-lg border border-slate-700 p-2 text-slate-300 hover:border-slate-500 hover:text-white" aria-label="Next week" @click="go(1)"><AppIcon name="chevron-right" class="h-4 w-4" /></button>
      </div>
    </div>

    <div v-if="error" class="rounded-xl border border-red-500/40 bg-red-500/10 p-6 text-center text-sm text-red-300">
      {{ error }} <button type="button" class="ml-3 underline" @click="load">Retry</button>
    </div>

    <div v-else-if="!week" class="animate-pulse rounded-xl border border-slate-800 bg-slate-900/50 p-10 text-center text-sm text-slate-500">Loading…</div>

    <div v-else class="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4 xl:grid-cols-7">
      <section v-for="d in week.days" :key="d.date" :aria-label="d.date" class="flex min-h-40 flex-col rounded-xl border p-3" :class="d.is_today ? 'border-cyan-500/60 bg-cyan-500/5' : 'border-slate-800 bg-slate-900/50'">
        <header class="mb-2 flex items-baseline justify-between">
          <button type="button" class="-m-1 rounded p-1 text-left hover:bg-slate-800/60" :aria-label="`Open journal for ${d.date}`" @click="openDay = d.date">
            <span class="text-xs font-medium uppercase" :class="d.is_today ? 'text-cyan-300' : 'text-slate-500'">{{ dayName(d.date) }}</span>
            <span class="ml-1.5 text-lg font-bold" :class="d.is_today ? 'text-white' : 'text-slate-300'">{{ dayNum(d.date) }}</span>
          </button>
          <span v-if="d.total" class="text-xs text-slate-500">{{ d.done }}/{{ d.total }}</span>
        </header>

        <div v-if="d.diet || d.achievements" class="mb-2 flex flex-wrap gap-1.5">
          <span v-if="d.diet" :data-testid="d.diet.ok ? 'diet-ok' : 'diet-logged'" class="flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]" :class="d.diet.ok ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-slate-700 text-slate-400'" :title="`${d.diet.kcal} kcal · ${d.diet.protein} g protein`">
            <AppIcon :name="d.diet.ok ? 'check' : 'utensils'" class="h-3 w-3" />{{ d.diet.ok ? 'Diet goal' : 'Diet' }}
          </span>
          <span v-if="d.achievements" data-testid="ach-badge" class="flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-300" :title="`${d.achievements} achievement${d.achievements === 1 ? '' : 's'} unlocked`">
            <AppIcon name="trophy" class="h-3 w-3" />{{ d.achievements }}
          </span>
        </div>

        <RouterLink v-if="d.workout" :to="{ name: 'gym' }" class="mb-2 flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs transition-colors" :class="d.workout.trained ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-cyan-500/30 bg-cyan-500/5 text-cyan-300 hover:border-cyan-400/60'" :aria-label="`Workout: ${d.workout.body_parts.join(', ')}`">
          <BodyPartIcon v-for="p in d.workout.body_parts.slice(0, 3)" :key="p" :part="p" class="h-5 w-5" />
          <span class="ml-auto font-medium">{{ d.workout.trained ? 'Trained' : 'Workout' }}</span>
        </RouterLink>

        <ul v-if="d.events?.length" class="mb-2 space-y-1" aria-label="Google Calendar events">
          <li v-for="ev in d.events" :key="ev.id" class="flex items-start gap-1.5 rounded-md border-l-2 border-sky-400/70 bg-sky-400/5 px-2 py-1 text-[11px] leading-snug text-sky-100" :title="ev.calendar">
            <span v-if="ev.start_time" class="shrink-0 font-medium text-sky-300 tabular-nums">{{ ev.start_time }}</span>
            <span class="min-w-0 break-words">{{ ev.title }}</span>
          </li>
        </ul>

        <ul class="flex-1 space-y-1.5">
          <li v-for="it in d.items" :key="it.task_id" class="rounded-lg border p-2 text-xs" :class="it.done ? 'border-transparent bg-slate-800/40' : 'border-slate-700 bg-slate-900'">
            <div class="flex items-start gap-2">
              <button v-if="it.can_complete && !it.done" type="button" :disabled="busyId === it.task_id" :aria-label="`Complete: ${it.title}`" class="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 border-slate-500 text-transparent hover:border-emerald-400 hover:text-emerald-400" @click="complete(it)">
                <AppIcon name="check" class="h-2.5 w-2.5" />
              </button>
              <span v-else-if="it.done" class="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500/25 text-emerald-400"><AppIcon name="check" class="h-2.5 w-2.5" /></span>
              <span v-else class="mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 border-dashed border-slate-700"></span>

              <div class="min-w-0 flex-1">
                <div class="leading-snug break-words" :class="it.done ? 'text-slate-500 line-through' : 'text-slate-100'">{{ it.title }}</div>
                <div class="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500">
                  <span class="rounded px-1 font-semibold" :class="TIER_META[it.tier].badge">{{ it.tier }}</span>
                  <span>{{ it.xp }} XP</span>
                  <AppIcon v-if="it.kind === 'recurring'" name="repeat" class="h-3 w-3" />
                  <span v-if="it.overdue" class="text-amber-400">overdue</span>
                </div>
              </div>
            </div>
          </li>
        </ul>

        <p v-if="!d.items.length && !d.workout && !d.diet && !d.events?.length" class="mt-auto pt-4 text-center text-xs text-slate-600">Nothing planned</p>
      </section>
    </div>

    <GooglePanel @synced="load" />

    <DayDetail v-if="openDay" :date="openDay" @close="openDay = null" />

    <p class="text-xs text-slate-500">Click a date to open its journal. Schedule quests from the Quests page.</p>
  </div>
</template>
