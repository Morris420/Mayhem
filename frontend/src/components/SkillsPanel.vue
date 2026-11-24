<script setup>
import AppIcon from './AppIcon.vue'
import { skillColor } from '@/lib/skills'

// The nine skills, OSRS-style: a level, an XP bar and where the XP comes from.
defineProps({
  skills: { type: Array, required: true },
  totalLevel: { type: Number, default: 0 },
})
</script>

<template>
  <div>
    <div class="mb-3 flex items-baseline justify-between text-xs text-slate-400">
      <span>Total level <strong class="text-base text-slate-100" data-testid="total-level">{{ totalLevel }}</strong></span>
      <span>max {{ skills.length * 99 }}</span>
    </div>
    <ul class="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
      <li v-for="s in skills" :key="s.slug" class="rounded-lg border border-slate-800 bg-slate-900 p-2.5" :data-skill="s.slug" :title="s.description">
        <div class="flex items-center gap-2">
          <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md" :style="{ background: skillColor(s.slug) + '22', color: skillColor(s.slug) }">
            <AppIcon :name="s.icon" class="h-4 w-4" />
          </span>
          <span class="min-w-0 flex-1 truncate text-sm font-medium text-slate-100">{{ s.name }}</span>
          <span class="text-sm font-bold tabular-nums" :style="{ color: skillColor(s.slug) }">{{ s.level }}</span>
        </div>
        <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800" role="progressbar" :aria-valuenow="s.pct" aria-valuemin="0" aria-valuemax="100" :aria-label="`${s.name} progress to next level`">
          <div class="h-full rounded-full transition-all" :style="{ width: s.pct + '%', background: skillColor(s.slug) }"></div>
        </div>
        <div class="mt-1 text-[11px] text-slate-500">{{ s.needed ? `${s.into} / ${s.needed} XP` : 'Maxed' }}</div>
      </li>
    </ul>
  </div>
</template>
