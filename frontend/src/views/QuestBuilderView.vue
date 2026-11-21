<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import SystemPanel from '@/components/SystemPanel.vue'
import AppIcon from '@/components/AppIcon.vue'
import ScheduleEditor from '@/components/ScheduleEditor.vue'
import AchievementGrid from '@/components/AchievementGrid.vue'
import { useGameStore } from '@/stores/game'
import { ApiError, describeError } from '@/lib/api'
import { TIERS, TIER_META, TIER_XP, describeSchedule } from '@/lib/tiers'

const game = useGameStore()

const ICONS = ['trophy', 'medal', 'footprints', 'dumbbell', 'flame', 'sunrise', 'brain', 'book', 'utensils', 'target', 'sparkles', 'flag', 'zap']

// One creation window, two modes: a normal quest, or a major achievement.
const mode = ref('quest') // 'quest' | 'achievement'

const quest = reactive({ title: '', description: '', tier: 'C', achievementId: null })
const questSchedule = ref({ mode: 'none', days: [], date: '' })
const ach = reactive({ name: '', description: '', icon: 'trophy', tier: 'B' })

const submitting = ref(false)
const errors = ref({})
const generalError = ref('')
const confirmDeleteId = ref(null)
const editingId = ref(null)
const editSchedule = ref({ mode: 'none', days: [], date: '' })
const search = ref('')
const loadError = ref('')

const inputClass = 'w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 focus:outline-none'
const labelClass = 'block text-xs font-medium text-slate-400'

function scheduleValid(s) {
  return s.mode === 'none' || (s.mode === 'weekly' && s.days.length > 0) || (s.mode === 'date' && !!s.date)
}
function schedulePayload(s) {
  if (s.mode === 'weekly') return { mode: 'weekly', days: s.days }
  if (s.mode === 'date') return { mode: 'date', date: s.date }
  return { mode: 'none' }
}

const canSubmit = computed(() => {
  if (submitting.value) return false
  if (mode.value === 'quest') return quest.title.trim().length > 0 && scheduleValid(questSchedule.value)
  return ach.name.trim().length > 0 && ach.description.trim().length > 0
})

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  return q ? game.tasks.filter((t) => t.title.toLowerCase().includes(q)) : game.tasks
})
const customAchievements = computed(() => game.catalog.filter((a) => a.custom))

async function submit() {
  errors.value = {}
  generalError.value = ''
  submitting.value = true
  try {
    if (mode.value === 'quest') {
      await game.createTask({
        title: quest.title.trim(),
        description: quest.description.trim() || null,
        tier: quest.tier,
        achievement_id: quest.achievementId,
        schedule: schedulePayload(questSchedule.value),
      })
      quest.title = ''
      quest.description = ''
      quest.achievementId = null
      questSchedule.value = { mode: 'none', days: [], date: '' }
    } else {
      await game.createAchievement({ name: ach.name.trim(), description: ach.description.trim(), icon: ach.icon, tier: ach.tier })
      ach.name = ''
      ach.description = ''
    }
  } catch (e) {
    if (e instanceof ApiError && e.status === 422) errors.value = e.errors
    else generalError.value = describeError(e)
  } finally {
    submitting.value = false
  }
}

function startEdit(t) {
  if (editingId.value === t.id) {
    editingId.value = null
    return
  }
  editingId.value = t.id
  editSchedule.value = { mode: t.schedule.mode, days: [...(t.schedule.days ?? [])], date: t.schedule.date ?? '' }
}

async function saveSchedule(t) {
  if (!scheduleValid(editSchedule.value)) return
  await game.setSchedule(t.id, schedulePayload(editSchedule.value))
  editingId.value = null
}

// Two-step delete: first click arms the button, second click confirms.
async function remove(id) {
  if (confirmDeleteId.value !== id) {
    confirmDeleteId.value = id
    setTimeout(() => confirmDeleteId.value === id && (confirmDeleteId.value = null), 3000)
    return
  }
  confirmDeleteId.value = null
  await game.deleteTask(id)
}

async function removeAchievement(a) {
  await game.deleteAchievement(a.id)
}

onMounted(() => Promise.all([game.refreshAll(), game.loadCatalog()]).catch((e) => (loadError.value = describeError(e))))
</script>

