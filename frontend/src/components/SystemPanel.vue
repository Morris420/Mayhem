<script setup>
import AppIcon from './AppIcon.vue'

// The plain card used across the app: a title row and some content.
defineProps({
  title: String,
  icon: String,
  accent: { type: String, default: 'cyan' }, // cyan | amber
})
</script>

<template>
  <section class="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
    <header v-if="title" class="mb-4 flex items-center justify-between gap-3">
      <div class="flex items-center gap-2">
        <AppIcon v-if="icon" :name="icon" class="h-4 w-4" :class="accent === 'amber' ? 'text-amber-400' : 'text-slate-400'" />
        <h2 class="text-sm font-semibold text-slate-100">{{ title }}</h2>
      </div>
      <slot name="aside" />
    </header>
    <slot />
  </section>
</template>
