<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import SystemPanel from '@/components/SystemPanel.vue'
import { describeError } from '@/lib/api'
import { skillColor } from '@/lib/skills'
import { TIER_META, TIER_XP, describeSchedule } from '@/lib/tiers'
import { useCoachStore } from '@/stores/coach'

// The AI coach: it reads your Mayhem data, talks back, and proposes quests you accept or reject.
const coach = useCoachStore()

const draft = ref('')
const error = ref('')
const busyId = ref(null)
const profileOpen = ref(false)
const profileDraft = ref('')
const thread = ref(null)

const s = computed(() => coach.data)
const outOfMessages = computed(() => coach.left <= 0)

async function run(fn) {
  error.value = ''
  try {
    await fn()
  } catch (e) {
    error.value = describeError(e)
  }
}

async function send() {
  const message = draft.value.trim()
  if (!message || coach.thinking) return
  draft.value = ''
  await run(() => coach.send(message))
}

async function accept(id) {
  busyId.value = id
  await run(() => coach.accept(id))
  busyId.value = null
}

async function dismiss(id) {
  busyId.value = id
  await run(() => coach.dismiss(id))
  busyId.value = null
}

async function saveProfile() {
  await run(() => coach.saveProfile(profileDraft.value.trim()))
  profileOpen.value = false
}

function openProfile() {
  profileDraft.value = s.value?.profile ?? ''
  profileOpen.value = true
}

