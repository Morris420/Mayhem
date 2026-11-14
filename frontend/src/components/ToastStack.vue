<script setup>
import AppIcon from './AppIcon.vue'
import { useToastStore } from '@/stores/toasts'

const toasts = useToastStore()

const styles = {
  info: 'border-cyan-500/50 text-cyan-200 shadow-[0_0_25px_rgba(6,182,212,0.25)]',
  success: 'border-emerald-500/50 text-emerald-200 shadow-[0_0_25px_rgba(16,185,129,0.25)]',
  level: 'border-purple-400/60 text-purple-200 shadow-[0_0_30px_rgba(168,85,247,0.35)]',
  achievement: 'border-amber-400/60 text-amber-200 shadow-[0_0_30px_rgba(245,158,11,0.4)]',
}
</script>

<template>
  <div class="pointer-events-none fixed right-4 bottom-4 z-50 flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2" aria-live="polite">
    <button
      v-for="t in toasts.items"
      :key="t.id"
      type="button"
      class="toast-in pointer-events-auto flex items-center gap-3 rounded-xl border bg-[#0a0e17]/95 p-3 text-left font-mono backdrop-blur-xl"
      :class="styles[t.kind] ?? styles.info"
      @click="toasts.dismiss(t.id)"
    >
      <span class="rounded-lg border border-current/30 bg-white/5 p-2">
        <AppIcon :name="t.icon" class="h-5 w-5" />
      </span>
      <span class="min-w-0">
        <span class="block text-xs font-black tracking-widest">{{ t.title }}</span>
        <span v-if="t.message" class="block truncate text-[11px] text-slate-300">{{ t.message }}</span>
      </span>
    </button>
  </div>
</template>
