<script setup>
import { RouterLink, useRoute } from 'vue-router'
import AmbientBackground from '@/components/AmbientBackground.vue'
import AppIcon from '@/components/AppIcon.vue'

// Shared frame for the login and register pages (the Wender "System Access" card).
const route = useRoute()
const tabBase =
  'flex items-center justify-center gap-2 rounded-lg border px-4 py-2.5 font-mono text-xs font-bold tracking-wider uppercase transition-all duration-300'
const tabOn = 'border-cyan-500/40 bg-cyan-500/20 text-cyan-300 shadow-[0_0_15px_rgba(6,182,212,0.3)]'
const tabOff = 'border-transparent text-slate-400 hover:bg-cyan-500/10 hover:text-cyan-300'
</script>

<template>
  <div class="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#05070c] p-4 text-slate-100 md:p-8">
    <AmbientBackground />

    <div class="relative z-10 w-full max-w-xl">
      <div class="mb-4 flex items-center justify-between rounded-lg border border-cyan-500/30 bg-cyan-950/40 px-4 py-2 shadow-[0_0_15px_rgba(6,182,212,0.15)] backdrop-blur-md">
        <div class="flex items-center gap-2.5">
          <span class="relative flex h-2.5 w-2.5">
            <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75"></span>
            <span class="relative inline-flex h-2.5 w-2.5 rounded-full bg-cyan-500"></span>
          </span>
          <span class="font-mono text-xs font-semibold tracking-wider text-cyan-300 uppercase">
            System notice: authentication required
          </span>
        </div>
      </div>

      <div class="relative overflow-hidden rounded-2xl border border-cyan-500/40 bg-[#0a0e17]/85 p-6 shadow-[0_0_50px_rgba(6,182,212,0.2)] backdrop-blur-2xl md:p-8">
        <span class="absolute top-0 left-0 h-6 w-6 border-t-2 border-l-2 border-cyan-400"></span>
        <span class="absolute top-0 right-0 h-6 w-6 border-t-2 border-r-2 border-cyan-400"></span>
        <span class="absolute bottom-0 left-0 h-6 w-6 border-b-2 border-l-2 border-cyan-400"></span>
        <span class="absolute right-0 bottom-0 h-6 w-6 border-r-2 border-b-2 border-cyan-400"></span>
        <span class="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_10px_#22d3ee]"></span>

        <div class="mb-8 text-center">
          <div class="mb-3 inline-flex items-center justify-center rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-3 text-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.25)]">
            <AppIcon name="shield-alert" class="h-8 w-8" />
          </div>
          <h1 class="bg-gradient-to-r from-cyan-200 via-cyan-400 to-blue-500 bg-clip-text font-mono text-3xl font-black tracking-wider text-transparent uppercase">
            System access
          </h1>
          <p class="mt-1 font-mono text-xs tracking-widest text-cyan-300/60 uppercase">[ Hunter identity verification portal ]</p>
        </div>

        <nav class="mb-6 grid grid-cols-2 gap-2 rounded-xl border border-cyan-900/50 bg-slate-950/80 p-1">
          <RouterLink :to="{ name: 'login', query: route.query }" :class="[tabBase, route.name === 'login' ? tabOn : tabOff]">
            <AppIcon name="key-round" class="h-3.5 w-3.5" /> Login access
          </RouterLink>
          <RouterLink :to="{ name: 'register', query: route.query }" :class="[tabBase, route.name === 'register' ? tabOn : tabOff]">
            <AppIcon name="user-plus" class="h-3.5 w-3.5" /> Initiate registration
          </RouterLink>
        </nav>

        <slot />
      </div>

      <div class="mt-4 flex items-center gap-2 px-2 font-mono text-[10px] text-cyan-500/60">
        <AppIcon name="terminal" class="h-3 w-3" />
        <span>LOG: AUTH_GATEWAY_INITIALIZED...</span>
      </div>
    </div>
  </div>
</template>