function time(at) {
  return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// Keep the newest message in view.
watch(() => [coach.messages.length, coach.thinking], async () => {
  await nextTick()
  if (thread.value) thread.value.scrollTop = thread.value.scrollHeight
})

onMounted(async () => {
  await run(() => coach.load())
  // The briefing for today is written on your first visit, and only once a day.
  if (s.value?.configured && !s.value.has_daily && !outOfMessages.value) await run(() => coach.daily())
})
</script>

<template>
  <div class="space-y-5">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-xl font-bold text-slate-100">Coach</h1>
        <p class="text-sm text-slate-400">The System reads your data and hands out quests. Nothing is added until you accept it.</p>
      </div>
      <div v-if="s" class="flex items-center gap-2">
        <button type="button" class="flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 transition-colors hover:border-slate-500" @click="openProfile">
          <AppIcon name="user" class="h-3.5 w-3.5" /> About me
        </button>
        <button v-if="coach.messages.length" type="button" class="flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-400 transition-colors hover:border-red-500/50 hover:text-red-300" @click="run(() => coach.clear())">
          <AppIcon name="trash" class="h-3.5 w-3.5" /> Clear chat
        </button>
      </div>
    </div>

    <p v-if="error" class="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">{{ error }}</p>

    <!-- no API key yet -->
    <SystemPanel v-if="s && !s.configured" title="The coach is not set up yet" icon="sparkles">
      <div class="space-y-2 text-sm text-slate-400">
        <p>It needs a key from an AI provider. The free one takes about two minutes:</p>
        <p>Get a key at <code class="rounded bg-slate-800 px-1.5 py-0.5 text-xs text-slate-200">aistudio.google.com/apikey</code>, put it in <code class="rounded bg-slate-800 px-1.5 py-0.5 text-xs text-slate-200">backend/.env</code> as <code class="rounded bg-slate-800 px-1.5 py-0.5 text-xs text-slate-200">GEMINI_API_KEY</code>, then restart the backend.</p>
        <p class="text-xs text-slate-500">Full steps, and how to use another provider instead: <code class="text-slate-300">docs/ai-coach-setup.md</code></p>
      </div>
    </SystemPanel>

    <SystemPanel v-else-if="s" title="Conversation" icon="sparkles">
      <template #aside>
        <span class="text-xs text-slate-500">{{ coach.left }} of {{ s.limits.messages.max }} messages left today</span>
      </template>

      <div ref="thread" class="max-h-[56vh] space-y-4 overflow-y-auto pr-1" data-testid="coach-thread">
        <p v-if="!coach.messages.length && !coach.thinking" class="py-10 text-center text-sm text-slate-500">
          Tell the coach what you are working towards, and it will start handing out quests.
        </p>

        <div v-for="m in coach.messages" :key="m.id" :data-role="m.role">
          <!-- what you said -->
          <div v-if="m.role === 'user'" class="flex justify-end">
            <div class="max-w-[85%] rounded-2xl rounded-br-sm bg-cyan-500/10 px-3.5 py-2.5 text-sm text-cyan-50">
              {{ m.content }}
              <div class="mt-1 text-right text-[10px] text-cyan-200/50">{{ time(m.at) }}</div>
            </div>
          </div>

          <!-- what the coach said -->
          <div v-else class="space-y-3">
            <div class="flex gap-2.5">
              <span class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-violet-500/40 bg-violet-500/10 text-violet-300">
                <AppIcon name="sparkles" class="h-4 w-4" />
              </span>
              <div class="min-w-0 flex-1 rounded-2xl rounded-tl-sm bg-slate-800/70 px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-line text-slate-200">
                <span v-if="m.kind === 'daily'" class="mb-1 block text-[10px] font-semibold tracking-wider text-violet-300 uppercase">Daily briefing</span>
                {{ m.content }}
                <div class="mt-1 text-[10px] text-slate-500">{{ time(m.at) }}</div>
              </div>
            </div>

            <!-- quests it proposes -->
            <ul v-if="m.proposals.length" class="space-y-2 pl-9.5">
              <li
                v-for="p in m.proposals"
                :key="p.id"
                class="rounded-xl border p-3 transition-colors"
                :class="p.status === 'accepted' ? 'border-emerald-500/40 bg-emerald-500/5' : p.status === 'dismissed' ? 'border-slate-800 bg-slate-900/40 opacity-50' : 'border-slate-700 bg-slate-900'"
                :data-proposal="p.id"
              >
                <div class="flex items-start gap-3">
                  <span class="mt-0.5 w-6 shrink-0 rounded py-0.5 text-center text-[11px] font-semibold" :class="TIER_META[p.tier].badge">{{ p.tier }}</span>
                  <div class="min-w-0 flex-1">
                    <div class="text-sm font-medium text-slate-100">{{ p.title }}</div>
                    <p v-if="p.description" class="mt-0.5 text-xs text-slate-400">{{ p.description }}</p>
                    <div class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                      <span v-if="p.skill" :style="{ color: skillColor(p.skill.slug) }">{{ p.skill.name }}</span>
                      <span class="flex items-center gap-1">
                        <AppIcon :name="p.schedule.mode === 'weekly' ? 'repeat' : 'calendar'" class="h-3 w-3" />
                        {{ describeSchedule(p.schedule) }}
                      </span>
                      <span>+{{ TIER_XP[p.tier] }} XP</span>
                    </div>
                    <p v-if="p.reason" class="mt-1.5 border-l-2 border-slate-700 pl-2 text-xs text-slate-400 italic">{{ p.reason }}</p>
                  </div>

                  <div v-if="p.status === 'pending'" class="flex shrink-0 gap-1.5">
                    <button type="button" :disabled="busyId === p.id" class="flex items-center gap-1 rounded-lg border border-emerald-500/60 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-medium text-emerald-200 transition-colors hover:bg-emerald-500/20 disabled:opacity-50" @click="accept(p.id)">
                      <AppIcon name="check" class="h-3.5 w-3.5" /> Accept
                    </button>
                    <button type="button" :disabled="busyId === p.id" class="rounded-lg border border-slate-700 px-2 py-1.5 text-xs text-slate-400 transition-colors hover:border-slate-500 disabled:opacity-50" :aria-label="`Dismiss ${p.title}`" @click="dismiss(p.id)">
                      <AppIcon name="x" class="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <span v-else-if="p.status === 'accepted'" class="shrink-0 text-xs font-medium text-emerald-300">Accepted</span>
                  <span v-else class="shrink-0 text-xs text-slate-500">Dismissed</span>
                </div>
              </li>
            </ul>
          </div>
        </div>

        <div v-if="coach.thinking" class="flex items-center gap-2.5 text-sm text-slate-500">
          <span class="flex h-7 w-7 items-center justify-center rounded-lg border border-violet-500/40 bg-violet-500/10 text-violet-300">
            <AppIcon name="sparkles" class="h-4 w-4 animate-pulse" />
          </span>
          Reading your data…
        </div>
      </div>

      <form class="mt-4 flex gap-2 border-t border-slate-800 pt-4" @submit.prevent="send">
        <input
          v-model="draft"
          type="text"
          maxlength="2000"
          :disabled="coach.thinking || outOfMessages"
          :placeholder="outOfMessages ? 'That is today\'s messages used up.' : 'Ask for quests, or tell it how the week went…'"
          class="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-cyan-500 focus:outline-none disabled:opacity-50"
          aria-label="Message the coach"
        />
        <button type="submit" :disabled="coach.thinking || outOfMessages || !draft.trim()" class="flex items-center gap-1.5 rounded-lg border border-cyan-500 bg-cyan-500/10 px-3.5 py-2 text-sm font-medium text-cyan-200 transition-colors hover:bg-cyan-500/20 disabled:opacity-40">
          <AppIcon name="zap" class="h-4 w-4" /> Send
        </button>
      </form>
      <p class="mt-2 text-xs text-slate-600">Using {{ s.provider }}. It sees your quests, skills, gym, food and achievements, never your Google Calendar.</p>
    </SystemPanel>

    <!-- what the coach knows about you -->
    <SystemPanel v-if="profileOpen" title="About me" icon="user">
      <p class="mb-2 text-xs text-slate-500">Your goals, your situation, how hard you want to be pushed. The coach reads this before every answer.</p>
      <textarea
        v-model="profileDraft"
        rows="6"
        maxlength="4000"
        placeholder="e.g. 31, work night shifts, two kids. Want to bench 100kg by summer and read more. Push me hard on training, gently on study."
        class="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-cyan-500 focus:outline-none"
        aria-label="About me"
      ></textarea>
      <div class="mt-2 flex justify-end gap-2">
        <button type="button" class="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-400 hover:border-slate-500" @click="profileOpen = false">Cancel</button>
        <button type="button" class="rounded-lg border border-cyan-500 bg-cyan-500/10 px-3 py-1.5 text-sm font-medium text-cyan-200 hover:bg-cyan-500/20" @click="saveProfile">Save</button>
      </div>
    </SystemPanel>
  </div>
</template>
