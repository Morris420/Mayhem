<script setup>
import { computed, reactive, ref } from 'vue'
import AppIcon from './AppIcon.vue'
import BodyPartIcon from './BodyPartIcon.vue'
import { BODY_PARTS, BODY_PART_LABEL } from '@/lib/gym'
import { WEEKDAYS } from '@/lib/tiers'
import { ApiError, describeError } from '@/lib/api'

// Add or edit one exercise. `exercise` is null when adding.
const props = defineProps({
  exercise: { type: Object, default: null },
  // async (payload) => void ; throws ApiError on failure so errors show in the form
  saveFn: { type: Function, required: true },
})
const emit = defineEmits(['cancel'])

const form = reactive({
  name: props.exercise?.name ?? '',
  body_part: props.exercise?.body_part ?? 'chest',
  weekdays: [...(props.exercise?.weekdays ?? [])],
  goal_weight: props.exercise?.goal?.weight ?? '',
  goal_date: props.exercise?.goal?.date ?? '',
})
const errors = ref({})
const error = ref('')
const saving = ref(false)

const canSave = computed(() => form.name.trim() && !saving.value && (form.goal_weight === '' || !!form.goal_date))

function toggleDay(n) {
  form.weekdays = form.weekdays.includes(n) ? form.weekdays.filter((d) => d !== n) : [...form.weekdays, n].sort()
}

async function save() {
  errors.value = {}
  error.value = ''
  saving.value = true
  try {
    await props.saveFn({
      name: form.name.trim(),
      body_part: form.body_part,
      weekdays: form.weekdays,
      goal_weight: form.goal_weight === '' ? null : Number(form.goal_weight),
      goal_date: form.goal_weight === '' ? null : form.goal_date,
    })
  } catch (e) {
    if (e instanceof ApiError && e.status === 422) errors.value = e.errors
    else error.value = describeError(e)
  } finally {
    saving.value = false
  }
}

const inputClass = 'w-full rounded-md border border-cyan-500/30 bg-[#050b14] px-3 py-2 text-sm text-cyan-50 placeholder:text-slate-600 focus:border-cyan-300 focus:ring-1 focus:ring-cyan-300 focus:outline-none'
const labelClass = 'mb-1 block text-xs font-medium text-slate-400'
</script>

<template>
  <form class="space-y-4 rounded-xl border border-cyan-400/40 bg-[#0a1626] p-4 sm:p-5" @submit.prevent="save">
    <h2 class="text-sm font-semibold text-white">{{ exercise ? 'Edit exercise' : 'New exercise' }}</h2>

    <div>
      <label for="ex-name" :class="labelClass">Name</label>
      <input id="ex-name" v-model="form.name" type="text" maxlength="80" placeholder="e.g. Bench press" :class="inputClass" />
      <p v-for="m in errors.name" :key="m" class="mt-1 text-xs text-rose-300">{{ m }}</p>
    </div>

    <fieldset>
      <legend :class="labelClass">Body part</legend>
      <div class="flex flex-wrap gap-2">
        <button v-for="p in BODY_PARTS" :key="p" type="button" :aria-pressed="form.body_part === p" class="flex w-[4.5rem] flex-col items-center gap-1 rounded-lg border px-1 py-2 text-[11px] transition-colors" :class="form.body_part === p ? 'border-cyan-300 bg-cyan-400/10 text-cyan-200' : 'border-slate-700 text-slate-400 hover:border-slate-500'" @click="form.body_part = p">
          <BodyPartIcon :part="p" class="h-7 w-7" /> {{ BODY_PART_LABEL[p] }}
        </button>
      </div>
    </fieldset>

    <fieldset>
      <legend :class="labelClass">Days you do it</legend>
      <div class="flex flex-wrap gap-1.5">
        <button v-for="d in WEEKDAYS" :key="d.n" type="button" :aria-pressed="form.weekdays.includes(d.n)" :aria-label="d.long" class="h-9 w-11 rounded-md border text-xs font-semibold transition-colors" :class="form.weekdays.includes(d.n) ? 'border-cyan-300 bg-cyan-400/10 text-cyan-200' : 'border-slate-700 text-slate-400 hover:border-slate-500'" @click="toggleDay(d.n)">{{ d.short }}</button>
      </div>
    </fieldset>

    <div class="grid grid-cols-2 gap-3">
      <div>
        <label for="ex-goal" :class="labelClass">Goal weight (kg) <span class="text-slate-600">optional</span></label>
        <input id="ex-goal" v-model="form.goal_weight" type="number" step="0.5" min="0" :class="inputClass" />
      </div>
      <div>
        <label for="ex-date" :class="labelClass">…by</label>
        <input id="ex-date" v-model="form.goal_date" type="date" :disabled="form.goal_weight === ''" :class="[inputClass, 'disabled:opacity-40']" />
        <p v-for="m in errors.goal_date" :key="m" class="mt-1 text-xs text-rose-300">{{ m }}</p>
      </div>
    </div>

    <p v-if="error" role="alert" class="rounded-md bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{{ error }}</p>

    <div class="flex gap-2">
      <button type="submit" :disabled="!canSave" class="flex items-center gap-2 rounded-md bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-300 disabled:opacity-40">
        <AppIcon name="check" class="h-4 w-4" /> {{ saving ? 'Saving…' : exercise ? 'Save changes' : 'Add exercise' }}
      </button>
      <button type="button" class="rounded-md px-4 py-2 text-sm text-slate-400 hover:text-white" @click="emit('cancel')">Cancel</button>
    </div>
  </form>
</template>
