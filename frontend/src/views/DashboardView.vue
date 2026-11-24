<script setup>
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import SystemPanel from '@/components/SystemPanel.vue'
import HunterBanner from '@/components/HunterBanner.vue'
import TodayBrief from '@/components/TodayBrief.vue'
import TodayList from '@/components/TodayList.vue'
import ActivityChart from '@/components/ActivityChart.vue'
import TierBars from '@/components/TierBars.vue'
import CompletionRing from '@/components/CompletionRing.vue'
import SkillsPanel from '@/components/SkillsPanel.vue'
import AchievementGrid from '@/components/AchievementGrid.vue'
import AppIcon from '@/components/AppIcon.vue'
import PhysiqueFigure from '@/components/PhysiqueFigure.vue'
import { describeError } from '@/lib/api'
import { useGameStore } from '@/stores/game'
import { useGymStore } from '@/stores/gym'
import { useNutritionStore } from '@/stores/nutrition'
import MacroBar from '@/components/MacroBar.vue'
import { useToastStore } from '@/stores/toasts'

const game = useGameStore()
const gym = useGymStore()
const nutrition = useNutritionStore()
const toasts = useToastStore()
const busyId = ref(null)
const loadError = ref('')

async function load() {
  loadError.value = ''
  try {
    await game.refreshAll()
  } catch (e) {
    loadError.value = describeError(e)
  }
}

async function complete(id) {
  busyId.value = id
  try {
    await game.completeTask(id)
  } catch (e) {
    toasts.push({ title: 'Could not complete quest', message: e.message, kind: 'info', icon: 'alert' })
  } finally {
    busyId.value = null
  }
}

// The physique figure is a bonus: if the gym data can't load, the rest of the dashboard still works.
onMounted(() => {
  load()
  gym.load().catch(() => {})
  nutrition.load().catch(() => {})
})
</script>

