<script setup>
import { computed, nextTick, onMounted, ref } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import BodyPartIcon from '@/components/BodyPartIcon.vue'
import ExerciseCard from '@/components/ExerciseCard.vue'
import ExerciseForm from '@/components/ExerciseForm.vue'
import PhysiqueFigure from '@/components/PhysiqueFigure.vue'
import { useGymStore } from '@/stores/gym'
import { useToastStore } from '@/stores/toasts'
import { describeError } from '@/lib/api'
import { WEEKDAYS } from '@/lib/tiers'

const gym = useGymStore()
const toasts = useToastStore()

const loadError = ref('')
const selected = ref(null) // ISO weekday 1..7, or 0 = all exercises
const formOpen = ref(false)
const editing = ref(null)
const busyId = ref(null)

async function load() {
  loadError.value = ''
  try {
    await gym.load()
    if (selected.value === null) selected.value = gym.data.week.days.find((d) => d.is_today)?.weekday ?? 0
  } catch (e) {
    loadError.value = describeError(e)
  }
}

const week = computed(() => gym.data?.week.days ?? [])
const exercises = computed(() => gym.data?.exercises ?? [])
const visible = computed(() =>
  selected.value ? exercises.value.filter((e) => e.weekdays.includes(selected.value)) : exercises.value,
)
const selectedName = computed(() => (selected.value ? WEEKDAYS[selected.value - 1].long : 'All exercises'))

const day = (n) => WEEKDAYS[n - 1]
const dayNum = (iso) => new Date(iso + 'T00:00:00').getDate()

function toast(e) {
  toasts.push({ title: 'Something went wrong', message: describeError(e), kind: 'info', icon: 'alert' })
}

