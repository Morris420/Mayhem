<script setup>
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import AppIcon from './AppIcon.vue'
import BodyPartIcon from './BodyPartIcon.vue'
import { api, describeError } from '@/lib/api'
import { TIER_META, fromISO } from '@/lib/tiers'

// The "journal" for one day: quests, workout, food, achievements.
const props = defineProps({ date: { type: String, required: true } })
const emit = defineEmits(['close'])

const day = ref(null)
const error = ref('')
const panel = ref(null)

async function load() {
  day.value = null
  error.value = ''
  try {
    day.value = await api.get(`/days/${props.date}`)
  } catch (e) {
    error.value = describeError(e)
  }
}

const title = computed(() => fromISO(props.date).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))
const questsDone = computed(() => day.value?.quests.items.filter((i) => i.done).length ?? 0)
const kcalText = computed(() => {
  const s = day.value?.diet.status.kcal.state
  return s === 'on' ? 'on target' : s === 'over' ? 'over target' : 'under target'
})
const empty = computed(() => {
  const d = day.value
  return d && !d.quests.items.length && !d.gym.trained && !d.gym.planned.length && !d.diet.logged && !d.achievements.length
})

function onKey(e) {
  if (e.key === 'Escape') emit('close')
}
onMounted(() => {
  load()
  window.addEventListener('keydown', onKey)
  panel.value?.focus()
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
watch(() => props.date, load)
</script>

<template>
  <div class="fixed inset-0 z-40 flex justify-end bg-slate-950/70" @click.self="emit('close')">
    <aside ref="panel" tabindex="-1" role="dialog" aria-modal="true" :aria-label="`Journal for ${title}`" class="h-full w-full max-w-md overflow-y-auto border-l border-slate-800 bg-slate-950 p-5 focus:outline-none">
      <header class="mb-5 flex items-start justify-between gap-3">
        <div>
          <p class="text-xs font-medium tracking-wide text-cyan-300 uppercase">Day journal</p>
          <h2 class="text-lg font-bold text-white">{{ title }}</h2>
        </div>
        <button type="button" class="rounded-lg p-2 text-slate-400 hover:text-white" aria-label="Close" @click="emit('close')"><AppIcon name="x" class="h-5 w-5" /></button>
      </header>

      <p v-if="error" class="rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-300">{{ error }} <button type="button" class="ml-2 underline" @click="load">Retry</button></p>
      <p v-else-if="!day" class="animate-pulse py-10 text-center text-sm text-slate-500">Loading…</p>

      <div v-else class="space-y-5">
        <p v-if="empty" class="rounded-lg border border-slate-800 p-6 text-center text-sm text-slate-500">Nothing recorded for this day.</p>

        <section v-if="day.achievements.length" aria-label="Achievements unlocked">
          <h3 class="mb-2 text-xs font-semibold tracking-wide text-amber-300 uppercase">Achievements unlocked</h3>
          <ul class="space-y-1.5">
            <li v-for="a in day.achievements" :key="a.id" class="flex items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2">
              <AppIcon :name="a.icon" class="h-5 w-5 text-amber-300" />
              <div><div class="text-sm font-semibold text-amber-200">{{ a.name }}</div><div class="text-xs text-slate-400">{{ a.description }}</div></div>
            </li>
          </ul>
        </section>

        <section v-if="day.quests.items.length" aria-label="Quests">
          <h3 class="mb-2 flex justify-between text-xs font-semibold tracking-wide text-slate-400 uppercase"><span>Quests</span><span>{{ questsDone }}/{{ day.quests.items.length }} done</span></h3>
          <ul class="space-y-1.5">
            <li v-for="it in day.quests.items" :key="it.task_id" class="flex items-center gap-2.5 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm">
              <span v-if="it.done" class="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500/25 text-emerald-400"><AppIcon name="check" class="h-2.5 w-2.5" /></span>
              <span v-else class="h-4 w-4 rounded-full border-2 border-dashed border-slate-600"></span>
              <span class="min-w-0 flex-1 break-words" :class="it.done ? 'text-slate-400 line-through' : 'text-slate-100'">{{ it.title }}</span>
              <span class="rounded px-1 text-[11px] font-semibold" :class="TIER_META[it.tier].badge">{{ it.tier }}</span>
            </li>
          </ul>
        </section>

        <section v-if="day.gym.trained || day.gym.planned.length" aria-label="Gym">
          <h3 class="mb-2 flex justify-between text-xs font-semibold tracking-wide text-slate-400 uppercase"><span>Gym</span><RouterLink :to="{ name: 'gym' }" class="normal-case hover:text-white">Open gym</RouterLink></h3>
          <ul v-if="day.gym.trained" class="space-y-1.5">
            <li v-for="(l, i) in day.gym.logs" :key="i" class="flex items-center gap-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm">
              <BodyPartIcon :part="l.body_part" class="h-5 w-5" />
              <span class="flex-1 text-slate-100">{{ l.name }}</span>
              <span class="text-slate-300 tabular-nums">{{ l.weight }} kg<template v-if="l.sets && l.reps"> · {{ l.sets }}×{{ l.reps }}</template></span>
            </li>
          </ul>
          <p v-else class="rounded-lg border border-slate-800 px-3 py-2 text-sm text-slate-400">
            {{ day.is_future ? 'Planned' : 'Planned, not logged' }}: {{ day.gym.planned.map((p) => p.name).join(', ') }}
          </p>
        </section>

        <section v-if="day.diet.logged" aria-label="Nutrition">
          <h3 class="mb-2 flex justify-between text-xs font-semibold tracking-wide text-slate-400 uppercase"><span>Nutrition</span><span v-if="day.diet.status.day_ok" class="text-emerald-300">Both goals hit</span></h3>
          <div class="rounded-lg border px-3 py-2.5 text-sm" :class="day.diet.status.day_ok ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-slate-800 bg-slate-900/60'">
            <div class="flex justify-between"><span class="text-slate-300">Calories</span><span class="text-slate-100 tabular-nums">{{ day.diet.totals.kcal }} / {{ day.diet.goals.kcal }} <span class="text-slate-500">({{ kcalText }})</span></span></div>
            <div class="mt-1 flex justify-between"><span class="text-slate-300">Protein</span><span class="text-slate-100 tabular-nums">{{ day.diet.totals.protein }} / {{ day.diet.goals.protein }} g <span class="text-slate-500">({{ day.diet.status.protein.reached ? 'reached' : 'short' }})</span></span></div>
            <div v-if="day.diet.checked.length" class="mt-2 flex flex-wrap gap-1.5 border-t border-slate-800 pt-2">
              <span v-for="c in day.diet.checked" :key="c" class="rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-300">{{ c }}</span>
            </div>
          </div>
          <details class="mt-2 text-sm"><summary class="cursor-pointer text-slate-400 hover:text-white">{{ day.diet.foods.length }} food{{ day.diet.foods.length === 1 ? '' : 's' }} logged</summary>
            <ul class="mt-1.5 space-y-1 text-xs text-slate-400"><li v-for="(f, i) in day.diet.foods" :key="i" class="flex justify-between gap-3"><span class="truncate">{{ f.name }} · {{ f.grams }} g</span><span class="tabular-nums">{{ f.kcal }} kcal</span></li></ul>
          </details>
        </section>

        <section aria-label="Calendar events">
          <h3 class="mb-2 text-xs font-semibold tracking-wide text-slate-400 uppercase">Calendar events</h3>
          <p class="rounded-lg border border-dashed border-slate-800 px-3 py-2 text-xs text-slate-500">Google Calendar isn't connected yet.</p>
        </section>
      </div>
    </aside>
  </div>
</template>
