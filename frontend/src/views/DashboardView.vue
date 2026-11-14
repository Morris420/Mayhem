<script setup>
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import SystemPanel from '@/components/SystemPanel.vue'
import HeroSection from '@/components/HeroSection.vue'
import QuestList from '@/components/QuestList.vue'
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
    loadError.value = 'Could not sync with the System. Is the Laravel server running?'
  }
}

async function complete(id) {
  busyId.value = id
  try {
    await game.completeTask(id)
  } catch (e) {
    toasts.push({ title: 'SYNC FAILED', message: e.message, kind: 'info', icon: 'shield-alert' })
  } finally {
    busyId.value = null
  }
}

onMounted(load)
</script>

<template>
  <div v-if="loadError" class="rounded-2xl border border-red-500/40 bg-red-950/30 p-6 text-center font-mono text-sm text-red-300">
    ⚠ {{ loadError }}
    <button type="button" class="ml-3 underline hover:text-red-200" @click="load">Retry</button>
  </div>

  <div v-else-if="!game.dashboard" class="animate-pulse rounded-2xl border border-cyan-500/20 bg-[#0a0e17]/70 p-10 text-center font-mono text-xs tracking-widest text-cyan-400/70">
    SYNCHRONISING WITH THE SYSTEM…
  </div>

  <template v-else>
    <HeroSection :user="game.dashboard.user" :stats="game.dashboard.stats" />

    <div class="grid grid-cols-1 gap-6 lg:grid-cols-12">
      <div class="space-y-6 lg:col-span-8">
        <SystemPanel title="Active quests" icon="target">
          <template #aside>
            <span class="text-xs text-slate-400">
              <strong class="text-cyan-300">{{ game.pendingTasks.length }}</strong> PENDING ·
              <strong class="text-emerald-400">{{ game.completedTasks.length }}</strong> DONE
            </span>
          </template>
          <QuestList :pending="game.pendingTasks" :completed="game.completedTasks" :busy-id="busyId" @complete="complete" />
        </SystemPanel>

        <SystemPanel title="Progress report" icon="activity">
          <ActivityChart :data="game.dashboard.activity" />
          <h3 class="mt-6 mb-3 font-mono text-[11px] tracking-wider text-slate-400 uppercase">Quests cleared by tier</h3>
          <TierBars :tiers="game.dashboard.tiers" />
        </SystemPanel>

        <SystemPanel title="Major achievements" icon="trophy" accent="amber">
          <template #aside>
            <span class="rounded border border-amber-500/30 bg-amber-950/40 px-2 py-0.5 text-[11px] text-amber-400/90">
              {{ game.dashboard.stats.achievements_unlocked }} / {{ game.dashboard.achievements.length }} UNLOCKED
            </span>
          </template>
          <AchievementGrid :achievements="game.dashboard.achievements" />
        </SystemPanel>
      </div>

      <aside class="space-y-6 lg:col-span-4">
        <SystemPanel title="Hunter stats" icon="shield" corners>
          <div class="flex items-center gap-5">
            <CompletionRing :pct="game.dashboard.stats.completion_rate" />
            <dl class="flex-1 space-y-2 font-mono text-xs">
              <div class="flex justify-between"><dt class="text-slate-400">TOTAL QUESTS</dt><dd class="font-bold text-cyan-200">{{ game.dashboard.stats.total }}</dd></div>
              <div class="flex justify-between"><dt class="text-slate-400">COMPLETED</dt><dd class="font-bold text-emerald-400">{{ game.dashboard.stats.completed }}</dd></div>
              <div class="flex justify-between"><dt class="text-slate-400">PENDING</dt><dd class="font-bold text-cyan-300">{{ game.dashboard.stats.pending }}</dd></div>
              <div class="flex justify-between"><dt class="text-slate-400">STREAK</dt><dd class="font-bold text-amber-300">{{ game.dashboard.stats.streak }} {{ game.dashboard.stats.streak === 1 ? 'day' : 'days' }}</dd></div>
            </dl>
          </div>
        </SystemPanel>

        <SystemPanel title="Closest unlock" icon="sparkles" accent="amber">
          <div v-if="game.nextAchievement" class="font-mono">
            <div class="flex items-center gap-3">
              <div class="rounded-lg border border-amber-400/50 bg-amber-500/10 p-2.5 text-amber-300"><AppIcon :name="game.nextAchievement.icon" class="h-6 w-6" /></div>
              <div>
                <div class="text-sm font-bold text-amber-200">{{ game.nextAchievement.name }}</div>
                <div class="text-[11px] text-slate-400">{{ game.nextAchievement.description }}</div>
              </div>
            </div>
            <div class="mt-3 h-2 overflow-hidden rounded-full border border-amber-500/30 bg-slate-950 p-px">
              <div class="h-full rounded-full bg-gradient-to-r from-amber-500 to-yellow-300 transition-all duration-700" :style="{ width: game.nextAchievement.progress.pct + '%' }"></div>
            </div>
            <div class="mt-1 text-right text-[10px] text-amber-300/80">{{ game.nextAchievement.progress.pct }}% — {{ game.nextAchievement.progress.done }}/{{ game.nextAchievement.linked_tasks }} quests</div>
          </div>
          <p v-else class="font-mono text-xs text-slate-400">
            Link a quest to an achievement in the quest builder and your progress towards it shows up here.
          </p>
        </SystemPanel>

        <RouterLink :to="{ name: 'quests' }" class="flex items-center justify-center gap-2 rounded-xl border border-cyan-400 bg-cyan-500/20 px-4 py-3.5 font-mono text-xs font-black tracking-widest text-cyan-200 uppercase shadow-[0_0_20px_rgba(34,211,238,0.2)] transition-all hover:bg-cyan-500/30">
          <AppIcon name="plus" class="h-4 w-4" /> New quest
        </RouterLink>
      </aside>
    </div>

    <!-- Placeholder for the next build session: physique scan -> gym tracker -> kcal tracker -->
    <SystemPanel title="Physique scan" icon="scan" corners>
      <div class="flex flex-col items-center gap-2 py-8 text-center font-mono">
        <div class="rounded-xl border border-slate-700 bg-slate-900/80 p-4 text-slate-500"><AppIcon name="lock" class="h-8 w-8" /></div>
        <p class="text-xs font-bold tracking-widest text-slate-300 uppercase">Module locked</p>
        <p class="max-w-md text-[11px] text-slate-500">
          Your evolving body model, the 7-day gym tracker and the calorie &amp; protein tracker unlock in the next build phase.
        </p>
      </div>
    </SystemPanel>
  </template>
</template>
