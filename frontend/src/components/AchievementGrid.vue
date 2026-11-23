<script setup>
import AppIcon from './AppIcon.vue'
import { shortDate } from '@/lib/tiers'

defineProps({
  achievements: { type: Array, required: true },
  deletable: Boolean,
})
defineEmits(['delete'])
</script>

<template>
  <ul class="grid grid-cols-1 gap-3 sm:grid-cols-2">
    <li v-for="a in achievements" :key="a.id" class="flex gap-3 rounded-lg border p-3.5" :class="a.unlocked ? 'border-amber-500/40 bg-amber-500/5' : 'border-slate-800 bg-slate-900'">
      <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg" :class="a.unlocked ? 'bg-amber-500/15 text-amber-300' : 'bg-slate-800 text-slate-500'">
        <AppIcon :name="a.unlocked || a.progress?.pct > 0 ? a.icon : 'lock'" class="h-5 w-5" />
      </div>

      <div class="min-w-0 flex-1">
        <div class="flex items-start justify-between gap-2">
          <h3 class="text-sm font-semibold" :class="a.unlocked ? 'text-amber-200' : 'text-slate-100'">{{ a.name }}<span v-if="a.auto" class="ml-2 rounded bg-slate-800 px-1.5 py-0.5 align-middle text-[10px] font-medium text-slate-400">automatic</span></h3>
          <button v-if="deletable && a.custom" type="button" class="shrink-0 text-slate-500 hover:text-red-400" :aria-label="`Delete achievement ${a.name}`" @click="$emit('delete', a)">
            <AppIcon name="trash" class="h-4 w-4" />
          </button>
        </div>
        <p class="mt-0.5 text-xs leading-snug text-slate-400">{{ a.description }}</p>

        <div v-if="a.unlocked" class="mt-2 text-xs font-medium text-amber-300">Unlocked {{ shortDate(a.unlocked_at) }}</div>
        <div v-else-if="a.progress" class="mt-2">
          <div class="h-1.5 overflow-hidden rounded-full bg-slate-800" role="progressbar" :aria-valuenow="a.progress.pct" aria-valuemin="0" aria-valuemax="100" :aria-label="`${a.name} progress`">
            <div class="h-full rounded-full bg-cyan-400 transition-all duration-700" :style="{ width: a.progress.pct + '%' }"></div>
          </div>
          <div class="mt-1 text-[11px] text-slate-500">
            <template v-if="a.auto">{{ a.progress.done }} of {{ a.progress.total }} {{ a.progress.unit }}</template>
            <template v-else-if="a.linked_tasks">{{ a.progress.done }} of {{ a.linked_tasks }} linked quest{{ a.linked_tasks === 1 ? '' : 's' }} done</template>
            <template v-else>No quest linked yet</template>
          </div>
        </div>
      </div>
    </li>
  </ul>
</template>
