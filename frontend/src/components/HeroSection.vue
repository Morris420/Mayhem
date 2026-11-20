<script setup>
import AppIcon from './AppIcon.vue'

defineProps({
  user: { type: Object, required: true },
  stats: { type: Object, required: true },
  today: { type: Object, required: true },
})

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}
</script>

<template>
  <header class="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
    <div class="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
      <div>
        <p class="text-sm text-slate-400">{{ greeting() }}</p>
        <h1 class="text-2xl font-bold text-white">{{ user.username }}</h1>
        <p class="mt-1 text-sm text-slate-400">
          Level {{ user.level }} · {{ user.rank }}-rank
          <span v-if="today.total"> · {{ today.done }} of {{ today.total }} quests done today</span>
          <span v-else> · nothing planned today</span>
        </p>
      </div>

      <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-8">
        <div class="w-full sm:w-64">
          <div class="mb-1.5 flex justify-between text-xs">
            <span class="text-slate-400">Level {{ user.level }} → {{ user.level + 1 }}</span>
            <span class="font-medium text-slate-200">{{ user.xp_into_level }} / {{ user.xp_for_next }} XP</span>
          </div>
          <div class="h-2 overflow-hidden rounded-full bg-slate-800" role="progressbar" :aria-valuenow="user.progress_pct" aria-valuemin="0" aria-valuemax="100" aria-label="XP progress to next level">
            <div class="h-full rounded-full bg-cyan-400 transition-all duration-700" :style="{ width: user.progress_pct + '%' }"></div>
          </div>
        </div>

        <div class="flex items-center gap-2.5 rounded-lg bg-slate-800/70 px-3.5 py-2">
          <AppIcon name="flame" class="h-5 w-5 text-amber-400" />
          <div>
            <div class="text-lg leading-none font-bold text-white">{{ stats.streak }}</div>
            <div class="text-[11px] text-slate-400">day streak</div>
          </div>
        </div>
      </div>
    </div>
  </header>
</template>
