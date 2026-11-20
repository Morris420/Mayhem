<script setup>
import { computed } from 'vue'
import { TIER_META } from '@/lib/tiers'

// How many times you cleared quests of each tier (all time).
const props = defineProps({ tiers: { type: Array, required: true } })
const max = computed(() => Math.max(1, ...props.tiers.map((t) => t.completions)))
</script>

<template>
  <ul class="space-y-2">
    <li v-for="t in tiers" :key="t.tier" class="flex items-center gap-3 text-xs">
      <span class="w-5 shrink-0 text-center font-semibold" :class="TIER_META[t.tier].text">{{ t.tier }}</span>
      <div class="h-2 flex-1 overflow-hidden rounded-full bg-slate-800" role="progressbar" :aria-valuenow="t.completions" aria-valuemin="0" :aria-valuemax="max" :aria-label="`${t.tier} tier completions`">
        <div class="h-full rounded-full transition-all duration-700" :class="TIER_META[t.tier].bar" :style="{ width: (t.completions / max) * 100 + '%' }"></div>
      </div>
      <span class="w-8 shrink-0 text-right text-slate-400">{{ t.completions }}</span>
    </li>
  </ul>
</template>
