<script setup>
import { computed, onMounted, ref } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import SystemPanel from '@/components/SystemPanel.vue'
import MacroBar from '@/components/MacroBar.vue'
import FoodPicker from '@/components/FoodPicker.vue'
import { useNutritionStore } from '@/stores/nutrition'
import { useToastStore } from '@/stores/toasts'
import { describeError } from '@/lib/api'
import { addDays, fromISO, toISO } from '@/lib/tiers'

const nutrition = useNutritionStore()
const toasts = useToastStore()
const loadError = ref('')
const editingGoals = ref(false)
const goalForm = ref({ kcal: 2500, protein: 150 })
const goalError = ref('')
const confirmId = ref(null)
const newExtra = ref('')

async function load(date) {
  loadError.value = ''
  try {
    await nutrition.load(date)
  } catch (e) {
    loadError.value = describeError(e)
  }
}

const d = computed(() => nutrition.data)
const dateLabel = computed(() => {
  if (!d.value) return ''
  if (d.value.is_today) return 'Today'
  return fromISO(d.value.date).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
})

function shift(days) {
  load(toISO(addDays(fromISO(nutrition.date), days)))
}

function openGoals() {
  goalForm.value = { kcal: d.value.goals.kcal, protein: d.value.goals.protein }
  goalError.value = ''
  editingGoals.value = true
}
async function saveGoals() {
  goalError.value = ''
  try {
    await nutrition.setGoals({ kcal: Number(goalForm.value.kcal), protein: Number(goalForm.value.protein) })
    editingGoals.value = false
  } catch (e) {
    goalError.value = e.errors ? Object.values(e.errors).flat().join(' ') : describeError(e)
  }
}

async function run(fn) {
  try {
    await fn()
  } catch (e) {
    toasts.push({ title: 'Something went wrong', message: describeError(e), kind: 'info', icon: 'alert' })
  }
}

async function saveGrams(entry, ev) {
  const g = Number(ev.target.value)
  if (!(g > 0) || g === entry.grams) {
    ev.target.value = entry.grams
    return
  }
  await run(() => nutrition.updateEntry(entry.id, g))
}

async function addExtra() {
  const name = newExtra.value.trim()
  if (!name) return
  await run(() => nutrition.addChecklistItem(name))
  newExtra.value = ''
}

function remove(id) {
  if (confirmId.value !== id) {
    confirmId.value = id
    setTimeout(() => confirmId.value === id && (confirmId.value = null), 3000)
    return
  }
  confirmId.value = null
  run(() => nutrition.deleteEntry(id))
}

const dayName = (iso) => fromISO(iso).toLocaleDateString(undefined, { weekday: 'short' })
const maxKcal = computed(() => Math.max(d.value?.goals.kcal ?? 1, ...(d.value?.week.map((w) => w.kcal) ?? [0])))
const input = 'w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 focus:outline-none'

onMounted(() => load(nutrition.date))
</script>

