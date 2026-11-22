<script setup>
import { RouterLink, RouterView, useRouter } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import ToastStack from '@/components/ToastStack.vue'
import { useAuthStore } from '@/stores/auth'
import { useGameStore } from '@/stores/game'
import { useGymStore } from '@/stores/gym'

// The frame around every logged-in page: top navigation + logout.
const auth = useAuthStore()
const game = useGameStore()
const router = useRouter()

const links = [
  { name: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { name: 'calendar', label: 'Calendar', icon: 'calendar' },
  { name: 'quests', label: 'Quests', icon: 'scroll' },
  { name: 'gym', label: 'Gym', icon: 'dumbbell' },
]

async function logout() {
  await auth.logout()
  game.reset()
  useGymStore().reset()
  router.push({ name: 'login' })
}
</script>

<template>
  <div class="min-h-screen bg-[#0b0e14] text-slate-100">
    <header class="sticky top-0 z-20 border-b border-slate-800 bg-[#0b0e14]/90 backdrop-blur">
      <nav class="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div class="flex items-center gap-1 sm:gap-2">
          <span class="mr-2 text-base font-bold tracking-wide text-white sm:mr-4">Mayhem</span>
          <RouterLink
            v-for="l in links"
            :key="l.name"
            :to="{ name: l.name }"
            class="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100"
            active-class="!bg-slate-800 !text-white"
          >
            <AppIcon :name="l.icon" class="h-4 w-4" />
            <span class="hidden sm:inline">{{ l.label }}</span>
          </RouterLink>
        </div>

        <div class="flex items-center gap-3 text-sm">
          <span class="hidden text-slate-400 sm:inline">{{ auth.user?.username }}</span>
          <button type="button" class="flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-1.5 text-slate-300 transition-colors hover:border-slate-500 hover:text-white" @click="logout">
            <AppIcon name="log-out" class="h-4 w-4" /> <span class="hidden sm:inline">Log out</span>
          </button>
        </div>
      </nav>
    </header>

    <main class="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-6">
      <RouterView />
    </main>

    <ToastStack />
  </div>
</template>
