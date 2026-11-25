// The engine: renderer, scene, camera, the frame loop, resize, dispose, and the
// test hook. It wraps the headless simulation (sim.js) and only ever *reads* it to
// draw; every change to the game happens inside sim.step().
//
// Two ways to drive it:
//   real time  — requestAnimationFrame feeds real elapsed time into a fixed-step
//                clock; the keyboard sets the stick.
//   test mode  — (?test=1) nothing advances on its own. A test calls
//                window.__arena.step(ms) and gets exactly round(ms / 16.67) steps.
//                The keyboard is ignored. Frames are still drawn, so a screenshot
//                shows the state the test just produced.
import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'

import defaultRoom from './rooms/training-hall.js'
import { buildRoomScene } from './world.js'
import { createSimulation } from './sim.js'
import { createCapsuleFigure } from './figure.js'
import { createKeyboard } from './input.js'
import { createFixedStep, stepsFor } from './loop.js'

// The locked third-person camera: behind and above the player, looking at the
// chest. Orbit-with-mouse is an open question for M4 (playbook §9).
export const CAMERA = { distance: 7.5, height: 4.2, lookHeight: 0.6, fov: 55, wallMargin: 0.4 }

// How often the Vue HUD is told about the game. Vue never runs inside the frame loop.
const HUD_INTERVAL_MS = 200

// Rapier's wasm only needs initialising once per page, however many visits.
let rapierReady = null
export function initPhysics() {
  rapierReady ??= RAPIER.init()
  return rapierReady
}

// Every geometry, material and texture under `root`.
function disposeTree(root) {
  root.traverse((o) => {
    o.geometry?.dispose()
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []
    for (const m of mats) {
      for (const v of Object.values(m)) if (v?.isTexture) v.dispose()
      m.dispose()
    }
  })
}

