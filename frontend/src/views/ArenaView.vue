<script setup>
import { onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { useRoute } from 'vue-router'
import { createArena } from '@/arena/engine'

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

onMounted(async () => {
  try {
    const created = await createArena(host.value, {
      test: testMode,
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

// One decimal, a space where the minus sign would be so the columns don't jump,
// and never "-0.0".
// What the body is doing, in a word.
const motion = (p) =>
  p.wall ? 'wall' : !p.grounded ? 'airborne' : p.sprinting ? 'sprinting' : 'grounded'

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
      <div
        class="pointer-events-none absolute left-3 top-3 rounded-lg border border-cyan-900/60 bg-black/50 px-3 py-2 font-mono text-[11px] leading-5 text-cyan-200/90 backdrop-blur-sm"
      >
        <div class="font-sans text-xs font-semibold tracking-widest text-cyan-300">
          TRAINING HALL
        </div>
        <div data-testid="arena-pos">
          pos {{ fmt(hud.player.pos.x) }} {{ fmt(hud.player.pos.y) }} {{ fmt(hud.player.pos.z) }}
        </div>
        <div data-testid="arena-motion">
          {{ motion(hud.player) }}<span v-if="testMode"> · tick {{ hud.tick }}</span>
        </div>
      </div>
      <div
        class="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-cyan-900/60 bg-black/50 px-4 py-1.5 text-xs text-slate-300 backdrop-blur-sm"
      >
        <span class="font-mono text-cyan-300">WASD</span> move ·
        <span class="font-mono text-cyan-300">Shift</span> sprint ·
        <span class="font-mono text-cyan-300">Space</span> jump · in the air, push into a wall to
        cling
      </div>
    </template>
  </section>
</template>
