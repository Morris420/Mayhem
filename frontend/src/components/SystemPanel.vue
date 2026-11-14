<script setup>
import AppIcon from './AppIcon.vue'

// The glowing "System window" card used all over the dashboard.
defineProps({
  title: String,
  icon: String,
  accent: { type: String, default: 'cyan' }, // cyan | amber
  corners: Boolean,
})
</script>

<template>
  <section
    class="relative overflow-hidden rounded-2xl border border-cyan-500/30 bg-[#0a0e17]/85 p-5 shadow-xl backdrop-blur-xl sm:p-6"
  >
    <template v-if="corners">
      <span class="absolute top-0 left-0 h-4 w-4 border-t-2 border-l-2 border-cyan-400"></span>
      <span class="absolute top-0 right-0 h-4 w-4 border-t-2 border-r-2 border-cyan-400"></span>
      <span class="absolute bottom-0 left-0 h-4 w-4 border-b-2 border-l-2 border-cyan-400"></span>
      <span class="absolute right-0 bottom-0 h-4 w-4 border-r-2 border-b-2 border-cyan-400"></span>
    </template>

    <header
      v-if="title"
      class="mb-4 flex items-center justify-between gap-3 border-b border-cyan-500/20 pb-3 font-mono"
    >
      <div class="flex items-center gap-2">
        <AppIcon v-if="icon" :name="icon" class="h-4 w-4" :class="accent === 'amber' ? 'text-amber-400' : 'text-cyan-400'" />
        <h2
          class="text-xs font-bold tracking-wider uppercase"
          :class="accent === 'amber' ? 'text-amber-300' : 'text-cyan-300'"
        >
          {{ title }}
        </h2>
      </div>
      <slot name="aside" />
    </header>

    <slot />
  </section>
</template>