<template>
  <div v-if="loadError" class="rounded-xl border border-red-500/40 bg-red-500/10 p-6 text-center text-sm text-red-300">
    {{ loadError }}
    <button type="button" class="ml-3 underline hover:text-red-200" @click="load">Retry</button>
  </div>

  <div v-else-if="!game.dashboard" class="animate-pulse rounded-xl border border-slate-800 bg-slate-900/50 p-10 text-center text-sm text-slate-500">
    Loading…
  </div>

  <template v-else>
    <HunterBanner :user="game.dashboard.user" :stats="game.dashboard.stats" :today="game.dashboard.today" :achievements="game.dashboard.achievements" :total-level="game.dashboard.total_level" :gym="gym.data" :diet-streak="nutrition.data?.streak ?? 0" />

    <TodayBrief :refresh-key="game.dashboard.stats.completions" />

    <div class="grid grid-cols-1 gap-5 lg:grid-cols-12">
      <div class="space-y-5 lg:col-span-8">
        <SystemPanel title="Today" icon="target">
          <template #aside>
            <RouterLink :to="{ name: 'calendar' }" class="text-xs text-slate-400 hover:text-white">Open calendar →</RouterLink>
          </template>
          <TodayList :pending="game.pendingToday" :done="game.doneToday" :busy-id="busyId" @complete="complete" />
        </SystemPanel>

        <SystemPanel title="Activity" icon="activity">
          <ActivityChart :data="game.dashboard.activity" />
        </SystemPanel>
      </div>

      <aside class="space-y-5 lg:col-span-4">
        <SystemPanel title="Overview">
          <div class="flex items-center gap-5">
            <CompletionRing :done="game.dashboard.today.done" :total="game.dashboard.today.total" />
            <dl class="flex-1 space-y-2 text-sm">
              <div class="flex justify-between"><dt class="text-slate-400">XP this week</dt><dd class="font-semibold text-slate-100">{{ game.dashboard.stats.week_xp }}</dd></div>
              <div class="flex justify-between"><dt class="text-slate-400">Total completed</dt><dd class="font-semibold text-slate-100">{{ game.dashboard.stats.completions }}</dd></div>
              <div class="flex justify-between"><dt class="text-slate-400">Quests</dt><dd class="font-semibold text-slate-100">{{ game.dashboard.stats.quests }}</dd></div>
            </dl>
          </div>
        </SystemPanel>

        <SystemPanel title="Next achievement" icon="sparkles" accent="amber">
          <div v-if="game.nextAchievement">
            <div class="flex items-center gap-3">
              <div class="rounded-lg bg-amber-500/15 p-2.5 text-amber-300"><AppIcon :name="game.nextAchievement.icon" class="h-5 w-5" /></div>
              <div class="min-w-0">
                <div class="truncate text-sm font-semibold text-slate-100">{{ game.nextAchievement.name }}</div>
                <div class="truncate text-xs text-slate-400">{{ game.nextAchievement.description }}</div>
              </div>
            </div>
            <div class="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-800">
              <div class="h-full rounded-full bg-amber-400 transition-all duration-700" :style="{ width: game.nextAchievement.progress.pct + '%' }"></div>
            </div>
            <div class="mt-1 text-right text-[11px] text-slate-500">{{ game.nextAchievement.progress.done }} of {{ game.nextAchievement.progress.total }} {{ game.nextAchievement.progress.unit }}</div>
          </div>
          <p v-else class="text-sm text-slate-400">Link a quest to an achievement when you create it, and your progress shows up here.</p>
        </SystemPanel>

        <SystemPanel v-if="nutrition.data" title="Nutrition today" icon="utensils">
          <template #aside><RouterLink :to="{ name: 'nutrition' }" class="text-xs text-slate-400 hover:text-white">Log food →</RouterLink></template>
          <div class="space-y-4">
            <MacroBar label="Calories" unit="kcal" :value="nutrition.data.totals.kcal" :goal="nutrition.data.goals.kcal" :state="nutrition.data.status.kcal.state" />
            <MacroBar label="Protein" unit="g" :value="nutrition.data.totals.protein" :goal="nutrition.data.goals.protein" :state="nutrition.data.status.protein.reached ? 'on' : 'under'" />
          </div>
        </SystemPanel>

        <SystemPanel title="Skills" icon="sparkles">
          <SkillsPanel :skills="game.dashboard.skills" :total-level="game.dashboard.total_level" />
        </SystemPanel>

        <SystemPanel title="Quests cleared by tier">
          <TierBars :tiers="game.dashboard.tiers" />
        </SystemPanel>
      </aside>
    </div>

    <SystemPanel title="Achievements" icon="trophy" accent="amber">
      <template #aside>
        <span class="text-xs text-slate-400">{{ game.dashboard.stats.achievements_unlocked }} of {{ game.dashboard.stats.achievements_total }} unlocked</span>
      </template>
      <AchievementGrid :achievements="game.dashboard.achievements" />
    </SystemPanel>

    <RouterLink :to="{ name: 'gym' }" class="group flex items-center gap-6 rounded-xl border border-cyan-500/30 bg-gradient-to-br from-[#0a1626] to-[#080d17] p-5 transition-colors hover:border-cyan-300/70" aria-label="Open the gym tracker">
      <div class="h-64 w-32 shrink-0 sm:h-72 sm:w-36"><PhysiqueFigure :stage="gym.data?.physique.stage ?? 1" :progress="(gym.data?.physique.next?.pct ?? 0) / 100" /></div>
      <div class="min-w-0 flex-1">
        <p class="text-xs tracking-wide text-cyan-300/70 uppercase">Physique · stage {{ gym.data?.physique.stage ?? 1 }} of 5</p>
        <p class="text-2xl font-bold text-white">{{ gym.data?.physique.name ?? 'Beginner' }}</p>
        <p class="mt-1 text-sm text-slate-400">
          <template v-if="gym.data">{{ gym.data.stats.sessions }} workouts logged · {{ gym.data.stats.sessions_this_week }} this week</template>
          <template v-else>Log your first workout to start building.</template>
        </p>
        <template v-if="gym.data?.physique.next">
          <div class="mt-3 h-1.5 max-w-xs overflow-hidden rounded-full bg-slate-800">
            <div class="h-full rounded-full bg-cyan-400 transition-all duration-700" :style="{ width: gym.data.physique.next.pct + '%' }"></div>
          </div>
          <p class="mt-1 text-xs text-slate-500">{{ gym.data.physique.next.remaining }} more to become {{ gym.data.physique.next.name }}</p>
        </template>
        <span class="mt-4 inline-flex items-center gap-1 text-sm font-medium text-cyan-300 group-hover:text-cyan-200">Open gym tracker <AppIcon name="chevron-right" class="h-4 w-4" /></span>
      </div>
    </RouterLink>
  </template>
</template>
