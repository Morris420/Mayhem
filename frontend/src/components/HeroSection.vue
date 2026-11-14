<script setup>
import AppIcon from './AppIcon.vue'
import { hunterId } from '@/lib/tiers'

defineProps({
  user: { type: Object, required: true },
  stats: { type: Object, required: true },
})
</script>

<template>
  <header class="relative overflow-hidden rounded-2xl border border-cyan-500/30 bg-[#0a0e17]/90 p-4 shadow-[0_0_30px_rgba(6,182,212,0.15)] backdrop-blur-xl sm:p-6">
    <span class="absolute top-0 left-0 h-4 w-4 border-t-2 border-l-2 border-cyan-400"></span>
    <span class="absolute top-0 right-0 h-4 w-4 border-t-2 border-r-2 border-cyan-400"></span>
    <span class="absolute bottom-0 left-0 h-4 w-4 border-b-2 border-l-2 border-cyan-400"></span>
    <span class="absolute right-0 bottom-0 h-4 w-4 border-r-2 border-b-2 border-cyan-400"></span>
    <span class="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-400 to-transparent"></span>

    <div class="flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
      <div class="flex items-center gap-4">
        <div class="relative shrink-0">
          <div class="flex h-16 w-16 items-center justify-center rounded-xl border-2 border-cyan-400/50 bg-gradient-to-br from-cyan-950 via-slate-900 to-cyan-900 p-1 shadow-[0_0_20px_rgba(34,211,238,0.3)] sm:h-20 sm:w-20">
            <span class="font-mono text-3xl font-black text-cyan-300 uppercase">{{ user.username.charAt(0) }}</span>
          </div>
          <span class="absolute -right-1 -bottom-2 rounded bg-cyan-500 px-2 py-0.5 font-mono text-[10px] font-black text-slate-950 shadow">LVL {{ user.level }}</span>
        </div>

        <div class="min-w-0 space-y-1">
          <div class="flex flex-wrap items-center gap-2">
            <span class="rounded border border-cyan-500/40 bg-cyan-950/80 px-2 py-0.5 font-mono text-[10px] font-bold tracking-wider text-cyan-300 uppercase">{{ user.rank }}-Rank Hunter</span>
            <span class="flex items-center gap-1 font-mono text-[11px] text-emerald-400">
              <span class="h-2 w-2 animate-pulse rounded-full bg-emerald-400"></span> SYSTEM LINKED
            </span>
          </div>
          <h1 class="truncate bg-gradient-to-r from-white via-cyan-200 to-cyan-400 bg-clip-text font-mono text-2xl font-black tracking-wider text-transparent uppercase sm:text-3xl">{{ user.username }}</h1>
          <div class="flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono text-xs text-slate-400">
            <span>TITLE: <strong class="text-cyan-300 uppercase">{{ user.title }}</strong></span>
            <span class="hidden sm:inline">•</span>
            <span>GUILD: <strong class="text-cyan-300 uppercase">{{ user.guild }}</strong></span>
            <span class="hidden sm:inline">•</span>
            <span>ID: <strong class="text-cyan-300">{{ hunterId(user.id) }}</strong></span>
          </div>
        </div>
      </div>

      <div class="flex flex-col items-stretch gap-4 sm:flex-row sm:items-center lg:gap-8">
        <div class="w-full space-y-1.5 font-mono sm:w-64">
          <div class="flex justify-between text-xs">
            <span class="font-bold text-cyan-400/80 uppercase">EXP progress</span>
            <span class="font-bold text-cyan-300">{{ user.xp_into_level }} / {{ user.xp_for_next }} XP ({{ user.progress_pct }}%)</span>
          </div>
          <div class="h-3 w-full overflow-hidden rounded-full border border-cyan-500/30 bg-slate-950 p-0.5" role="progressbar" :aria-valuenow="user.progress_pct" aria-valuemin="0" aria-valuemax="100">
            <div class="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 shadow-[0_0_10px_#22d3ee] transition-all duration-700" :style="{ width: user.progress_pct + '%' }"></div>
          </div>
          <div class="text-[10px] text-slate-500">{{ user.xp }} TOTAL XP</div>
        </div>

        <div class="flex items-center gap-3 rounded-xl border border-amber-500/40 bg-amber-950/20 p-3 shadow-[0_0_20px_rgba(245,158,11,0.12)]">
          <div class="rounded-lg bg-amber-500/20 p-2.5 text-amber-400"><AppIcon name="flame" class="h-6 w-6" /></div>
          <div class="font-mono">
            <div class="text-[10px] font-bold tracking-wider text-amber-300/80 uppercase">Daily streak</div>
            <div class="text-xl font-black tracking-widest text-amber-400">{{ stats.streak }} <span class="text-xs">{{ stats.streak === 1 ? 'DAY' : 'DAYS' }}</span></div>
            <div class="text-[9px] text-amber-400/70">COMPLETE A QUEST TODAY TO KEEP IT</div>
          </div>
        </div>
      </div>
    </div>
  </header>
</template>
