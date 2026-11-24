<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppIcon from './AppIcon.vue'
import SystemPanel from './SystemPanel.vue'
import { describeError } from '@/lib/api'
import { useGoogleStore } from '@/stores/google'
import { useToastStore } from '@/stores/toasts'

// Connect / sync / disconnect Google Calendar. Emits "synced" so the calendar can reload.
const emit = defineEmits(['synced'])
const google = useGoogleStore()
const toasts = useToastStore()
const route = useRoute()
const router = useRouter()

const error = ref('')
const confirmOff = ref(false)
const s = computed(() => google.status)

const STALE_MS = 5 * 60 * 1000
const lastSynced = computed(() => {
  if (!s.value?.last_synced_at) return 'never'
  return new Date(s.value.last_synced_at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
})

async function sync(quiet = false) {
  error.value = ''
  try {
    const r = await google.sync()
    emit('synced')
    if (!quiet) {
      const bits = [`${r.imported} events read`]
      if (r.created) bits.push(`${r.created} quests sent`)
      if (r.updated) bits.push(`${r.updated} updated`)
      if (r.removed) bits.push(`${r.removed} removed`)
      if (r.moved) bits.push(`${r.moved} quest${r.moved === 1 ? '' : 's'} moved by Google`)
      toasts.push({ title: 'Google Calendar synced', message: bits.join(' · '), kind: 'success', icon: 'calendar' })
    }
    if (r.errors?.length) error.value = r.errors.join(' ')
  } catch (e) {
    error.value = describeError(e)
    google.load().catch(() => {})
  }
}

async function connect() {
  error.value = ''
  try {
    await google.connect()
  } catch (e) {
    error.value = describeError(e)
  }
}

async function disconnect() {
  if (!confirmOff.value) {
    confirmOff.value = true
    setTimeout(() => (confirmOff.value = false), 3000)
    return
  }
  confirmOff.value = false
  await google.disconnect()
  emit('synced')
}

onMounted(async () => {
  // Coming back from Google's sign-in page
  const flag = route.query.google
  if (flag) {
    router.replace({ query: {} })
    if (flag === 'denied') error.value = 'Google sign-in was cancelled.'
    if (flag === 'error') error.value = route.query.reason || 'Google sign-in failed.'
  }
  try {
    await google.load()
    if (flag === 'connected') await sync()
    else if (s.value.connected && (!s.value.last_synced_at || Date.now() - new Date(s.value.last_synced_at).getTime() > STALE_MS)) await sync(true)
  } catch (e) {
    error.value = describeError(e)
  }
})
</script>

<template>
  <SystemPanel v-if="s" title="Google Calendar" icon="calendar">
    <template #aside>
      <span v-if="s.connected" class="flex items-center gap-1.5 text-xs text-emerald-300"><span class="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>Connected</span>
    </template>

    <!-- not set up on this machine yet -->
    <div v-if="!s.configured" class="space-y-2 text-sm text-slate-400">
      <p>Google Calendar isn't set up yet. It takes about 10 minutes, once:</p>
      <p>Follow <code class="rounded bg-slate-800 px-1.5 py-0.5 text-xs text-slate-200">docs/google-calendar-setup.md</code>, put the client ID and secret in <code class="rounded bg-slate-800 px-1.5 py-0.5 text-xs text-slate-200">backend/.env</code>, then restart the backend.</p>
      <p class="text-xs text-slate-500">Redirect address to register: <code class="text-slate-300">{{ s.redirect_uri }}</code></p>
    </div>

    <!-- set up, not connected -->
    <div v-else-if="!s.connected" class="flex flex-wrap items-center justify-between gap-3">
      <p class="max-w-xl text-sm text-slate-400">
        <template v-if="s.needs_reconnect">Google access ran out. Connect again to keep syncing.</template>
        <template v-else>See your Google events next to your quests, and send your quests to a separate "Mayhem" calendar in Google.</template>
      </p>
      <button type="button" class="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400" @click="connect">{{ s.needs_reconnect ? 'Reconnect' : 'Connect Google Calendar' }}</button>
    </div>

    <!-- connected -->
    <div v-else class="space-y-3">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <p class="text-sm text-slate-400">Last synced: <span class="text-slate-200">{{ lastSynced }}</span></p>
        <div class="flex items-center gap-2">
          <button type="button" :disabled="google.syncing" class="flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:border-slate-500 disabled:opacity-50" @click="sync()">
            <AppIcon name="repeat" class="h-4 w-4" :class="google.syncing && 'animate-spin'" />{{ google.syncing ? 'Syncing…' : 'Sync now' }}
          </button>
          <button type="button" class="rounded-lg px-3 py-1.5 text-sm" :class="confirmOff ? 'bg-red-500/20 text-red-200' : 'text-slate-500 hover:text-red-300'" @click="disconnect">{{ confirmOff ? 'Sure?' : 'Disconnect' }}</button>
        </div>
      </div>
      <label class="flex items-start gap-2.5 text-sm text-slate-300">
        <input type="checkbox" class="mt-1 h-4 w-4 accent-cyan-500" :checked="s.push_enabled" aria-label="Send my quests to Google Calendar" @change="google.setPush($event.target.checked)" />
        <span>Send my quests to Google Calendar<span class="block text-xs text-slate-500">Quests for the next 4 weeks appear as all-day events in a separate "Mayhem" calendar. Move one there and the quest moves here.</span></span>
      </label>
    </div>

    <p v-if="error" role="alert" class="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">{{ error }}</p>
  </SystemPanel>
</template>