<template>
  <p v-if="loadError" role="alert" class="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-300">{{ loadError }}</p>
  <div class="grid grid-cols-1 gap-5 lg:grid-cols-12">
    <SystemPanel class="lg:col-span-5">
      <div class="mb-5 inline-flex w-full rounded-lg bg-slate-800 p-0.5 text-sm" role="group" aria-label="What to create">
        <button type="button" :aria-pressed="mode === 'quest'" class="flex-1 rounded-md py-2 font-medium transition-colors" :class="mode === 'quest' ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-slate-200'" @click="mode = 'quest'">Quest</button>
        <button type="button" :aria-pressed="mode === 'achievement'" class="flex-1 rounded-md py-2 font-medium transition-colors" :class="mode === 'achievement' ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-slate-200'" @click="mode = 'achievement'">Major achievement</button>
      </div>

      <form class="space-y-5" @submit.prevent="submit">
        <!-- ===== Quest ===== -->
        <template v-if="mode === 'quest'">
          <div class="space-y-1.5">
            <label for="title" :class="labelClass">Title</label>
            <input id="title" v-model="quest.title" type="text" maxlength="120" placeholder="e.g. Run 5 km" :class="inputClass" />
            <p v-for="m in errors.title" :key="m" class="text-xs text-red-300">{{ m }}</p>
          </div>

          <div class="space-y-1.5">
            <label for="description" :class="labelClass">Description <span class="text-slate-600">(optional)</span></label>
            <textarea id="description" v-model="quest.description" rows="2" maxlength="1000" :class="inputClass"></textarea>
          </div>

          <fieldset class="space-y-2">
            <legend :class="labelClass">Difficulty</legend>
            <div class="grid grid-cols-6 gap-1.5">
              <button v-for="t in TIERS" :key="t" type="button" :aria-pressed="quest.tier === t" class="rounded-lg border py-2 text-sm font-semibold transition-colors" :class="quest.tier === t ? TIER_META[t].ring : 'border-slate-700 text-slate-400 hover:border-slate-500'" @click="quest.tier = t">{{ t }}</button>
            </div>
            <p class="text-xs text-slate-400">
              <span :class="TIER_META[quest.tier].text">{{ TIER_META[quest.tier].name }}</span> · <strong class="text-slate-200">+{{ TIER_XP[quest.tier] }} XP</strong> each time you complete it
            </p>
          </fieldset>

          <fieldset class="space-y-2">
            <legend :class="labelClass">When</legend>
            <ScheduleEditor v-model="questSchedule" />
            <p v-for="m in errors['schedule.days']" :key="m" class="text-xs text-red-300">{{ m }}</p>
          </fieldset>

          <div class="space-y-1.5">
            <label for="achievement" :class="labelClass">Counts towards an achievement <span class="text-slate-600">(optional)</span></label>
            <select id="achievement" v-model="quest.achievementId" :class="inputClass">
              <option :value="null">None</option>
              <option v-for="a in game.catalog" :key="a.id" :value="a.id">{{ a.name }}{{ a.custom ? ' (yours)' : '' }}</option>
            </select>
            <p class="text-xs text-slate-500">The achievement unlocks once every quest linked to it has been completed.</p>
          </div>
        </template>

        <!-- ===== Major achievement ===== -->
        <template v-else>
          <div class="space-y-1.5">
            <label for="ach-name" :class="labelClass">Name</label>
            <input id="ach-name" v-model="ach.name" type="text" maxlength="60" placeholder="e.g. Marathon finisher" :class="inputClass" />
            <p v-for="m in errors.name" :key="m" class="text-xs text-red-300">{{ m }}</p>
          </div>

          <div class="space-y-1.5">
            <label for="ach-desc" :class="labelClass">What does it take?</label>
            <textarea id="ach-desc" v-model="ach.description" rows="2" maxlength="200" placeholder="Run 42 km in one go" :class="inputClass"></textarea>
            <p v-for="m in errors.description" :key="m" class="text-xs text-red-300">{{ m }}</p>
          </div>

          <fieldset class="space-y-2">
            <legend :class="labelClass">Icon</legend>
            <div class="flex flex-wrap gap-1.5">
              <button v-for="i in ICONS" :key="i" type="button" :aria-pressed="ach.icon === i" :aria-label="i" class="flex h-10 w-10 items-center justify-center rounded-lg border transition-colors" :class="ach.icon === i ? 'border-amber-400 bg-amber-500/15 text-amber-300' : 'border-slate-700 text-slate-400 hover:border-slate-500'" @click="ach.icon = i">
                <AppIcon :name="i" class="h-5 w-5" />
              </button>
            </div>
          </fieldset>

          <fieldset class="space-y-2">
            <legend :class="labelClass">Prestige</legend>
            <div class="grid grid-cols-6 gap-1.5">
              <button v-for="t in TIERS" :key="t" type="button" :aria-pressed="ach.tier === t" class="rounded-lg border py-2 text-sm font-semibold transition-colors" :class="ach.tier === t ? TIER_META[t].ring : 'border-slate-700 text-slate-400 hover:border-slate-500'" @click="ach.tier = t">{{ t }}</button>
            </div>
            <p class="text-xs text-slate-500">After creating it, link quests to it from the quest form. It unlocks when they are all done.</p>
          </fieldset>
        </template>

        <p v-if="generalError" role="alert" class="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{{ generalError }}</p>

        <button type="submit" :disabled="!canSubmit" class="flex w-full items-center justify-center gap-2 rounded-lg bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition-colors hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-40">
          <AppIcon name="plus" class="h-4 w-4" />
          {{ submitting ? 'Saving…' : mode === 'quest' ? 'Create quest' : 'Create achievement' }}
        </button>
      </form>
    </SystemPanel>

    <div class="space-y-5 lg:col-span-7">
      <!-- ===== Quest library ===== -->
      <SystemPanel title="Quest library" icon="scroll">
        <template #aside><span class="text-xs text-slate-400">{{ game.tasks.length }} quests</span></template>

        <input v-if="game.tasks.length > 6" v-model="search" type="search" placeholder="Search quests…" :class="[inputClass, 'mb-3']" aria-label="Search quests" />

        <p v-if="!game.tasks.length" class="py-8 text-center text-sm text-slate-500">No quests yet. Create your first one on the left.</p>

        <ul v-else class="space-y-2">
          <li v-for="t in filtered" :key="t.id" class="rounded-lg border border-slate-800 bg-slate-900 p-3">
            <div class="flex items-center gap-3">
              <span class="w-6 shrink-0 rounded py-0.5 text-center text-[11px] font-semibold" :class="TIER_META[t.tier].badge">{{ t.tier }}</span>
              <div class="min-w-0 flex-1">
                <div class="truncate text-sm font-medium text-slate-100">{{ t.title }}</div>
                <div class="flex flex-wrap gap-x-3 text-xs text-slate-500">
                  <span class="flex items-center gap-1" :class="t.schedule.mode === 'none' ? '' : 'text-cyan-300/90'">
                    <AppIcon :name="t.schedule.mode === 'weekly' ? 'repeat' : 'calendar'" class="h-3 w-3" /> {{ describeSchedule(t.schedule) }}
                  </span>
                  <span>+{{ t.xp }} XP</span>
                  <span v-if="t.achievement" class="text-amber-300/80">★ {{ t.achievement.name }}</span>
                  <span v-if="t.times_completed">done {{ t.times_completed }}×</span>
                </div>
              </div>
              <button type="button" class="flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors" :class="editingId === t.id ? 'border-cyan-500 text-cyan-300' : 'border-slate-700 text-slate-300 hover:border-slate-500'" :aria-expanded="editingId === t.id" :aria-label="`Schedule ${t.title}`" @click="startEdit(t)">
                <AppIcon name="calendar" class="h-3.5 w-3.5" /> Schedule
              </button>
              <button type="button" class="flex shrink-0 items-center gap-1 rounded-lg border px-2 py-1.5 text-xs transition-colors" :class="confirmDeleteId === t.id ? 'border-red-500 bg-red-500/15 text-red-200' : 'border-slate-700 text-slate-400 hover:border-red-500/50 hover:text-red-300'" :aria-label="`Delete quest: ${t.title}`" @click="remove(t.id)">
                <AppIcon name="trash" class="h-3.5 w-3.5" /> <span v-if="confirmDeleteId === t.id">Confirm?</span>
              </button>
            </div>

            <div v-if="editingId === t.id" class="mt-3 space-y-3 border-t border-slate-800 pt-3">
              <ScheduleEditor v-model="editSchedule" />
              <div class="flex gap-2">
                <button type="button" :disabled="!scheduleValid(editSchedule)" class="rounded-lg bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-40" @click="saveSchedule(t)">Save schedule</button>
                <button type="button" class="rounded-lg px-3 py-1.5 text-xs text-slate-400 hover:text-white" @click="editingId = null">Cancel</button>
              </div>
            </div>
          </li>
        </ul>
        <p v-if="game.tasks.length && !filtered.length" class="py-4 text-center text-sm text-slate-500">No quests match "{{ search }}".</p>
      </SystemPanel>

      <!-- ===== Your achievements ===== -->
      <SystemPanel title="Your achievements" icon="trophy" accent="amber">
        <p v-if="!customAchievements.length" class="py-4 text-center text-sm text-slate-500">You haven't created any achievements yet. Use the "Major achievement" tab.</p>
        <AchievementGrid v-else :achievements="customAchievements" deletable @delete="removeAchievement" />
      </SystemPanel>
    </div>
  </div>
</template>
