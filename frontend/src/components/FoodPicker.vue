<script setup>
import { computed, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import { api, ApiError, describeError } from '@/lib/api'

// Find a food (search Open Food Facts / pick a recent one / type it in), choose how much, add it.
const props = defineProps({
  recent: { type: Array, default: () => [] },
  // async ({ grams, food_id } | { grams, food }) => void  - throws on failure so errors show here
  addFn: { type: Function, required: true },
})

const tab = ref('search')
const q = ref('')
const results = ref([])
const searching = ref(false)
const searched = ref(false)
const searchError = ref('')
let timer = null
let token = 0

const selected = ref(null) // { food_id?, food?, label, kcal_100g, protein_100g, serving_g }
const grams = ref(100)
const adding = ref(false)
const error = ref('')
const manual = ref({ name: '', kcal_100g: '', protein_100g: '', serving_g: '' })

watch(q, (v) => {
  clearTimeout(timer)
  searchError.value = ''
  searched.value = false
  if (v.trim().length < 2) {
    results.value = []
    return
  }
  timer = setTimeout(runSearch, 400)
})

async function runSearch() {
  const mine = ++token
  searching.value = true
  try {
    const res = await api.get(`/nutrition/search?q=${encodeURIComponent(q.value.trim())}`)
    if (mine !== token) return // an older search finished late: ignore it
    results.value = res.results
    searched.value = true
  } catch (e) {
    if (mine !== token) return
    results.value = []
    searchError.value = e instanceof ApiError && e.status === 502 ? e.message : describeError(e)
  } finally {
    if (mine === token) searching.value = false
  }
}

function choose(food, { fromRecent = false } = {}) {
  selected.value = {
    ...(fromRecent ? { food_id: food.id } : {}),
    food: { code: food.code ?? null, name: food.name, brand: food.brand ?? null, kcal_100g: food.kcal_100g, protein_100g: food.protein_100g, serving_g: food.serving_g ?? null },
    label: food.brand ? `${food.name} (${food.brand})` : food.name,
  }
  grams.value = food.serving_g || 100
  error.value = ''
}

const preview = computed(() => {
  const f = selected.value?.food
  const g = Number(grams.value)
  if (!f || !(g > 0)) return null
  return { kcal: Math.round((f.kcal_100g * g) / 100), protein: Math.round(((f.protein_100g * g) / 100) * 10) / 10 }
})

function useManual() {
  const m = manual.value
  choose({ name: m.name.trim(), kcal_100g: Number(m.kcal_100g), protein_100g: Number(m.protein_100g || 0), serving_g: m.serving_g ? Number(m.serving_g) : null })
}
const manualValid = computed(() => manual.value.name.trim() && manual.value.kcal_100g !== '' && Number(manual.value.kcal_100g) >= 0)

async function add() {
  if (!selected.value || !preview.value || adding.value) return
  adding.value = true
  error.value = ''
  try {
    await props.addFn(selected.value.food_id ? { food_id: selected.value.food_id, grams: Number(grams.value) } : { food: selected.value.food, grams: Number(grams.value) })
    selected.value = null
    if (tab.value === 'manual') manual.value = { name: '', kcal_100g: '', protein_100g: '', serving_g: '' }
  } catch (e) {
    error.value = e instanceof ApiError && e.status === 422 ? Object.values(e.errors).flat().join(' ') : describeError(e)
  } finally {
    adding.value = false
  }
}

const input = 'w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 focus:outline-none'
const tabs = [['search', 'Search'], ['recent', 'Recent'], ['manual', 'Type it in']]
</script>

<template>
  <div class="space-y-4">
    <div class="inline-flex rounded-lg bg-slate-800 p-0.5 text-sm" role="group" aria-label="How to find a food">
      <button v-for="[k, label] in tabs" :key="k" type="button" :aria-pressed="tab === k" class="rounded-md px-3.5 py-1.5 font-medium transition-colors" :class="tab === k ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-slate-200'" @click="tab = k">{{ label }}</button>
    </div>

    <!-- search -->
    <div v-if="tab === 'search'" class="space-y-2">
      <div class="relative">
        <input v-model="q" type="search" placeholder="Search foods, e.g. skyr, oats, chicken…" aria-label="Search foods" :class="input" />
        <span v-if="searching" class="absolute top-1/2 right-3 -translate-y-1/2 text-xs text-slate-500">searching…</span>
      </div>
      <p v-if="searchError" role="alert" class="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-200">{{ searchError }}
        <button type="button" class="ml-1 underline" @click="tab = 'manual'">Type it in</button>
      </p>
      <p v-else-if="searched && !results.length" class="text-sm text-slate-500">Nothing found. Try another word, or <button type="button" class="underline" @click="tab = 'manual'">type the food in</button>.</p>
      <ul v-if="results.length" class="max-h-72 space-y-1 overflow-y-auto pr-1">
        <li v-for="r in results" :key="r.code ?? r.name">
          <button type="button" class="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-left hover:border-slate-600" @click="choose(r)">
            <span class="min-w-0">
              <span class="block truncate text-sm text-slate-100">{{ r.name }}</span>
              <span v-if="r.brand" class="block truncate text-xs text-slate-500">{{ r.brand }}</span>
            </span>
            <span class="shrink-0 text-right text-xs text-slate-400">{{ r.kcal_100g }} kcal<br />{{ r.protein_100g }} g protein <span class="text-slate-600">/ 100 g</span></span>
          </button>
        </li>
      </ul>
    </div>

    <!-- recent -->
    <div v-else-if="tab === 'recent'">
      <p v-if="!recent.length" class="text-sm text-slate-500">Foods you add will show up here so you can log them again with one click.</p>
      <div class="flex flex-wrap gap-2">
        <button v-for="f in recent" :key="f.id" type="button" class="rounded-full border border-slate-700 px-3.5 py-1.5 text-sm text-slate-200 hover:border-cyan-500 hover:text-white" @click="choose(f, { fromRecent: true })">
          {{ f.name }}<span v-if="f.brand" class="text-slate-500"> · {{ f.brand }}</span>
        </button>
      </div>
    </div>

    <!-- manual -->
    <form v-else class="grid grid-cols-2 gap-3 sm:grid-cols-4" @submit.prevent="useManual">
      <label class="col-span-2 sm:col-span-4"><span class="mb-1 block text-xs text-slate-400">Name</span><input v-model="manual.name" type="text" maxlength="160" placeholder="e.g. Mum's lasagne" :class="input" aria-label="Food name" /></label>
      <label><span class="mb-1 block text-xs text-slate-400">kcal per 100 g</span><input v-model="manual.kcal_100g" type="number" min="0" max="900" step="any" :class="input" aria-label="kcal per 100 g" /></label>
      <label><span class="mb-1 block text-xs text-slate-400">protein per 100 g</span><input v-model="manual.protein_100g" type="number" min="0" max="100" step="any" :class="input" aria-label="protein per 100 g" /></label>
      <label><span class="mb-1 block text-xs text-slate-400">typical portion (g)</span><input v-model="manual.serving_g" type="number" min="1" :class="input" aria-label="typical portion in grams" /></label>
      <div class="flex items-end"><button type="submit" :disabled="!manualValid" class="w-full rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-100 hover:border-slate-400 disabled:opacity-40">Use this food</button></div>
    </form>

    <!-- amount -->
    <form v-if="selected" class="flex flex-wrap items-end gap-3 rounded-xl border border-cyan-500/40 bg-cyan-500/5 p-4" @submit.prevent="add">
      <div class="min-w-0 flex-1 basis-48">
        <p class="truncate text-sm font-semibold text-white">{{ selected.label }}</p>
        <p class="text-xs text-slate-400">{{ selected.food.kcal_100g }} kcal · {{ selected.food.protein_100g }} g protein per 100 g</p>
      </div>
      <label class="w-28"><span class="mb-1 block text-xs text-slate-400">Amount (g)</span><input v-model="grams" type="number" min="1" max="5000" step="any" :class="input" aria-label="Amount in grams" /></label>
      <p class="w-40 pb-2 text-sm text-slate-200" aria-live="polite"><template v-if="preview"><strong>{{ preview.kcal }}</strong> kcal · <strong>{{ preview.protein }}</strong> g protein</template></p>
      <button type="submit" :disabled="!preview || adding" class="flex items-center gap-2 rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-40"><AppIcon name="plus" class="h-4 w-4" /> {{ adding ? 'Adding…' : 'Add to list' }}</button>
      <button type="button" class="pb-2 text-sm text-slate-400 hover:text-white" @click="selected = null">Cancel</button>
      <p v-if="error" role="alert" class="basis-full text-sm text-red-300">{{ error }}</p>
    </form>
  </div>
</template>
