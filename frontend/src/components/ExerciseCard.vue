<script setup>
import { computed, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import BodyPartIcon from './BodyPartIcon.vue'
import { BODY_PART_LABEL, fmtWeight } from '@/lib/gym'

const props = defineProps({ exercise: { type: Object, required: true }, busy: Boolean })
const emit = defineEmits(['log', 'edit', 'delete', 'delete-log'])

const weight = ref(props.exercise.current?.weight ?? '')
const sets = ref(props.exercise.current?.sets ?? '')
const reps = ref(props.exercise.current?.reps ?? '')
const showHistory = ref(false)
const confirmDelete = ref(false)

// Keep the inputs in sync after a log is saved or the exercise changes.
watch(() => props.exercise.current, (c) => {
  weight.value = c?.weight ?? ''
  sets.value = c?.sets ?? ''
  reps.value = c?.reps ?? ''
})

const canLog = computed(() => weight.value !== '' && Number(weight.value) >= 0 && !props.busy)

function submit() {
  if (!canLog.value) return
  emit('log', {
    weight: Number(weight.value),
    sets: sets.value === '' ? null : Number(sets.value),
    reps: reps.value === '' ? null : Number(reps.value),
  })
}

function remove() {
  if (!confirmDelete.value) {
    confirmDelete.value = true
    setTimeout(() => (confirmDelete.value = false), 3000)
    return
  }
  emit('delete')
}

// --- sparkline of past weights ---
const spark = computed(() => {
  const h = props.exercise.history
  if (h.length < 2) return null
  const W = 150, H = 44, pad = 5
  const ws = h.map((x) => x.weight)
  const min = Math.min(...ws), max = Math.max(...ws)
  const span = max - min || 1
  const pts = h.map((x, i) => [pad + (i / (h.length - 1)) * (W - pad * 2), H - pad - ((x.weight - min) / span) * (H - pad * 2)])
  return { W, H, line: pts.map((p) => p.join(',')).join(' '), last: pts[pts.length - 1] }
})

const goalText = computed(() => {
  const g = props.exercise.goal
  if (!g) return null
  const date = g.date ? new Date(g.date + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : ''
  const left = g.days_left === null ? '' : g.days_left < 0 ? 'past due' : g.days_left === 0 ? 'today' : `${g.days_left} days left`
  return { date, left }
})

const inputClass = 'w-full rounded-md border border-cyan-500/30 bg-[#050b14] px-2.5 py-2 text-sm text-cyan-50 placeholder:text-cyan-900 focus:border-cyan-300 focus:ring-1 focus:ring-cyan-300 focus:outline-none'
</script>

<template>
  <article class="relative overflow-hidden rounded-xl border border-cyan-500/30 bg-gradient-to-br from-[#0a1626] to-[#080d17] p-4 shadow-[0_0_24px_rgba(34,211,238,0.06)] sm:p-5">
    <span class="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-400/70 to-transparent"></span>

    <div class="grid gap-5 md:grid-cols-12">
      <!-- name -->
      <div class="flex items-center gap-3 md:col-span-4">
        <div class="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-cyan-400/40 bg-cyan-400/5 p-2 text-cyan-300 shadow-[0_0_14px_rgba(34,211,238,0.2)]">
          <BodyPartIcon :part="exercise.body_part" class="h-full w-full" />
        </div>
        <div class="min-w-0">
          <h3 class="text-lg leading-tight font-semibold text-white">{{ exercise.name }}</h3>
          <p class="text-xs tracking-wide text-cyan-300/70 uppercase">{{ BODY_PART_LABEL[exercise.body_part] }}</p>
          <p v-if="exercise.records" class="mt-0.5 flex items-center gap-1 text-xs text-amber-300"><AppIcon name="trophy" class="h-3 w-3" /> {{ exercise.records }} record{{ exercise.records === 1 ? '' : 's' }}</p>
        </div>
      </div>

      <!-- weights -->
      <div class="md:col-span-4">
        <div class="flex items-end gap-2">
          <span class="font-mono text-4xl leading-none font-bold text-cyan-200 tabular-nums">{{ fmtWeight(exercise.current?.weight) }}</span>
          <span class="pb-0.5 text-sm text-cyan-400/70">kg</span>
          <span v-if="exercise.change !== null" class="mb-0.5 ml-1 rounded px-1.5 py-0.5 text-xs font-semibold" :class="exercise.change > 0 ? 'bg-emerald-500/15 text-emerald-300' : exercise.change < 0 ? 'bg-rose-500/15 text-rose-300' : 'bg-slate-700/60 text-slate-300'">
            {{ exercise.change > 0 ? '+' : '' }}{{ fmtWeight(exercise.change) }}
          </span>
        </div>
        <p class="mt-1 text-xs text-slate-400">
          <template v-if="exercise.current">
            {{ exercise.current.sets && exercise.current.reps ? `${exercise.current.sets}×${exercise.current.reps} · ` : '' }}last {{ new Date(exercise.current.date + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) }}
            <template v-if="exercise.previous"> · before: {{ fmtWeight(exercise.previous.weight) }} kg</template>
          </template>
          <template v-else>No weight logged yet</template>
        </p>
        <svg v-if="spark" :viewBox="`0 0 ${spark.W} ${spark.H}`" class="mt-2 h-11 w-full max-w-[10rem]" role="img" :aria-label="`Weight history for ${exercise.name}`">
          <polyline :points="spark.line" fill="none" stroke="#22d3ee" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
          <circle :cx="spark.last[0]" :cy="spark.last[1]" r="3" fill="#67e8f9" />
        </svg>
      </div>

      <!-- goal -->
      <div class="md:col-span-4">
        <template v-if="exercise.goal">
          <div class="mb-1 flex items-baseline justify-between text-xs">
            <span class="text-slate-400">Goal</span>
            <span class="font-mono font-semibold text-cyan-100">{{ fmtWeight(exercise.goal.weight) }} kg</span>
          </div>
          <div class="h-2 overflow-hidden rounded-full bg-slate-800" role="progressbar" :aria-valuenow="exercise.goal.pct" aria-valuemin="0" aria-valuemax="100" :aria-label="`Goal progress for ${exercise.name}`">
            <div class="h-full rounded-full transition-all duration-700" :class="exercise.goal.reached ? 'bg-emerald-400' : 'bg-gradient-to-r from-cyan-500 to-sky-300'" :style="{ width: exercise.goal.pct + '%' }"></div>
          </div>
          <p class="mt-1 text-xs" :class="exercise.goal.reached ? 'text-emerald-300' : 'text-slate-400'">
            <template v-if="exercise.goal.reached">Goal reached 🎉</template>
            <template v-else>{{ exercise.goal.pct }}% · by {{ goalText.date }} · {{ goalText.left }}</template>
          </p>
        </template>
        <p v-else class="text-xs text-slate-500">No goal set. Edit the exercise to add a target weight and date.</p>
      </div>
    </div>

    <!-- log row -->
    <form class="mt-4 flex flex-wrap items-end gap-2 border-t border-cyan-500/15 pt-4" @submit.prevent="submit">
      <label class="w-24">
        <span class="mb-1 block text-[11px] text-slate-400">Weight (kg)</span>
        <input v-model="weight" type="number" inputmode="decimal" step="0.5" min="0" :class="inputClass" :aria-label="`Weight for ${exercise.name}`" />
      </label>
      <label class="w-16">
        <span class="mb-1 block text-[11px] text-slate-400">Sets</span>
        <input v-model="sets" type="number" min="1" :class="inputClass" :aria-label="`Sets for ${exercise.name}`" />
      </label>
      <label class="w-16">
        <span class="mb-1 block text-[11px] text-slate-400">Reps</span>
        <input v-model="reps" type="number" min="1" :class="inputClass" :aria-label="`Reps for ${exercise.name}`" />
      </label>
      <button type="submit" :disabled="!canLog" :aria-label="`Log ${exercise.name}`" class="flex items-center gap-2 rounded-md bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 transition-colors hover:bg-cyan-300 disabled:opacity-40">
        <AppIcon name="check" class="h-4 w-4" /> {{ exercise.logged_today ? 'Update today' : 'Log today' }}
      </button>

      <div class="ml-auto flex items-center gap-1">
        <button v-if="exercise.history.length" type="button" class="rounded-md px-2.5 py-2 text-xs text-slate-400 hover:text-white" :aria-expanded="showHistory" @click="showHistory = !showHistory">History</button>
        <button type="button" class="rounded-md p-2 text-slate-400 hover:text-white" :aria-label="`Edit ${exercise.name}`" @click="emit('edit')"><AppIcon name="pencil" class="h-4 w-4" /></button>
        <button type="button" class="flex items-center gap-1 rounded-md p-2 text-xs" :class="confirmDelete ? 'bg-rose-500/20 text-rose-200' : 'text-slate-400 hover:text-rose-300'" :aria-label="`Delete ${exercise.name}`" @click="remove">
          <AppIcon name="trash" class="h-4 w-4" /> <span v-if="confirmDelete">Confirm?</span>
        </button>
      </div>
    </form>

    <ul v-if="showHistory" class="mt-3 space-y-1 text-sm">
      <li v-for="h in [...exercise.history].reverse()" :key="h.id" class="flex items-center justify-between rounded-md bg-slate-900/70 px-3 py-1.5">
        <span class="text-slate-400">{{ new Date(h.date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) }}</span>
        <span class="font-mono text-cyan-100">{{ fmtWeight(h.weight) }} kg<span v-if="h.sets && h.reps" class="text-slate-500"> · {{ h.sets }}×{{ h.reps }}</span></span>
        <button type="button" class="text-slate-500 hover:text-rose-300" :aria-label="`Delete entry ${h.date}`" @click="emit('delete-log', h.id)"><AppIcon name="x" class="h-4 w-4" /></button>
      </li>
    </ul>
  </article>
</template>