<template>
  <div v-if="loadError" class="rounded-xl border border-red-500/40 bg-red-500/10 p-6 text-center text-sm text-red-300">
    {{ loadError }} <button type="button" class="ml-3 underline" @click="load(nutrition.date)">Retry</button>
  </div>
  <div v-else-if="!d" class="animate-pulse rounded-xl border border-slate-800 bg-slate-900/50 p-10 text-center text-sm text-slate-500">Loading…</div>

  <template v-else>
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-xl font-bold text-white">Nutrition</h1>
        <p class="text-sm text-slate-400">{{ dateLabel }}<span v-if="d.streak"> · <strong class="text-emerald-300">{{ d.streak }}-day</strong> streak of hitting both goals</span></p>
      </div>
      <div class="flex items-center gap-2">
        <button type="button" class="rounded-lg border border-slate-700 p-2 text-slate-300 hover:border-slate-500 hover:text-white" aria-label="Previous day" @click="shift(-1)"><AppIcon name="chevron-left" class="h-4 w-4" /></button>
        <button type="button" :disabled="d.is_today" class="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:border-slate-500 hover:text-white disabled:opacity-40" @click="load(toISO(new Date()))">Today</button>
        <button type="button" :disabled="d.is_today" class="rounded-lg border border-slate-700 p-2 text-slate-300 hover:border-slate-500 hover:text-white disabled:opacity-40" aria-label="Next day" @click="shift(1)"><AppIcon name="chevron-right" class="h-4 w-4" /></button>
      </div>
    </div>

    <!-- goals + verdict -->
    <SystemPanel>
      <div class="grid gap-6 sm:grid-cols-2">
        <MacroBar label="Calories" unit="kcal" :value="d.totals.kcal" :goal="d.goals.kcal" :state="d.status.kcal.state" />
        <MacroBar label="Protein" unit="g" :value="d.totals.protein" :goal="d.goals.protein" :state="d.status.protein.reached ? 'on' : 'under'" />
      </div>

      <div class="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-4">
        <p v-if="d.status.day_ok" class="flex items-center gap-2 text-sm font-medium text-emerald-300" role="status"><AppIcon name="check" class="h-4 w-4" /> Both goals hit {{ d.is_today ? 'today' : 'that day' }}</p>
        <p v-else-if="!d.entries.length" class="text-sm text-slate-400" role="status">Nothing logged yet.</p>
        <p v-else class="text-sm text-slate-400" role="status">
          <template v-if="d.status.kcal.state === 'over'">Calories are over target. </template>
          <template v-else-if="d.status.kcal.state === 'under'">{{ d.status.kcal.remaining }} kcal to go. </template>
          <template v-else>Calories are on target. </template>
          <template v-if="!d.status.protein.reached">{{ d.status.protein.remaining }} g protein to go.</template>
        </p>
        <button type="button" class="text-sm text-slate-400 hover:text-white" @click="openGoals">Change goals</button>
      </div>

      <form v-if="editingGoals" class="mt-4 flex flex-wrap items-end gap-3 rounded-lg bg-slate-800/60 p-4" @submit.prevent="saveGoals">
        <label class="w-36"><span class="mb-1 block text-xs text-slate-400">Calories per day</span><input v-model="goalForm.kcal" type="number" min="800" max="10000" :class="input" aria-label="Calorie goal" /></label>
        <label class="w-36"><span class="mb-1 block text-xs text-slate-400">Protein per day (g)</span><input v-model="goalForm.protein" type="number" min="10" max="600" :class="input" aria-label="Protein goal" /></label>
        <button type="submit" class="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400">Save goals</button>
        <button type="button" class="px-2 py-2 text-sm text-slate-400 hover:text-white" @click="editingGoals = false">Cancel</button>
        <p class="basis-full text-xs text-slate-500">Calories count as "on target" within ±10% of your goal. Protein only needs to reach its goal.</p>
        <p v-if="goalError" role="alert" class="basis-full text-sm text-red-300">{{ goalError }}</p>
      </form>
    </SystemPanel>

    <SystemPanel title="Daily extras" icon="check">
      <template #aside><span class="text-xs text-slate-500">{{ d.extras.done }} of {{ d.extras.total }}</span></template>
      <ul class="flex flex-wrap gap-2">
        <li v-for="c in d.checklist" :key="c.id" class="flex items-center overflow-hidden rounded-lg border text-sm" :class="c.done ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-200' : 'border-slate-700 bg-slate-900 text-slate-300'">
          <button type="button" role="checkbox" :aria-checked="c.done" class="flex items-center gap-2 px-3 py-1.5" @click="run(() => nutrition.check(c.id, !c.done))">
            <span class="flex h-4 w-4 items-center justify-center rounded border" :class="c.done ? 'border-emerald-400 bg-emerald-400 text-slate-950' : 'border-slate-500'"><AppIcon v-if="c.done" name="check" class="h-3 w-3" /></span>
            {{ c.name }}
          </button>
          <button type="button" class="px-2 py-1.5 text-slate-500 hover:text-red-300" :aria-label="`Remove ${c.name}`" @click="run(() => nutrition.removeChecklistItem(c.id))"><AppIcon name="x" class="h-3.5 w-3.5" /></button>
        </li>
      </ul>
      <form class="mt-3 flex gap-2" @submit.prevent="addExtra">
        <input v-model="newExtra" maxlength="60" placeholder="Add an extra, e.g. Creatine" :class="input" aria-label="New checklist item" />
        <button type="submit" :disabled="!newExtra.trim()" class="rounded-lg border border-slate-700 px-3 text-sm text-slate-200 hover:border-slate-500 disabled:opacity-40">Add</button>
      </form>
      <p class="mt-2 text-xs text-slate-500">Extras are for you to track. Your diet goal counts calories and protein only.</p>
    </SystemPanel>

    <div class="grid gap-5 lg:grid-cols-12">
      <SystemPanel title="Add food" icon="utensils" class="lg:col-span-7">
        <FoodPicker :recent="d.recent_foods" :add-fn="nutrition.addEntry" />
      </SystemPanel>

      <SystemPanel :title="d.is_today ? 'Eaten today' : 'Eaten that day'" icon="scroll" class="lg:col-span-5">
        <p v-if="!d.entries.length" class="py-6 text-center text-sm text-slate-500">Your list is empty. Search a food and add it.</p>
        <ul v-else class="space-y-1.5">
          <li v-for="e in d.entries" :key="e.id" class="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2">
            <div class="min-w-0 flex-1">
              <div class="truncate text-sm text-slate-100">{{ e.name }}</div>
              <div class="text-xs text-slate-500">{{ e.kcal }} kcal · {{ e.protein }} g protein</div>
            </div>
            <label class="flex items-center gap-1 text-xs text-slate-500">
              <input :value="e.grams" type="number" min="1" max="5000" step="any" class="w-16 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-right text-sm text-slate-100 focus:border-cyan-500 focus:outline-none" :aria-label="`Grams of ${e.name}`" @change="saveGrams(e, $event)" /> g
            </label>
            <button type="button" class="flex items-center gap-1 rounded-md p-1.5 text-xs" :class="confirmId === e.id ? 'bg-red-500/20 text-red-200' : 'text-slate-500 hover:text-red-300'" :aria-label="`Remove ${e.name}`" @click="remove(e.id)">
              <AppIcon name="trash" class="h-4 w-4" /><span v-if="confirmId === e.id">Sure?</span>
            </button>
          </li>
        </ul>
        <p v-if="d.entries.length" class="mt-3 text-right text-sm text-slate-300">Total <strong class="text-white">{{ d.totals.kcal }}</strong> kcal · <strong class="text-white">{{ d.totals.protein }}</strong> g protein</p>
      </SystemPanel>
    </div>

    <!-- week -->
    <SystemPanel title="Last 7 days" icon="activity">
      <div class="grid grid-cols-7 gap-2">
        <button v-for="w in d.week" :key="w.date" type="button" class="flex flex-col items-center gap-1.5 rounded-lg border p-2 transition-colors hover:border-slate-500" :class="w.date === d.date ? 'border-cyan-500 bg-cyan-500/5' : 'border-slate-800'" :aria-label="`${w.date}: ${w.kcal} kcal, ${w.protein} g protein${w.day_ok ? ', both goals hit' : ''}`" @click="load(w.date)">
          <span class="text-xs text-slate-500">{{ dayName(w.date) }}</span>
          <span class="relative flex h-16 w-5 items-end overflow-hidden rounded bg-slate-800">
            <span class="w-full rounded" :class="w.day_ok ? 'bg-emerald-400' : 'bg-slate-500'" :style="{ height: Math.min(100, (w.kcal / maxKcal) * 100) + '%' }"></span>
          </span>
          <span class="text-[11px] text-slate-400 tabular-nums">{{ w.kcal || '–' }}</span>
          <span class="flex h-4 items-center"><AppIcon v-if="w.day_ok" name="check" class="h-3.5 w-3.5 text-emerald-400" /></span>
        </button>
      </div>
      <p class="mt-3 text-xs text-slate-500">Green = both goals hit that day. Click a day to view or fix it.</p>
    </SystemPanel>
  </template>
</template>
