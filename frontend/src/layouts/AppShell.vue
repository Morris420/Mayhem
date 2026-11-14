<script setup>
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import AmbientBackground from '@/components/AmbientBackground.vue'
import AppIcon from '@/components/AppIcon.vue'
import ToastStack from '@/components/ToastStack.vue'
import { useAuthStore } from '@/stores/auth'
import { useGameStore } from '@/stores/game'
import { hunterId } from '@/lib/tiers'

// The frame around every logged-in page: ambient glow, top bar with tabs, logout.
const auth = useAuthStore()
const game = useGameStore()
const router = useRouter()
const route = useRoute()

async function logout() {
  await auth.logout()
  game.reset()
  router.push({ name: 'login' })
}

const tabBase =
  'flex items-center gap-2 rounded-lg border px-3.5 py-2 font-mono text-xs font-bold tracking-wider uppercase transition-all'
const tabOn = 'border-cyan-500/40 bg-cyan-500/20 text-cyan-300 shadow-[0_0_15px_rgba(6,182,212,0.3)]'
const tabOff = 'border-transparent text-slate-400 hover:bg-cyan-500/10 hover:text-cyan-300'
</script>

<template>
  <div class="relative min-h-screen overflow-x-hidden bg-[#05070c] p-3 text-slate-100 sm:p-6 md:p-8">
    <AmbientBackground />

    <div class="relative z-10 mx-auto max-w-7xl space-y-6">
      <nav class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-cyan-500/30 bg-[#0a0e17]/90 px-4 py-3 backdrop-blur-xl">
        <div class="flex flex-wrap items-center gap-2">
          <span class="mr-2 bg-gradient-to-r from-white via-cyan-200 to-cyan-400 bg-clip-text font-mono text-lg font-black tracking-[0.25em] text-transparent">MAYHEM</span>
          <RouterLink :to="{ name: 'dashboard' }" :class="[tabBase, route.name === 'dashboard' ? tabOn : tabOff]">
            <AppIcon name="dashboard" class="h-3.5 w-3.5" /> Dashboard
          </RouterLink>
          <RouterLink :to="{ name: 'quests' }" :class="[tabBase, route.name === 'quests' ? tabOn : tabOff]">
            <AppIcon name="scroll" class="h-3.5 w-3.5" /> Quest builder
          </RouterLink>
        </div>

        <div class="flex items-center gap-3 font-mono text-xs">
          <span class="hidden text-slate-400 sm:inline">
            <span class="text-cyan-300">{{ auth.user?.username }}</span> · {{ hunterId(auth.user?.id) }}
          </span>
          <button type="button" class="flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-slate-300 transition-colors hover:border-red-500/50 hover:text-red-300" @click="logout">
            <AppIcon name="log-out" class="h-3.5 w-3.5" /> Log out
          </button>
        </div>
      </nav>

      <RouterView />

      <footer class="flex flex-col items-center justify-between gap-2 rounded-xl border border-cyan-500/20 bg-[#0a0e17]/80 p-4 font-mono text-[11px] text-cyan-500/70 backdrop-blur-md sm:flex-row">
        <span class="flex items-center gap-2"><AppIcon name="terminal" class="h-3.5 w-3.5" /> SYSTEM LOG: QUEST_TRACKER_SYNCED</span>
        <span>HUNTER_ID: {{ hunterId(auth.user?.id) }}</span>
      </footer>
    </div>

    <ToastStack />
  </div>
</template>
