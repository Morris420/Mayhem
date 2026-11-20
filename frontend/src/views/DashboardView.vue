<script setup>
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import SystemPanel from '@/components/SystemPanel.vue'
import HeroSection from '@/components/HeroSection.vue'
import TodayList from '@/components/TodayList.vue'
import ActivityChart from '@/components/ActivityChart.vue'
import TierBars from '@/components/TierBars.vue'
import CompletionRing from '@/components/CompletionRing.vue'
import AchievementGrid from '@/components/AchievementGrid.vue'
import AppIcon from '@/components/AppIcon.vue'
import { useGameStore } from '@/stores/game'
import { useToastStore } from '@/stores/toasts'

const game = useGameStore()
const toasts = useToastStore()
const busyId = ref(null)
const loadError = ref('')

async function load() {
  loadError.value = ''
  try {
    await game.refreshAll()
  } catch {
    loadError.value = 'Could not reach the server. Is the Laravel server running?'
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

onMounted(load)
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
    <HeroSection :user="game.dashboard.user" :stats="game.dashboard.stats" :today="game.dashboard.today" />

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
            <div class="mt-1 text-right text-[11px] text-slate-500">{{ game.nextAchievement.progress.done }} of {{ game.nextAchievement.linked_tasks }} quests</div>
          </div>
          <p v-else class="text-sm text-slate-400">Link a quest to an achievement when you create it, and your progress shows up here.</p>
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

    <!-- Next build phase: evolving physique model linking to the gym tracker. -->
  </template>
</template>
