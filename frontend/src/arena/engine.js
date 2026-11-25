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

import { DEFAULT_ROOM as defaultRoom } from './rooms/index.js'
import { buildRoomScene, loadRoomDressing } from './world.js'
import { createSimulation } from './sim.js'
import {
  createCapsuleFigure,
  createHunterFigure,
  loadHunterAsset,
  setShadowBlocks,
} from './figure.js'
import { createEffects } from './effects.js'
import { createControls } from './input.js'
import { createShield } from './shield.js'
import { createBolts } from './bolts.js'
import { createParticles } from './particles.js'
import { attachKatana } from './katana.js'
import { MOVES } from './moves.js'
import { FOOT_OFFSET } from './player.js'
import { createFixedStep, stepsFor, STEP_S } from './loop.js'

// A steady third-person camera (Morrison, 25 Nov: "fixed again"): behind and
// above the player at a fixed 25°, a half top-down view. The mouse only turns
// it left and right (smoothed, so it never jerks); the wheel zooms. Near a wall
// it slides in along its own line instead of being pinned. The stick is always
// relative to where the camera looks.
export const CAMERA = {
  distance: 9, // metres, horizontally, behind what it looks at
  pitch: 0.436, // radians above horizontal: 25°, fixed (the mouse does not tilt it)
  minPitch: -0.35, // a little below the player, looking up
  maxPitch: 1.35, // almost straight down
  minDistance: 4,
  maxDistance: 14,
  sensitivity: 0.0022, // radians per pixel of mouse movement (left / right only)
  yawEase: 14, // how quickly the view catches up with the mouse (1/s)
  zoomStep: 0.8, // metres per wheel notch
  lookHeight: 0.8,
  fov: 55,
  wallMargin: 0.6, // the camera stops this far from a wall (it slides in along its line)
  minHeight: 0.35, // and this far above the floor
  followY: 8, // how quickly the camera follows a jump (1/s); lower = calmer
}

// Bloom: subtle. Raise `strength` for more glow, lower `threshold` to make more
// of the room glow.
export const BLOOM = { strength: 0.45, radius: 0.4, threshold: 0.85 }

