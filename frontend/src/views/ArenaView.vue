<script setup>
import { onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { useRoute } from 'vue-router'
import { createArena } from '@/arena/engine'
import { useArenaStore } from '@/stores/arena'

// The arena page. Vue owns the frame around the game and the HUD; the game itself
// runs in plain JS (src/arena/) and pushes its state here a few times a second.
// Vue reactivity never runs inside the 60 fps loop.
const route = useRoute()
const testMode = route.query.test === '1'

const host = ref(null)
const status = ref('loading') // loading | ready | error
const errorText = ref('')
const hud = shallowRef(null)

let arena = null
let alive = true
const store = useArenaStore()
const loadout = shallowRef(null)

onMounted(async () => {
  try {
    // Your fighter's stats come from your skills, computed by the server. If that
    // fails the arena still opens, with base stats.
    try {
      loadout.value = await store.load()
    } catch (e) {
      console.warn('[arena] loadout unavailable, using base stats', e)
    }
    if (!alive) return
    const created = await createArena(host.value, {
      test: testMode,
      loadout: loadout.value,
      onHud: (s) => (hud.value = s),
    })
    // The user may have left the page while the physics was still loading.
    if (!alive) return created.dispose()
    arena = created
    status.value = 'ready'
    // Tests drive the game through this; see docs/arena-playbook.md §2.
    if (testMode) window.__arena = arena.testHook
  } catch (e) {
    if (!alive) return
    status.value = 'error'
    errorText.value = /webgl/i.test(String(e?.message))
      ? 'Your browser could not start 3D graphics (WebGL). Try another browser or enable hardware acceleration.'
      : 'The arena failed to load. Reload the page; if it keeps happening, check the browser console.'
    console.warn('[arena]', e)
  }
})

onBeforeUnmount(() => {
  alive = false
  if (arena && window.__arena === arena.testHook) delete window.__arena
  arena?.dispose()
  arena = null
})

// What the body is doing, in a word.
const motion = (p) => {
  if (p.combat && p.combat !== 'free') return p.combat
  return p.wall ? 'wall' : !p.grounded ? 'airborne' : p.sprinting ? 'sprinting' : 'grounded'
}
// "+6%" style, from a multiplier.
const bonus = (m) => `${m >= 1 ? '+' : ''}${Math.round((m - 1) * 100)}%`
const pct = (f) => `${Math.round((100 * f.hp) / f.maxHp)}%`
const guardPct = (f) => `${Math.round((100 * f.guard) / f.guardMax)}%`

// One decimal, a space where the minus sign would be so the columns don't jump,
// and never "-0.0".
const fmt = (n) => {
  const v = Math.abs(n) < 0.05 ? 0 : n
  return (v >= 0 ? ' ' : '') + v.toFixed(1)
}
</script>

<template>
  <section
    class="relative h-[calc(100dvh-8.5rem)] min-h-[420px] overflow-hidden rounded-xl border border-cyan-900/60 bg-[#04060b] shadow-[0_0_40px_-12px_rgba(34,211,238,0.35)]"
  >
    <div ref="host" class="absolute inset-0" data-testid="arena-host"></div>

    <div
      v-if="status === 'loading'"
      class="absolute inset-0 flex items-center justify-center text-sm tracking-widest text-cyan-300/80"
    >
      ENTERING THE ARENA…
    </div>
    <div
      v-else-if="status === 'error'"
      class="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-rose-300"
      role="alert"
    >
      {{ errorText }}
    </div>

    <template v-if="status === 'ready' && hud">
      <!-- Health bars, fighting-game style: you on the left, the dummy on the right. -->
      <div class="pointer-events-none absolute inset-x-3 top-3 flex items-start gap-3 sm:gap-6">
        <div class="flex-1">
          <div class="mb-1 flex justify-between text-[11px] font-semibold tracking-widest">
            <span class="text-cyan-300">HUNTER</span>
            <span class="font-mono text-cyan-200/80">{{ hud.player.hp }}</span>
          </div>
          <div class="h-2.5 overflow-hidden rounded-sm border border-cyan-900/70 bg-black/60">
            <div
              data-testid="hp-player"
              class="h-full bg-gradient-to-r from-cyan-500 to-cyan-300 transition-[width] duration-150"
              :style="{ width: pct(hud.player) }"
            ></div>
          </div>
          <div class="mt-1 h-1 w-2/3 overflow-hidden rounded-sm bg-black/60">
            <div
              data-testid="guard-player"
              class="h-full bg-sky-200/80 transition-[width] duration-150"
              :class="hud.player.combat === 'guardbreak' ? 'bg-amber-300' : ''"
              :style="{ width: guardPct(hud.player) }"
            ></div>
          </div>
        </div>
        <div v-if="hud.dummy" class="flex-1">
          <div class="mb-1 flex justify-between text-[11px] font-semibold tracking-widest">
            <span class="font-mono text-rose-200/80">{{ hud.dummy.hp }}</span>
            <span class="text-rose-300">TRAINING DUMMY</span>
          </div>
          <div
            class="flex h-2.5 justify-end overflow-hidden rounded-sm border border-rose-900/70 bg-black/60"
          >
            <div
              data-testid="hp-dummy"
              class="h-full bg-gradient-to-l from-rose-500 to-rose-300 transition-[width] duration-150"
              :style="{ width: pct(hud.dummy) }"
            ></div>
          </div>
          <div
            class="mt-1 ml-auto flex h-1 w-2/3 justify-end overflow-hidden rounded-sm bg-black/60"
          >
            <div
              data-testid="guard-dummy"
              class="h-full bg-rose-100/80 transition-[width] duration-150"
              :class="hud.dummy.combat === 'guardbreak' ? 'bg-amber-300' : ''"
              :style="{ width: guardPct(hud.dummy) }"
            ></div>
          </div>
        </div>
      </div>

      <div
        v-if="loadout"
        data-testid="loadout"
        class="pointer-events-none absolute left-3 top-[3.4rem] flex flex-wrap items-center gap-1.5 text-[10px] font-semibold tracking-wider"
      >
        <span class="rounded bg-black/50 px-1.5 py-0.5 text-cyan-200/90"
          >ATK {{ bonus(loadout.stats.damage) }}</span
        >
        <span class="rounded bg-black/50 px-1.5 py-0.5 text-cyan-200/90"
          >HP {{ loadout.maxHp }}</span
        >
        <span class="rounded bg-black/50 px-1.5 py-0.5 text-cyan-200/90"
          >GUARD {{ loadout.maxGuard }}</span
        >
        <span
          v-for="a in loadout.abilities"
          :key="a.slug"
          class="rounded px-1.5 py-0.5"
          :class="a.unlocked ? 'bg-cyan-500/20 text-cyan-200' : 'bg-black/40 text-slate-500'"
          :title="
            a.unlocked
              ? a.live
                ? 'Unlocked'
                : 'Unlocked — coming soon'
              : `Needs ${a.skill} ${a.level}`
          "
          >{{ a.name }}{{ a.unlocked ? '' : ` · ${a.skill} ${a.level}` }}</span
        >
      </div>

      <div
        v-if="hud.combo >= 2"
        data-testid="combo"
        class="pointer-events-none absolute left-4 top-1/3 text-3xl font-black italic tracking-wide text-amber-300 drop-shadow-[0_0_12px_rgba(251,191,36,0.6)]"
      >
        {{ hud.combo }} HITS
      </div>

      <div
        class="pointer-events-none absolute left-3 top-[5.2rem] rounded-lg border border-cyan-900/60 bg-black/50 px-3 py-1.5 font-mono text-[11px] leading-5 text-cyan-200/90 backdrop-blur-sm"
      >
        <div data-testid="arena-pos">
          pos {{ fmt(hud.player.pos.x) }} {{ fmt(hud.player.pos.y) }} {{ fmt(hud.player.pos.z) }}
        </div>
        <div data-testid="arena-motion">
          {{ motion(hud.player) }}<span v-if="testMode"> · tick {{ hud.tick }}</span>
        </div>
      </div>

      <div
        class="pointer-events-none absolute inset-x-3 bottom-3 mx-auto max-w-max rounded-2xl border border-cyan-900/60 bg-black/50 px-4 py-1.5 text-center text-xs leading-5 text-slate-300 backdrop-blur-sm"
      >
        <span class="font-mono text-cyan-300">Click</span> to look around (Esc lets go) ·
        <span class="font-mono text-cyan-300">WASD</span> move ·
        <span class="font-mono text-cyan-300">Shift</span> sprint ·
        <span class="font-mono text-cyan-300">Space</span> jump, again = double jump ·
        <span class="font-mono text-cyan-300">C</span> dash ·
        <span class="font-mono text-cyan-300">Left click</span> punch (×3 = jab, cross, uppercut) ·
        <span class="font-mono text-cyan-300">Right click</span> heavy ·
        <span class="font-mono text-cyan-300">F</span> guard (hold) ·
        <span class="font-mono text-cyan-300">T</span> emote
      </div>
    </template>
  </section>
</template>
