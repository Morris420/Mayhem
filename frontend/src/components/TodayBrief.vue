<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import AppIcon from './AppIcon.vue'
import BodyPartIcon from './BodyPartIcon.vue'
import { api, describeError } from '@/lib/api'
import { toISO } from '@/lib/tiers'

// "What is today?" at a glance: quests, gym, food goals and Google events.
const props = defineProps({ refreshKey: { type: [Number, String], default: 0 } })

const day = ref(null)
const error = ref('')

async function load() {
  error.value = ''
  try {
    day.value = await api.get(`/days/${toISO(new Date())}`)
  } catch (e) {
    error.value = describeError(e)
  }
}
onMounted(load)
watch(() => props.refreshKey, load)

const pending = computed(() => day.value?.quests.items.filter((i) => !i.done) ?? [])
const timed = computed(() => (day.value?.events ?? []).filter((e) => !e.all_day))
const allDay = computed(() => (day.value?.events ?? []).filter((e) => e.all_day))
const parts = computed(() => [...new Set(day.value?.gym.planned.map((p) => p.body_part) ?? [])])
const dietState = computed(() => {
  const d = day.value?.diet
  if (!d) return ''
  if (d.status.day_ok) return 'Both goals hit'
  if (!d.logged) return 'Nothing logged yet'
  const bits = []
  if (d.status.kcal.state === 'under') bits.push(`${d.status.kcal.remaining} kcal to go`)
  if (d.status.kcal.state === 'over') bits.push('over on calories')
  if (!d.status.protein.reached) bits.push(`${d.status.protein.remaining} g protein to go`)
  return bits.join(' · ')
})
const clamp = (n) => Math.max(0, Math.min(100, n))
</script>

<template>
  <section class="rounded-xl border border-slate-800 bg-slate-900/50 p-4 sm:p-5" aria-label="Today at a glance">
    <header class="mb-3 flex items-center justify-between">
      <h2 class="flex items-center gap-2 text-sm font-semibold text-slate-100"><AppIcon name="calendar" class="h-4 w-4 text-slate-400" />Today · {{ new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }) }}</h2>
      <RouterLink :to="{ name: 'calendar' }" class="text-xs text-slate-400 hover:text-white">Open calendar →</RouterLink>
    </header>

    <p v-if="error" class="text-sm text-red-300">{{ error }} <button type="button" class="underline" @click="load">Retry</button></p>
    <p v-else-if="!day" class="animate-pulse text-sm text-slate-500">Loading…</p>

    <div v-else class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <!-- quests -->
      <div class="rounded-lg bg-slate-800/40 p-3" data-testid="brief-quests">
        <p class="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-slate-400 uppercase"><AppIcon name="target" class="h-3.5 w-3.5" />Quests</p>
        <p v-if="!day.quests.total" class="text-sm text-slate-500">Nothing planned.</p>
        <template v-else>
          <p class="text-sm text-slate-200"><strong class="text-white">{{ day.quests.done }}</strong> of {{ day.quests.total }} done</p>
          <div class="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-700"><div class="h-full rounded-full bg-cyan-400" :style="{ width: clamp((day.quests.done / day.quests.total) * 100) + '%' }"></div></div>
          <ul class="mt-2 space-y-0.5 text-xs text-slate-300">
            <li v-for="q in pending.slice(0, 3)" :key="q.task_id" class="truncate">· {{ q.title }}</li>
            <li v-if="pending.length > 3" class="text-slate-500">+{{ pending.length - 3 }} more</li>
            <li v-if="!pending.length" class="text-emerald-300">All cleared</li>
          </ul>
        </template>
      </div>

      <!-- gym -->
      <div class="rounded-lg bg-slate-800/40 p-3" data-testid="brief-gym">
        <p class="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-slate-400 uppercase"><AppIcon name="dumbbell" class="h-3.5 w-3.5" />Gym</p>
        <p v-if="!day.gym.planned.length && !day.gym.trained" class="text-sm text-slate-500">Rest day.</p>
        <template v-else>
          <div class="flex items-center gap-1.5"><BodyPartIcon v-for="p in parts.slice(0, 4)" :key="p" :part="p" class="h-6 w-6" /></div>
          <p class="mt-1.5 text-sm" :class="day.gym.trained ? 'text-emerald-300' : 'text-slate-200'">{{ day.gym.trained ? `Trained · ${day.gym.logs.length} lift${day.gym.logs.length === 1 ? '' : 's'} logged` : `${day.gym.planned.length} exercise${day.gym.planned.length === 1 ? '' : 's'} planned` }}</p>
          <p v-if="!day.gym.trained" class="mt-0.5 truncate text-xs text-slate-500">{{ day.gym.planned.map((p) => p.name).slice(0, 3).join(', ') }}</p>
        </template>
        <RouterLink :to="{ name: 'gym' }" class="mt-1.5 inline-block text-xs text-slate-400 hover:text-white">Open gym →</RouterLink>
      </div>

      <!-- food -->
      <div class="rounded-lg bg-slate-800/40 p-3" data-testid="brief-diet">
        <p class="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-slate-400 uppercase"><AppIcon name="utensils" class="h-3.5 w-3.5" />Nutrition</p>
        <div class="space-y-1.5 text-xs text-slate-300">
          <div><div class="mb-0.5 flex justify-between"><span>Calories</span><span class="tabular-nums">{{ day.diet.totals.kcal }} / {{ day.diet.goals.kcal }}</span></div><div class="h-1 overflow-hidden rounded-full bg-slate-700"><div class="h-full rounded-full bg-amber-300" :style="{ width: clamp((day.diet.totals.kcal / day.diet.goals.kcal) * 100) + '%' }"></div></div></div>
          <div><div class="mb-0.5 flex justify-between"><span>Protein</span><span class="tabular-nums">{{ day.diet.totals.protein }} / {{ day.diet.goals.protein }} g</span></div><div class="h-1 overflow-hidden rounded-full bg-slate-700"><div class="h-full rounded-full bg-emerald-400" :style="{ width: clamp((day.diet.totals.protein / day.diet.goals.protein) * 100) + '%' }"></div></div></div>
        </div>
        <p class="mt-1.5 text-xs" :class="day.diet.status.day_ok ? 'text-emerald-300' : 'text-slate-500'">{{ dietState }}</p>
      </div>

      <!-- google calendar -->
      <div class="rounded-lg bg-slate-800/40 p-3" data-testid="brief-events">
        <p class="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-slate-400 uppercase"><AppIcon name="calendar" class="h-3.5 w-3.5" />Schedule</p>
        <p v-if="!day.events.length" class="text-sm text-slate-500">{{ day.google_connected ? 'Nothing on your calendar.' : 'Google Calendar not connected.' }}</p>
        <ul v-else class="space-y-1 text-xs">
          <li v-for="e in allDay.slice(0, 2)" :key="e.id" class="truncate rounded bg-sky-500/15 px-1.5 py-0.5 text-sky-100">{{ e.title }}</li>
          <li v-for="e in timed.slice(0, 4)" :key="e.id" class="flex gap-2 text-slate-200"><span class="w-10 shrink-0 text-sky-300 tabular-nums">{{ e.start_time }}</span><span class="truncate">{{ e.title }}</span></li>
          <li v-if="timed.length > 4" class="text-slate-500">+{{ timed.length - 4 }} more</li>
        </ul>
      </div>
    </div>
  </section>
</template>