// How often the Vue HUD is told about the game. Vue never runs inside the frame loop.
const HUD_INTERVAL_MS = 100

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
  {
    room = defaultRoom,
    test = false,
    seed = 1,
    dummy = 'auto',
    loadout = undefined, // the player's stats + abilities from the server (stores/arena.js)
    boss = null, // a boss slug to put in the room (if the server says you may face it)
    onHud = () => {},
    onBossDefeated = () => {}, // ({ boss, ms }) once, when the boss falls
  } = {},
) {
  // --- renderer -------------------------------------------------------------
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  if (room.shadows) {
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
  }
  renderer.toneMappingExposure = room.exposure ?? 1.0
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
  scene.fog = new THREE.FogExp2(room.colors.fog ?? room.colors.background, room.fogDensity ?? 0.025)
  const roomScene = buildRoomScene(room)
  scene.add(roomScene)
  const effects = createEffects(scene)
  const bolts = createBolts(scene)
  const fx = createParticles(scene)

  // --- simulation -----------------------------------------------------------
  const sim = createSimulation(room, {
    seed,
    dummy: boss && dummy === 'auto' ? 'idle' : dummy,
    loadout,
    boss,
  })
  // Keyboard on the window, mouse on the canvas (pointer lock needs an element).
  const keyboard = test ? null : createControls(window, renderer.domElement)
  const clock = createFixedStep()

  // --- fighters' looks: one model, a clone per fighter -------------------------
  setShadowBlocks(room.blocks)
  // The hunter and the room's kit load in parallel. Either may fail without
  // stopping the game: capsules instead of the hunter, the bare room instead of
  // the kit.
  const [hunter, dressing] = await Promise.allSettled([loadHunterAsset(), loadRoomDressing(room)])
  const gltf = hunter.status === 'fulfilled' ? hunter.value : null
  if (!gltf) console.warn('[arena] hunter model failed to load, using capsules', hunter.reason)
  if (dressing.status === 'fulfilled') scene.add(dressing.value)
  else console.warn('[arena] room kit failed to load, using the bare room', dressing.reason)
  const figures = sim.fighters.map((f) => {
    const isDummy = f.id === 'dummy'
    const isBoss = f.id === 'boss'
    const edge = isDummy || isBoss ? room.colors.enemy : room.colors.trim
    const fig = gltf
      ? createHunterFigure(gltf, {
          edge,
          palette: isBoss ? 'shadow' : isDummy ? 'enemy' : 'hero',
          scale: isBoss ? 1.12 : 1,
        })
      : createCapsuleFigure({ edge })
    // The Shadow Knight carries a katana (built in code, see katana.js).
    if (isBoss && fig.kind === 'hunter') attachKatana(fig.object)
    if (room.shadows) {
      // Real shadows here: the fighters cast them, and the blob is not needed.
      fig.object.traverse((o) => {
        if (o.isMesh) o.castShadow = true
        if (o.name === 'player-shadow') o.visible = false
      })
    }
    scene.add(fig.object)
    return fig
  })
  // A guard shield per fighter, in their own colour.
  const shields = sim.fighters.map((f) => {
    const sh = createShield(f.id === 'player' ? room.colors.trim : room.colors.enemy)
    scene.add(sh.object)
    return sh
  })
  const fighterIndex = Object.fromEntries(sim.fighters.map((f, i) => [f.id, i]))

  const camera = new THREE.PerspectiveCamera(CAMERA.fov, 1, 0.1, room.far ?? 140)

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
    room.bloomThreshold ?? BLOOM.threshold,
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

  // Positions at the previous and current step, per fighter, so rendering can
  // interpolate between them when the monitor is not exactly 60 Hz.
  const yawOf = (f) => Math.atan2(f.x, f.z)
  const read = (f) => ({ ...f.body.state.pos, yaw: yawOf(f.body.state.facing) })
  const prev = sim.fighters.map(read)
  const curr = sim.fighters.map(read)
  function remember(into) {
    sim.fighters.forEach((f, i) => Object.assign(into[i], read(f)))
  }

  // Events since the last frame (several steps can run per frame).
  let pending = []
  // The last combo the player landed, timed in simulation ticks so it behaves
  // the same in real time and under a test.
  let combo = { n: 0, tick: -Infinity }
  const COMBO_SHOW_TICKS = 84 // 1.4 s
  function stepOnce() {
    remember(prev)
    sim.step()
    remember(curr)
    const ev = sim.state().events
    if (ev.length) {
      pending.push(...ev)
      for (const e of ev) {
        if (e.attacker === 'player' && e.combo >= 2) combo = { n: e.combo, tick: e.tick }
      }
    }
  }
  // The fighters' states in the same order as sim.fighters / figures.
  function statesOf(st) {
    const out = [st.player]
    if (st.dummy) out.push(st.dummy)
    if (st.boss) out.push(st.boss)
    return out
  }

  let bossDone = false
  function flushEvents() {
    for (const e of pending) {
      effects.spawn(e)
      if (e.type === 'block') shields[fighterIndex[e.target]]?.hit()
      vfxEvent(e)
      if (e.type === 'boss-defeated' && !bossDone) {
        bossDone = true
        onBossDefeated({ boss: e.boss, ms: e.ms })
      }
    }
    pending = []
  }

  // --- VFX: particles from events and from what the fighters are doing --------
  const SHADOW_MOVES = new Set(['KNIGHT_RUSH', 'KNIGHT_SLASH', 'SHADOW_SLASH'])
  function vfxEvent(e) {
    if (e.type === 'fizzle') return fx.explosion(e)
    if (e.type === 'boss-defeated') {
      const b = sim.state().boss
      if (b) {
        fx.impact({ x: b.pos.x, y: b.pos.y, z: b.pos.z, color: '#9b7bff', heavy: true })
        for (let i = 0; i < 40; i++)
          fx.darkWisp({ x: b.pos.x, y: b.pos.y - 1, z: b.pos.z, strength: 2 })
      }
      return
    }
    if (e.x === undefined) return
    const shadow = SHADOW_MOVES.has(e.move)
    const color = e.fire
      ? '#ff9a4a'
      : shadow
        ? '#a58bff'
        : e.attacker === 'player'
          ? '#ffd27a'
          : '#ff7a8a'
    if (e.type === 'block') fx.block({ ...e, color: '#7fe9ff' })
    else if (e.type === 'guardbreak') fx.guardBreak(e)
    else if (e.fire) fx.explosion(e)
    else fx.impact({ ...e, color, heavy: e.heavy || e.type === 'ko' || shadow })
  }

  // Per fighter: what it was doing last frame, to spot landings and new rolls.
  const seen = sim.fighters.map(() => ({ grounded: true, vy: 0, combat: 'free', t: 0 }))
  function vfxFrame(dt) {
    if (dt <= 0) return
    const st = sim.state()
    statesOf(st).forEach((p, i) => {
      const was = seen[i]
      const feet = p.pos.y - FOOT_OFFSET
      // Landing: dust, more for a harder fall.
      if (p.grounded && !was.grounded && was.vy < -5)
        fx.dust({ x: p.pos.x, y: feet, z: p.pos.z, strength: Math.min(1.6, (-was.vy - 4) / 9) })
      // Rolling and rushing kick up dust behind them.
      was.t += dt
      const rushing =
        p.combat === 'attack' && MOVES[p.move]?.rush && p.moveFrame > MOVES[p.move].startup
      if ((p.combat === 'dash' || rushing) && was.t > 0.035) {
        was.t = 0
        fx.puff({ x: p.pos.x, y: feet + 0.2, z: p.pos.z })
        if (rushing && SHADOW_MOVES.has(p.move))
          for (let k = 0; k < 3; k++)
            fx.darkWisp({ x: p.pos.x, y: feet, z: p.pos.z, strength: 1.3 })
      }
      if (p.combat === 'dash' && was.combat !== 'dash')
        fx.dust({ x: p.pos.x, y: feet, z: p.pos.z, strength: 0.6 })
      // The Shadow Knight: a constant dark aura; charging the rush, runes on the
      // floor and the aura boiling up.
      if (sim.fighters[i].id === 'boss' && p.combat !== 'ko') {
        const charging =
          p.combat === 'attack' &&
          p.move === 'KNIGHT_RUSH' &&
          p.moveFrame <= MOVES.KNIGHT_RUSH.startup
        const n = charging ? 5 : 1.2
        for (let k = 0; k < n * dt * 30; k++)
          fx.darkWisp({ x: p.pos.x, y: feet, z: p.pos.z, strength: charging ? 1.8 : 1 })
        if (charging)
          fx.runes({ x: p.pos.x, z: p.pos.z, t: p.moveFrame / MOVES.KNIGHT_RUSH.startup })
      }
      // Your Shadow slash charging: a smaller violet glow.
      if (
        p.combat === 'attack' &&
        p.move === 'SHADOW_SLASH' &&
        p.moveFrame <= MOVES.SHADOW_SLASH.startup
      )
        for (let k = 0; k < 2; k++)
          fx.sparkle({ x: p.pos.x, y: p.pos.y, z: p.pos.z, color: '#a58bff' })
      was.grounded = p.grounded
      was.vy = p.vel.y
      was.combat = p.combat
    })
    // Fire bolts leave a trail of flame.
    for (const pr of st.projectiles)
      if (pr.kind === 'fire_bolt') for (let k = 0; k < 2; k++) fx.fireTrail(pr)
    fx.update(dt)
  }

  // --- camera ---------------------------------------------------------------
  const look = new THREE.Vector3()
  const lerpAngle = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t
  const inner = { x: room.width / 2 - CAMERA.wallMargin, z: room.depth / 2 - CAMERA.wallMargin }
  let camY = null // smoothed height the camera follows
  // Mouse-controlled orbit. yaw 0 = looking towards -z.
  const view = { yaw: 0, pitch: CAMERA.pitch, distance: CAMERA.distance }
  const camDir = { x: 0, z: -1 } // horizontal look direction, from yaw
  let yawTarget = 0 // where the mouse wants the view; view.yaw eases towards it
  function setView(yaw, pitch, distance) {
    view.yaw = yaw
    view.pitch = Math.max(CAMERA.minPitch, Math.min(CAMERA.maxPitch, pitch))
    view.distance = Math.max(CAMERA.minDistance, Math.min(CAMERA.maxDistance, distance))
    camDir.x = -Math.sin(view.yaw)
    camDir.z = -Math.cos(view.yaw)
  }
  let elapsed = 0

  // dt: real seconds since the last frame, for render-only smoothing and effects.
  // 0 = snap (tests, first frame).
  function draw(alpha, dt) {
    const pos = sim.fighters.map((_, i) => ({
      x: prev[i].x + (curr[i].x - prev[i].x) * alpha,
      y: prev[i].y + (curr[i].y - prev[i].y) * alpha,
      z: prev[i].z + (curr[i].z - prev[i].z) * alpha,
    }))
    figures.forEach((fig, i) => fig.place(pos[i], lerpAngle(prev[i].yaw, curr[i].yaw, alpha)))
    const st = sim.state()
    const states = statesOf(st)
    shields.forEach((sh, i) => sh.update(states[i], pos[i], dt))
    bolts.sync(st.projectiles)
    effects.update(dt)
    elapsed += dt
    bolts.update(dt, elapsed)
    vfxFrame(dt)

    const me = pos[0]
    camY =
      camY === null || dt === 0 ? me.y : camY + (me.y - camY) * Math.min(1, dt * CAMERA.followY)
    // An orbit round the player, exactly where the mouse put it.
    look.set(me.x, camY + CAMERA.lookHeight, me.z)
    const cp = Math.cos(view.pitch)
    const dx = -camDir.x * cp
    const dy = Math.sin(view.pitch)
    const dz = -camDir.z * cp
    // Walls, floor and ceiling: shorten the boom so the camera stays inside.
    let boom = view.distance
    const fit = (from, d, lo, hi) => {
      if (d > 1e-6 && from + d * boom > hi) boom = Math.max(0.5, (hi - from) / d)
      if (d < -1e-6 && from + d * boom < lo) boom = Math.max(0.5, (lo - from) / d)
    }
    fit(look.x, dx, -inner.x, inner.x)
    fit(look.z, dz, -inner.z, inner.z)
    fit(look.y, dy, CAMERA.minHeight, room.wallHeight - 0.3)
    const shake = effects.shakeOffset(elapsed)
    camera.position.set(
      look.x + dx * boom + shake.x,
      look.y + dy * boom + shake.y,
      look.z + dz * boom,
    )
    camera.lookAt(look)
    renderer.info.reset()
    composer.render()
  }

  // Within this distance fighters take their fight stance instead of idling.
  const STANCE_RANGE = 6
  function animate(dt) {
    const st = sim.state()
    let near = false
    if (st.dummy) {
      const dx = st.dummy.pos.x - st.player.pos.x
      const dz = st.dummy.pos.z - st.player.pos.z
      near = dx * dx + dz * dz < STANCE_RANGE * STANCE_RANGE && st.dummy.combat !== 'ko'
    }
    if (st.boss && st.boss.combat !== 'ko') {
      const dx = st.boss.pos.x - st.player.pos.x
      const dz = st.boss.pos.z - st.player.pos.z
      near = near || dx * dx + dz * dz < (STANCE_RANGE + 4) ** 2
    }
    const states = statesOf(st)
    figures.forEach((fig, i) => fig.update(states[i], dt, { near: i === 0 ? near : true }))
  }

  // --- HUD ------------------------------------------------------------------
  let lastHud = -Infinity
  function pushHud(now, force = false) {
    if (!force && now - lastHud < HUD_INTERVAL_MS) return
    lastHud = now
    const st = sim.state()
    onHud({ ...st, combo: st.tick - combo.tick < COMBO_SHOW_TICKS ? combo.n : 0 })
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
      roomScene.userData.update(sim.state().time, curr)
      draw(1, 0)
    } else {
      const steps = clock.advance(delta)
      // Read the keys only when the simulation will actually step, so a quick
      // tap on a fast monitor (frames with no step) is not read and lost.
      const m = keyboard.look()
      yawTarget -= m.dx * CAMERA.sensitivity
      const ease = Math.min(1, (delta / 1000) * CAMERA.yawEase)
      setView(
        view.yaw + (yawTarget - view.yaw) * ease,
        CAMERA.pitch,
        view.distance + m.wheel * CAMERA.zoomStep,
      )
      if (steps > 0) sim.setInput({ ...keyboard.controls(), view: { ...camDir } })
      for (let i = 0; i < steps; i++) stepOnce()
      flushEvents()
      animate(delta / 1000)
      roomScene.userData.update(now / 1000, curr)
      draw(clock.alpha(), delta / 1000)
    }
    pushHud(now)
  }
  raf = requestAnimationFrame(frame)
  animate(STEP_S)
  draw(1, 0)
  pushHud(performance.now(), true)

  // --- test hook --------------------------------------------------------------
  // Exposed as window.__arena by ArenaView when the page is opened with ?test=1.
  // Shape agreed in arena-playbook §2.
  const BUTTONS = ['jump', 'light', 'heavy', 'dash', 'ability1', 'ability2', 'ability3', 'emote']
  const testHook = {
    ready: true,
    figure: figures[0].kind,
    // Advance exactly round(ms / 16.67) fixed steps, draw, and return the state.
    // Animations and effects advance step by step too, so a screenshot shows
    // the right pose.
    step(ms) {
      const n = stepsFor(ms)
      for (let i = 0; i < n; i++) {
        stepOnce()
        flushEvents()
        animate(STEP_S)
        effects.update(STEP_S)
        vfxFrame(STEP_S)
      }
      roomScene.userData.update(sim.state().time, curr)
      draw(1, 0)
      pushHud(performance.now(), true)
      return sim.state()
    },
    state: () => sim.state(),
    // Controls, held until changed: { x, y, sprint, jump, light, heavy, block, dash }
    // (x = right, y = forward, each -1..1; only the fields given change).
    // A button name ('jump', 'light', 'heavy', 'dash', 'ability1'-'ability3', or
    // 'ability:1'-'ability:3') = one tap on the next step.
    // 'stop' = let go of everything.
    input(action) {
      if (action === 'stop') {
        sim.setInput({
          x: 0,
          y: 0,
          sprint: false,
          crouch: false,
          jump: false,
          light: false,
          heavy: false,
          block: false,
          dash: false,
          ability1: false,
          ability2: false,
          ability3: false,
        })
        return { accepted: true }
      }
      if (BUTTONS.includes(action)) {
        sim.press(action)
        return { accepted: true }
      }
      if (action && typeof action === 'object') {
        sim.setInput(action)
        return { accepted: true }
      }
      // 'ability:1' (the playbook's spelling) = 'ability1'
      const ab = /^ability:([123])$/.exec(String(action))
      if (ab) {
        sim.press(`ability${ab[1]}`)
        return { accepted: true }
      }
      throw new Error(`Unknown arena input: ${JSON.stringify(action)}`)
    },
    seed: (n) => sim.seed(n),
    dummy: (mode) => sim.setDummyMode(mode),
    // Tests only: nothing hits the player for this many frames.
    invuln(frames) {
      sim.fighters[0].c.invuln = frames
    },
    // Tests only: set the boss's health (to finish a fight quickly).
    bossHp(hp) {
      const b = sim.fighters.find((f) => f.id === 'boss')
      if (b) b.c.hp = Math.max(1, Math.min(b.c.maxHp, hp))
    },
    // Point the camera: yaw/pitch in degrees (yaw 0 = looking towards -z), distance
    // in metres. The stick follows it, as with the mouse.
    camera({ yaw = 0, pitch = (CAMERA.pitch * 180) / Math.PI, distance = CAMERA.distance } = {}) {
      setView((yaw * Math.PI) / 180, (pitch * Math.PI) / 180, distance)
      yawTarget = view.yaw
      sim.setInput({ view: { ...camDir } })
      draw(1, 0)
      return { ...camDir }
    },
    snapshot: () => sim.snapshot(),
    restore(snap) {
      sim.restore(snap)
      remember(prev)
      remember(curr)
      draw(1, 0)
      return sim.state()
    },
    // Place the player (or the dummy) anywhere. Clears velocity.
    teleport(pos, who = 'player') {
      if (who === 'dummy') sim.teleportDummy(pos)
      else if (who === 'boss') sim.teleportBoss(pos)
      else sim.teleport(pos)
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
    // animation clip each fighter is showing.
    debug: () => ({
      figure: figures[0].kind,
      clip: figures[0].current?.() ?? null,
      dummyClip: figures[1]?.current?.() ?? null,
      shield: shields.map((sh) => sh.size()),
      sparks: effects.count(),
      particles: fx.count(),
      bolts: bolts.count(),
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
    for (const fig of figures) fig.dispose?.()
    for (const sh of shields) sh.dispose()
    effects.dispose()
    bolts.dispose()
    fx.dispose()
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