export async function createArena(
  container,
  { room = defaultRoom, test = false, seed = 1, onHud = () => {} } = {},
) {
  await initPhysics()

  // --- renderer -------------------------------------------------------------
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.1
  renderer.domElement.style.display = 'block'
  renderer.domElement.style.width = '100%'
  renderer.domElement.style.height = '100%'
  renderer.domElement.dataset.arena = 'canvas'
  // Count draw calls for the whole frame (scene + bloom passes), not just the last
  // pass the composer happened to run. Reset by hand at the start of each draw.
  renderer.info.autoReset = false
  container.appendChild(renderer.domElement)

  // --- scene ----------------------------------------------------------------
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(room.colors.background)
  scene.fog = new THREE.FogExp2(room.colors.background, 0.035)
  scene.add(buildRoomScene(room))

  const figure = createCapsuleFigure({ edge: room.colors.trim })
  scene.add(figure.object)

  const camera = new THREE.PerspectiveCamera(CAMERA.fov, 1, 0.1, 120)

  // Bloom is what turns the bright trim into neon. Half-strength radius keeps it
  // from smearing the whole room.
  const composer = new EffectComposer(renderer)
  composer.addPass(new RenderPass(scene, camera))
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.7, 0.4, 0.32)
  composer.addPass(bloom)
  composer.addPass(new OutputPass())

  function resize() {
    const w = Math.max(1, container.clientWidth)
    const h = Math.max(1, container.clientHeight)
    renderer.setSize(w, h, false)
    composer.setSize(w, h)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
  }
  // Observe the container, not the window: the page lives inside the app's layout.
  const resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(container)
  resize()

  // --- simulation -----------------------------------------------------------
  const sim = createSimulation(RAPIER, room, { seed })
  const keyboard = test ? null : createKeyboard(window)
  const clock = createFixedStep()

  // Positions at the previous and current step, so rendering can interpolate
  // between them when the monitor's refresh rate is not exactly 60 Hz.
  const prev = { ...sim.player.state.pos, yaw: sim.player.state.yaw }
  const curr = { ...prev }
  function remember(into) {
    const p = sim.player.state
    into.x = p.pos.x
    into.y = p.pos.y
    into.z = p.pos.z
    into.yaw = p.yaw
  }

  function stepOnce() {
    remember(prev)
    sim.step()
    remember(curr)
  }

  // --- camera ---------------------------------------------------------------
  const target = new THREE.Vector3()
  const lerpAngle = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t
  const inner = { x: room.width / 2 - CAMERA.wallMargin, z: room.depth / 2 - CAMERA.wallMargin }

  function draw(alpha) {
    const pos = {
      x: prev.x + (curr.x - prev.x) * alpha,
      y: prev.y + (curr.y - prev.y) * alpha,
      z: prev.z + (curr.z - prev.z) * alpha,
    }
    figure.place(pos, lerpAngle(prev.yaw, curr.yaw, alpha))

    // Locked follow. The camera is kept inside the walls: with the player backed
    // against the near wall it moves in closer instead of ending up outside the
    // room looking at the back of a wall.
    target.set(pos.x, pos.y + CAMERA.lookHeight, pos.z)
    camera.position.set(
      Math.max(-inner.x, Math.min(inner.x, pos.x)),
      pos.y + CAMERA.height,
      Math.max(-inner.z, Math.min(inner.z, pos.z + CAMERA.distance)),
    )
    camera.lookAt(target)
    renderer.info.reset()
    composer.render()
  }

  // --- HUD ------------------------------------------------------------------
  let lastHud = -Infinity
  function pushHud(now, force = false) {
    if (!force && now - lastHud < HUD_INTERVAL_MS) return
    lastHud = now
    onHud(sim.state())
  }

  // --- loop -----------------------------------------------------------------
  let raf = 0
  let last = performance.now()
  let disposed = false

  function frame(now) {
    raf = requestAnimationFrame(frame)
    const delta = now - last
    last = now
    if (test) {
      draw(1) // test mode: show the current state, never advance it
    } else {
      const s = keyboard.stick()
      sim.setStick(s.x, s.y)
      const steps = clock.advance(delta)
      for (let i = 0; i < steps; i++) stepOnce()
      draw(clock.alpha())
    }
    pushHud(now)
  }
  raf = requestAnimationFrame(frame)
  draw(1)
  pushHud(performance.now(), true)

  // --- test hook --------------------------------------------------------------
  // Exposed as window.__arena by ArenaView when the page is opened with ?test=1.
  // Shape agreed in arena-playbook §2; M1 implements movement, the rest answers
  // honestly that it does not exist yet.
  const FUTURE_ACTIONS = ['attack', 'dodge']
  const testHook = {
    ready: true,
    // Advance exactly round(ms / 16.67) fixed steps, draw, and return the state.
    step(ms) {
      const n = stepsFor(ms)
      for (let i = 0; i < n; i++) stepOnce()
      draw(1)
      pushHud(performance.now(), true)
      return sim.state()
    },
    state: () => sim.state(),
    // A move vector {x, y} (x = right, y = forward, each -1..1), held until changed,
    // or 'stop'. Combat actions arrive in M4.
    input(action) {
      if (action === 'stop' || (action && typeof action === 'object')) {
        const move = action === 'stop' ? { x: 0, y: 0 } : action
        sim.setStick(move.x ?? 0, move.y ?? 0)
        return { accepted: true }
      }
      if (FUTURE_ACTIONS.includes(action) || String(action).startsWith('ability:')) {
        return { accepted: false, reason: 'combat actions arrive in M4' }
      }
      throw new Error(`Unknown arena input: ${JSON.stringify(action)}`)
    },
    seed: (n) => sim.seed(n),
    // Place the player anywhere (e.g. high up, to test falling). Clears velocity.
    teleport(pos) {
      sim.teleport(pos)
      remember(prev)
      remember(curr)
      draw(1)
      return sim.state()
    },
    // Proof that something was actually drawn: renders a frame and reads it back in
    // the same task (so no preserveDrawingBuffer needed). Returns the share of
    // pixels that are lit at all, and the share that are neon cyan.
    pixels() {
      draw(1)
      const gl = renderer.getContext()
      const w = gl.drawingBufferWidth
      const h = gl.drawingBufferHeight
      const buf = new Uint8Array(w * h * 4)
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf)
      let lit = 0
      let cyan = 0
      const total = w * h
      for (let i = 0; i < buf.length; i += 4) {
        const r = buf[i]
        const g = buf[i + 1]
        const b = buf[i + 2]
        if (r + g + b > 30) lit++
        if (g > 140 && b > 140 && r < g * 0.8) cyan++
      }
      return { width: w, height: h, lit: lit / total, cyan: cyan / total }
    },
    // Rendering numbers for the performance budget (playbook §6).
    debug: () => ({
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      geometries: renderer.info.memory.geometries,
      textures: renderer.info.memory.textures,
    }),
  }

  // --- dispose --------------------------------------------------------------
  // Leaving /arena must free everything, or each visit leaks a WebGL context.
  function dispose() {
    if (disposed) return
    disposed = true
    cancelAnimationFrame(raf)
    resizeObserver.disconnect()
    keyboard?.dispose()
    disposeTree(scene)
    bloom.dispose()
    composer.dispose()
    renderer.dispose()
    renderer.forceContextLoss()
    renderer.domElement.remove()
    sim.dispose()
  }

  return { testHook, dispose, state: () => sim.state() }
}