async function openForm(exercise = null) {
  editing.value = exercise
  formOpen.value = true
  await nextTick()
  // The form sits at the top of the page, so bring it into view even if you were scrolled far down.
  document.getElementById('ex-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  document.getElementById('ex-name')?.focus({ preventScroll: true })
}

async function save(payload) {
  await gym.saveExercise(payload, editing.value?.id ?? null)
  formOpen.value = false
  editing.value = null
}

async function log(ex, payload) {
  busyId.value = ex.id
  try {
    await gym.logWeight(ex, payload)
  } catch (e) {
    toast(e)
  } finally {
    busyId.value = null
  }
}

async function run(fn) {
  try {
    await fn()
  } catch (e) {
    toast(e)
  }
}

onMounted(load)
</script>

<template>
  <div v-if="loadError" class="rounded-xl border border-red-500/40 bg-red-500/10 p-6 text-center text-sm text-red-300">
    {{ loadError }} <button type="button" class="ml-3 underline" @click="load">Retry</button>
  </div>

  <div v-else-if="!gym.data" class="animate-pulse rounded-xl border border-slate-800 bg-slate-900/50 p-10 text-center text-sm text-slate-500">Loading…</div>

  <template v-else>
    <!-- header -->
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 class="text-xl font-bold text-white">Gym</h1>
        <p class="text-sm text-slate-400">
          <strong class="text-cyan-300">{{ gym.data.stats.sessions_this_week }}</strong> workout{{ gym.data.stats.sessions_this_week === 1 ? '' : 's' }} this week ·
          <strong class="text-cyan-300">{{ gym.data.stats.sessions }}</strong> total ·
          <strong class="text-amber-300">{{ gym.data.stats.records }}</strong> records
        </p>
      </div>
      <button type="button" class="flex items-center gap-2 rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-300" @click="openForm()">
        <AppIcon name="plus" class="h-4 w-4" /> Add exercise
      </button>
    </div>

    <ExerciseForm v-if="formOpen" :key="editing?.id ?? 'new'" :exercise="editing" :save-fn="save" @cancel="(formOpen = false), (editing = null)" />

    <!-- empty state -->
    <div v-if="!exercises.length && !formOpen" class="rounded-xl border border-dashed border-cyan-500/40 bg-cyan-500/5 p-8 text-center">
      <p class="text-base font-semibold text-white">Set up your training week</p>
      <p class="mx-auto mt-1 max-w-md text-sm text-slate-400">Start from a ready-made push / pull / legs plan and change anything you like, or add your own exercises from scratch.</p>
      <div class="mt-4 flex flex-wrap justify-center gap-2">
        <button type="button" class="rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-300" @click="run(gym.loadStarter)">Load starter plan</button>
        <button type="button" class="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-200 hover:border-slate-400" @click="openForm()">Add my own</button>
      </div>
    </div>

    <template v-if="exercises.length">
      <!-- 7-day boxes -->
      <div class="grid grid-cols-7 gap-1.5 sm:gap-3" role="group" aria-label="Training week">
        <button
          v-for="d in week"
          :key="d.date"
          type="button"
          :aria-pressed="selected === d.weekday"
          :aria-label="`${day(d.weekday).long}: ${d.body_parts.length ? d.body_parts.join(', ') : 'rest day'}`"
          class="relative flex min-h-24 flex-col items-center rounded-xl border p-1.5 transition-all sm:min-h-32 sm:p-3"
          :class="[
            selected === d.weekday ? 'border-cyan-300 bg-cyan-400/10 shadow-[0_0_20px_rgba(34,211,238,0.25)]' : d.is_today ? 'border-cyan-500/50 bg-slate-900/60' : 'border-slate-800 bg-slate-900/50 hover:border-slate-600',
          ]"
          @click="selected = d.weekday"
        >
          <span class="text-[10px] font-medium tracking-wide uppercase sm:text-xs" :class="d.is_today ? 'text-cyan-300' : 'text-slate-500'">{{ day(d.weekday).short }}</span>
          <span class="text-sm font-bold text-slate-200 sm:text-lg">{{ dayNum(d.date) }}</span>
          <span class="mt-1 flex flex-1 flex-wrap content-center items-center justify-center gap-0.5 text-cyan-300 sm:gap-1">
            <BodyPartIcon v-for="p in d.body_parts" :key="p" :part="p" class="h-5 w-5 sm:h-7 sm:w-7" />
            <span v-if="!d.body_parts.length" class="text-[10px] text-slate-600 sm:text-xs">Rest</span>
          </span>
          <span v-if="d.trained" class="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-400 text-slate-950 sm:top-2 sm:right-2" title="Trained"><AppIcon name="check" class="h-3 w-3" /></span>
        </button>
      </div>

      <!-- exercise list -->
      <div class="flex items-center justify-between">
        <h2 class="text-base font-semibold text-white">{{ selectedName }} <span class="text-sm font-normal text-slate-500">({{ visible.length }})</span></h2>
        <button type="button" class="text-xs text-slate-400 hover:text-white" @click="selected = selected ? 0 : (week.find((d) => d.is_today)?.weekday ?? 0)">
          {{ selected ? 'Show all exercises' : 'Show today' }}
        </button>
      </div>

      <p v-if="!visible.length" class="rounded-xl border border-slate-800 bg-slate-900/50 p-6 text-center text-sm text-slate-400">
        Rest day. Nothing scheduled — enjoy the recovery, or add an exercise to this day.
      </p>

      <div class="space-y-4">
        <ExerciseCard
          v-for="ex in visible"
          :key="ex.id"
          :exercise="ex"
          :busy="busyId === ex.id"
          @log="log(ex, $event)"
          @edit="openForm(ex)"
          @delete="run(() => gym.deleteExercise(ex.id))"
          @delete-log="run(() => gym.deleteLog($event))"
        />
      </div>

      <button type="button" class="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-cyan-500/40 py-3 text-sm font-medium text-cyan-300 transition-colors hover:border-cyan-300 hover:bg-cyan-400/5" @click="openForm()">
        <AppIcon name="plus" class="h-4 w-4" /> Add another exercise
      </button>

      <!-- physique -->
      <section class="flex items-center gap-6 rounded-xl border border-cyan-500/30 bg-gradient-to-br from-[#0a1626] to-[#080d17] p-5">
        <div class="h-52 w-26 shrink-0"><PhysiqueFigure :stage="gym.data.physique.stage" :progress="(gym.data.physique.next?.pct ?? 0) / 100" /></div>
        <div class="min-w-0 flex-1">
          <p class="text-xs tracking-wide text-cyan-300/70 uppercase">Physique · stage {{ gym.data.physique.stage }} of 5</p>
          <p class="text-2xl font-bold text-white">{{ gym.data.physique.name }}</p>
          <template v-if="gym.data.physique.next">
            <div class="mt-3 h-2 overflow-hidden rounded-full bg-slate-800" role="progressbar" :aria-valuenow="gym.data.physique.next.pct" aria-valuemin="0" aria-valuemax="100" aria-label="Progress to next physique stage">
              <div class="h-full rounded-full bg-gradient-to-r from-cyan-500 to-sky-300 transition-all duration-700" :style="{ width: gym.data.physique.next.pct + '%' }"></div>
            </div>
            <p class="mt-1 text-xs text-slate-400">{{ gym.data.physique.next.remaining }} more workout{{ gym.data.physique.next.remaining === 1 ? '' : 's' }} to become <strong class="text-cyan-200">{{ gym.data.physique.next.name }}</strong></p>
          </template>
          <p v-else class="mt-2 text-sm text-cyan-200">Maximum stage reached.</p>
        </div>
      </section>
    </template>
  </template>
</template>
