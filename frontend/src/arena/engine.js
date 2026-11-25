// The engine: renderer, scene, camera, the frame loop, resize, dispose, and the
// test hook. It wraps the headless simulation (sim.js) and only ever *reads* it to
// draw; every change to the game happens inside sim.step().
//
// Two ways to drive it:
//   real time  — requestAnimationFrame feeds real elapsed time into a fixed-step
//                clock; the keyboard drives the controls.
//   test mode  — (?test=1) nothing advances on its own. A test calls
//                window.__arena.step(ms) and gets exactly round(ms / 16.67) steps.
//                The keyboard is ignored. Frames are still drawn, so a screenshot
//                shows the state the test just produced.
import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'

import defaultRoom from './rooms/training-hall.js'
import { buildRoomScene } from './world.js'
import { createSimulation } from './sim.js'
import { createCapsuleFigure, createHunterFigure, setShadowBlocks } from './figure.js'
import { createKeyboard } from './input.js'
import { createFixedStep, stepsFor, STEP_S } from './loop.js'

// The locked third-person camera: behind and above the player, looking at the
// chest. Orbit-with-mouse is an open question (playbook §9).
export const CAMERA = {
  distance: 7.5,
  height: 4.2,
  lookHeight: 0.8,
  fov: 55,
  wallMargin: 1.8, // keep the camera this far from walls: close neon strips glare
  belowTop: 1.2, // and this far below the top of the walls
  followY: 6, // how quickly the camera follows a jump (1/s); lower = calmer
}

// Bloom: subtle. Raise `strength` for more glow, lower `threshold` to make more
// of the room glow.
export const BLOOM = { strength: 0.55, radius: 0.45, threshold: 0.22 }

