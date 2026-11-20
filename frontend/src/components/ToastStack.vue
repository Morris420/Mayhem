<script setup>
import AppIcon from './AppIcon.vue'
import { useToastStore } from '@/stores/toasts'

const toasts = useToastStore()

const styles = {
  info: 'border-slate-700 text-slate-100',
  success: 'border-emerald-500/40 text-emerald-200',
  level: 'border-violet-400/50 text-violet-200',
  achievement: 'border-amber-400/50 text-amber-200',
}
</script>

<template>
  <div class="pointer-events-none fixed right-4 bottom-4 z-50 flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2" aria-live="polite">
    <button
      v-for="t in toasts.items"
      :key="t.id"
      type="button"
      class="toast-in pointer-events-auto flex items-center gap-3 rounded-lg border bg-slate-900 p-3 text-left shadow-lg"
      :class="styles[t.kind] ?? styles.info"
      @click="toasts.dismiss(t.id)"
    >
      <span class="rounded-md bg-white/5 p-2"><AppIcon :name="t.icon" class="h-4 w-4" /></span>
      <span class="min-w-0">
        <span class="block text-sm font-semibold">{{ t.title }}</span>
        <span v-if="t.message" class="block truncate text-xs text-slate-400">{{ t.message }}</span>
      </span>
    </button>
  </div>
</template>
