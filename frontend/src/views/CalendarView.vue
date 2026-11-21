<script setup>
import { computed, onMounted, ref } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
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
          <div>
            <span class="text-xs font-medium uppercase" :class="d.is_today ? 'text-cyan-300' : 'text-slate-500'">{{ dayName(d.date) }}</span>
            <span class="ml-1.5 text-lg font-bold" :class="d.is_today ? 'text-white' : 'text-slate-300'">{{ dayNum(d.date) }}</span>
          </div>
          <span v-if="d.total" class="text-xs text-slate-500">{{ d.done }}/{{ d.total }}</span>
        </header>

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

        <p v-if="!d.items.length" class="mt-auto pt-4 text-center text-xs text-slate-600">Nothing planned</p>
      </section>
    </div>

    <p class="text-xs text-slate-500">Schedule quests from the Quests page. Google Calendar events and workouts will appear here in a later update.</p>
  </div>
</template>