// How often the Vue HUD is told about the game. Vue never runs inside the frame loop.
const HUD_INTERVAL_MS = 200

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
  // --- renderer -------------------------------------------------------------
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.0
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
  scene.fog = new THREE.FogExp2(room.colors.background, 0.03)
  const roomScene = buildRoomScene(room)
  scene.add(roomScene)

  setShadowBlocks(room.blocks)
  let figure
  try {
    figure = await createHunterFigure({ edge: room.colors.trim })
  } catch (e) {
    // The game still works without the model: fall back to M1's capsule.
    console.warn('[arena] hunter model failed to load, using the capsule', e)
    figure = createCapsuleFigure({ edge: room.colors.trim })
  }
  scene.add(figure.object)

  const camera = new THREE.PerspectiveCamera(CAMERA.fov, 1, 0.1, 120)

  // Post-processing. The composer renders into its own target, which has no
  // anti-aliasing unless asked for: without `samples`, every thin bright edge
  // crawled and flickered as the camera moved. 4x MSAA fixes it.
  const target = new THREE.WebGLRenderTarget(1, 1, { samples: 4, type: THREE.HalfFloatType })
  const composer = new EffectComposer(renderer, target)
  composer.addPass(new RenderPass(scene, camera))
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(256, 256),
    BLOOM.strength,
    BLOOM.radius,
    BLOOM.threshold,
  )
  composer.addPass(bloom)
  composer.addPass(new OutputPass())

  function resize() {
    const w = Math.max(1, container.clientWidth)
    const h = Math.max(1, container.clientHeight)
    renderer.setSize(w, h, false)
    composer.setPixelRatio(renderer.getPixelRatio())
    composer.setSize(w, h)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
  }
  // Observe the container, not the window: the page lives inside the app's layout.
  const resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(container)
  resize()

  // --- simulation -----------------------------------------------------------
  const sim = createSimulation(room, { seed })
  const keyboard = test ? null : createKeyboard(window)
  const clock = createFixedStep()

  // Positions at the previous and current step, so rendering can interpolate
  // between them when the monitor's refresh rate is not exactly 60 Hz.
  const yawOf = (f) => Math.atan2(f.x, f.z)
  const prev = { ...sim.player.state.pos, yaw: yawOf(sim.player.state.facing) }
  const curr = { ...prev }
  function remember(into) {
    const p = sim.player.state
    into.x = p.pos.x
    into.y = p.pos.y
    into.z = p.pos.z
    into.yaw = yawOf(p.facing)
  }

  function stepOnce() {
    remember(prev)
    sim.step()
    remember(curr)
  }

  // --- camera ---------------------------------------------------------------
  const look = new THREE.Vector3()
  const lerpAngle = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t
  const inner = { x: room.width / 2 - CAMERA.wallMargin, z: room.depth / 2 - CAMERA.wallMargin }
  let camY = null // smoothed height the camera follows

  // dt: real seconds since the last frame, for the render-only smoothing and the
  // animations. 0 = snap (tests, first frame).
  function draw(alpha, dt) {
    const pos = {
      x: prev.x + (curr.x - prev.x) * alpha,
      y: prev.y + (curr.y - prev.y) * alpha,
      z: prev.z + (curr.z - prev.z) * alpha,
    }
    figure.place(pos, lerpAngle(prev.yaw, curr.yaw, alpha))
    figure.update(sim.player.state, dt)

    // Follow jumps smoothly: the camera eases to the new height instead of
    // bobbing with every hop.
    camY =
      camY === null || dt === 0 ? pos.y : camY + (pos.y - camY) * Math.min(1, dt * CAMERA.followY)
    look.set(pos.x, camY + CAMERA.lookHeight, pos.z)
    // Locked follow, kept inside the walls: with the player backed against the
    // near wall the camera moves in closer instead of ending up outside the room.
    camera.position.set(
      Math.max(-inner.x, Math.min(inner.x, pos.x)),
      Math.min(camY + CAMERA.height, room.wallHeight - CAMERA.belowTop),
      Math.max(-inner.z, Math.min(inner.z, pos.z + CAMERA.distance)),
    )
    camera.lookAt(look)
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
    const delta = Math.min(now - last, 100)
    last = now
    if (test) {
      // Test mode: draw the current state, never advance it. The ambient dust
      // is frozen at the simulation's time, so screenshots are reproducible.
      roomScene.userData.update(sim.state().time)
      draw(1, 0)
    } else {
      const steps = clock.advance(delta)
      // Read the keys only when the simulation will actually step, so a quick
      // tap on a fast monitor (frames with no step) is not read and lost.
      if (steps > 0) sim.setInput(keyboard.controls())
      for (let i = 0; i < steps; i++) stepOnce()
      roomScene.userData.update(now / 1000)
      draw(clock.alpha(), delta / 1000)
    }
    pushHud(now)
  }
  raf = requestAnimationFrame(frame)
  draw(1, 0)
  pushHud(performance.now(), true)

  // --- test hook --------------------------------------------------------------
  // Exposed as window.__arena by ArenaView when the page is opened with ?test=1.
  // Shape agreed in arena-playbook §2.
  const FUTURE_ACTIONS = ['attack', 'dodge', 'block']
  const testHook = {
    ready: true,
    figure: figure.kind,
    // Advance exactly round(ms / 16.67) fixed steps, draw, and return the state.
    // Animations advance step by step too, so a screenshot shows the right pose.
    step(ms) {
      const n = stepsFor(ms)
      for (let i = 0; i < n; i++) {
        stepOnce()
        figure.update(sim.player.state, STEP_S)
      }
      roomScene.userData.update(sim.state().time)
      draw(1, 0)
      pushHud(performance.now(), true)
      return sim.state()
    },
    state: () => sim.state(),
    // Controls, held until changed: { x, y, sprint, jump } (x = right, y = forward,
    // each -1..1; only the fields given change). 'jump' = one full jump.
    // 'stop' = let go of everything. Combat actions arrive with the fighter kit.
    input(action) {
      if (action === 'stop') {
        sim.setInput({ x: 0, y: 0, sprint: false, jump: false })
        return { accepted: true }
      }
      if (action === 'jump') {
        sim.press('jump')
        return { accepted: true }
      }
      if (action && typeof action === 'object') {
        sim.setInput(action)
        return { accepted: true }
      }
      if (FUTURE_ACTIONS.includes(action) || String(action).startsWith('ability:')) {
        return { accepted: false, reason: 'combat actions arrive with the fighter kit' }
      }
      throw new Error(`Unknown arena input: ${JSON.stringify(action)}`)
    },
    seed: (n) => sim.seed(n),
    snapshot: () => sim.snapshot(),
    restore(snap) {
      sim.restore(snap)
      remember(prev)
      remember(curr)
      draw(1, 0)
      return sim.state()
    },
    // Place the player anywhere (e.g. high up, to test falling). Clears velocity.
    teleport(pos) {
      sim.teleport(pos)
      remember(prev)
      remember(curr)
      draw(1, 0)
      return sim.state()
    },
    // Proof that something was actually drawn: renders a frame and reads it back in
    // the same task (so no preserveDrawingBuffer needed). Returns the share of
    // pixels that are lit at all, and the share that are neon cyan.
    pixels() {
      draw(1, 0)
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
        if (g > 90 && b > 90 && r < g * 0.7) cyan++
      }
      return { width: w, height: h, lit: lit / total, cyan: cyan / total }
    },
    // Rendering numbers for the performance budget (playbook §6), and which
    // animation clip the hunter is playing.
    debug: () => ({
      figure: figure.kind,
      clip: figure.current?.() ?? null,
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
    figure.dispose?.()
    disposeTree(scene)
    bloom.dispose()
    composer.dispose()
    target.dispose()
    renderer.dispose()
    renderer.forceContextLoss()
    renderer.domElement.remove()
    sim.dispose()
  }

  return { testHook, dispose, state: () => sim.state() }
}
