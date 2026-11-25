// What the fighters look like. Render-only: nothing here feeds back into the
// simulation, so the model, its animations and every effect can change freely
// without touching determinism.
//
//   createHunterFigure()   the hunter: Morrison's VRoid character with his own
//                          textures, toon-shaded, animated from the simulation's
//                          state (docs/arena-assets.md).
//   createCapsuleFigure()  M1's capsule. Used if the model fails to load.
//
// Both return { object, place(pos, yaw), update(fighterState, dt), kind }.
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { FOOT_OFFSET, MOVE } from './player.js'
import { COMBAT, MOVES } from './moves.js'
import { ABILITIES } from './abilities.js'

export const HUNTER_URL = '/models/arena/hunter.glb'

// A soft round shadow texture, drawn once on a canvas. Far cheaper than a shadow
// map and it reads fine in a dark room (playbook §6).
function blobTexture(edge) {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(0,0,0,0.85)')
  g.addColorStop(0.6, 'rgba(0,0,0,0.45)')
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  // (No coloured contact ring any more: the lit floor shows the shadow fine.)
  void edge
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

// The blob shadow, shared by both figures. Sits on the floor under the player.
function createShadow(edge) {
  const mat = new THREE.MeshBasicMaterial({
    map: blobTexture(edge),
    transparent: true,
    depthWrite: false,
  })
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), mat)
  mesh.rotation.x = -Math.PI / 2
  mesh.renderOrder = 1
  mesh.name = 'player-shadow'
  return {
    mesh,
    // footY = the height the feet are at, groundY = the floor under them.
    place(rootY, footY, groundY = 0) {
      mesh.position.y = groundY - rootY + 0.015
      const k = 1 / (1 + Math.max(0, footY - groundY) * 0.6)
      mesh.scale.setScalar(k)
      mat.opacity = k
    },
  }
}

// --- M1 capsule (fallback) --------------------------------------------------

export function createCapsuleFigure({ edge = '#22d3ee' } = {}) {
  const root = new THREE.Group()
  root.name = 'player'
  const body = new THREE.Group()
  root.add(body)

  const geo = new THREE.CapsuleGeometry(MOVE.radius, MOVE.halfHeight * 2, 8, 24)
  body.add(
    new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({ color: '#05070d', roughness: 0.5, metalness: 0.3 }),
    ),
  )
  const hull = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({ color: edge, side: THREE.BackSide }),
  )
  hull.scale.setScalar(1.07)
  body.add(hull)
  const visor = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.07, 0.08),
    new THREE.MeshBasicMaterial({ color: edge }),
  )
  // Just outside the body's surface: any deeper and the body hides it.
  visor.position.set(0, MOVE.halfHeight + 0.05, MOVE.radius + 0.02)
  body.add(visor)

  const shadow = createShadow(edge)
  root.add(shadow.mesh)

  return {
    kind: 'capsule',
    object: root,
    // pos = capsule centre (as the simulation reports it), yaw = facing.
    place(pos, yaw) {
      root.position.set(pos.x, pos.y, pos.z)
      body.rotation.y = yaw
      shadow.place(pos.y, pos.y - FOOT_OFFSET, groundUnder(pos))
    },
    update() {},
  }
}

// --- the hunter --------------------------------------------------------------
// Morrison's VRoid hunter, rigged and animated on Mixamo, converted into one
// file with the VRoid textures put back (see docs/arena-assets.md). The textures
// are drawn with toon shading; the dummy gets the same body tinted crimson. The
// palettes below are only the fallback for a part without a texture.

export const PALETTES = {
  hero: {
    hair: '#343a4c',
    skin: '#f0d2bd',
    eye: '#2f8cff',
    coat: '#2b3242',
    coat2: '#3d4760',
    accent: '#17a9bd',
    pants: '#232836',
    shoes: '#161820',
  },
  enemy: {
    hair: '#4a2026',
    skin: '#e2bba5',
    eye: '#ff2d4b',
    coat: '#4a1e27',
    coat2: '#632a35',
    accent: '#e0435a',
    pants: '#2e161b',
    shoes: '#1a1012',
  },
}

// Which colour a material gets, from its VRoid name.
function partLook(name, pal) {
  if (/EyeIris/.test(name)) return { color: pal.eye, glow: 2.2 }
  if (/EyeHighlight/.test(name)) return { color: '#ffffff', glow: 1.5 }
  if (/EyeWhite/.test(name)) return { color: '#e8edf5' }
  if (/FaceBrow|FaceEyeline|FaceMouth/.test(name)) return { color: '#2b2226' }
  if (/SKIN/.test(name)) return { color: pal.skin }
  if (/HAIR/.test(name)) return { color: pal.hair }
  if (/Tops_01_CLOTH_02/.test(name)) return { color: pal.coat2 }
  if (/Tie/.test(name)) return { color: pal.accent, glow: 0.35 }
  if (/Bottoms/.test(name)) return { color: pal.pants }
  if (/Shoes/.test(name)) return { color: pal.shoes }
  return { color: pal.coat }
}

// Light bands instead of smooth shading: the anime look. Soft, so the textures'
// own painted shading still reads.
function toonRamp() {
  const data = new Uint8Array([165, 165, 170, 255, 215, 215, 218, 255, 255, 255, 255, 255])
  const tex = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat)
  tex.minFilter = tex.magFilter = THREE.NearestFilter
  tex.generateMipmaps = false
  tex.needsUpdate = true
  return tex
}

// --- animation ----------------------------------------------------------------

// The clips in hunter.glb (names given at conversion).
export const CLIPS = {
  idle: 'Idle', // breathing, when nobody is near
  fightIdle: 'FightIdle', // bouncing guard, when an opponent is near
  walk: 'Walk',
  run: 'Run',
  jump: 'JumpStanding',
  fallLand: 'FallLand',
  roll: 'Roll',
  hitHead: 'HitHead',
  hitBody: 'HitBody',
  emote: 'Emote',
}
// One clip per move. Attacks are *scrubbed*: the pose is computed from the move's
// frame, so the strike lands exactly on the active frames and freezes in hitstop.
export const MOVE_CLIPS = {
  L1: 'Jab', // left jab
  L2: 'Straight', // right straight
  L3: 'Uppercut', // left uppercut, from below
  H: 'Cross', // big right cross
  LH: 'BodyBlow', // right body shot
  AIR: 'Jab',
}
// Where in each attack clip the fist is fully out (0..1), measured by tracking
// the hands frame by frame during conversion.
export const IMPACT = { Jab: 0.37, Straight: 0.39, Uppercut: 0.51, Cross: 0.42, BodyBlow: 0.24 }
// How fast the clips travel at playback speed 1 (from their root motion), so the
// feet match the ground speed and never slide.
const STRIDE = { walk: 1.75, run: 4.6 } // m/s

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)

// Blend weights for idle / walk / run at a given speed (m/s). Sprinting is the
// run clip played faster.
export function locoWeights(speed) {
  const w = {
    idle: clamp01(1 - speed / 0.8),
    walk: speed <= 2 ? clamp01(speed / 0.8) : clamp01((3.8 - speed) / 1.8),
    run: clamp01((speed - 2) / 1.8),
  }
  const sum = w.idle + w.walk + w.run || 1
  for (const k in w) w[k] /= sum
  return w
}

// Where in an attack clip to be at a given move frame: wind-up over the startup,
// the strike over the active frames, follow-through over the recovery.
function attackProgress(m, frame, impact) {
  if (frame <= m.startup) return impact * (frame / m.startup)
  if (frame <= m.startup + m.active) return impact + 0.1 * ((frame - m.startup) / m.active)
  return impact + 0.1 + (0.9 - impact) * clamp01((frame - m.startup - m.active) / m.recovery)
}

// The non-locomotion clip a fighter state calls for: [name, progress 0..1] for a
// scrubbed clip, [name, 'loop'] for one that plays by itself, or null = locomotion.
// ctx: { landing (s left), sinceDouble (s since a double jump), near (bool) }
const CAST_CLIP = 'Straight'
const CAST_IMPACT = 0.39

export function overrideClip(p, ctx = {}) {
  switch (p.combat) {
    case 'attack': {
      const name = MOVE_CLIPS[p.move]
      return [name, attackProgress(MOVES[p.move], p.moveFrame, IMPACT[name] ?? 0.4)]
    }
    case 'cast': {
      // Scrubbed like an attack: the hand thrusts out exactly when the bolt leaves.
      // No spellcast clip yet, so the right straight's thrust stands in (CAST_CLIP).
      const ab = ABILITIES[p.slots?.[p.cast]]
      if (!ab) return null
      const f = p.castFrame
      const t =
        f <= ab.startup
          ? CAST_IMPACT * (f / ab.startup)
          : CAST_IMPACT + (1 - CAST_IMPACT) * clamp01((f - ab.startup) / ab.recovery)
      return [CAST_CLIP, t]
    }
    case 'block':
      return [CLIPS.fightIdle, 0.08] // guard up, held still
    case 'blockstun':
      return [CLIPS.hitBody, clamp01(1 - p.timer / 14) * 0.3]
    case 'hitstun':
      return [p.juggle % 2 ? CLIPS.hitHead : CLIPS.hitBody, clamp01(1 - p.timer / 20) * 0.7]
    case 'guardbreak':
      return [CLIPS.hitHead, clamp01(1 - p.timer / COMBAT.guardBreakFrames)]
    case 'down':
    case 'ko':
      return [CLIPS.hitHead, clamp01((COMBAT.knockdownFrames - p.timer) / 30)]
    case 'getup':
      return [CLIPS.fallLand, 0.7 + 0.3 * clamp01(1 - p.timer / COMBAT.getupFrames)]
    case 'dash':
      // The whole roll, from the dive to back on his feet, over the dash.
      return [CLIPS.roll, 0.3 + 0.62 * clamp01((COMBAT.dashFrames - p.timer) / COMBAT.dashFrames)]
    case 'emote':
      return [CLIPS.emote, 'loop']
  }
  if (p.wall) return [CLIPS.jump, 0.62]
  if (!p.grounded) {
    // Double jump: a quick tumble.
    if (ctx.sinceDouble < 0.4) return [CLIPS.roll, 0.42 + 0.3 * (ctx.sinceDouble / 0.4)]
    // Rising: tuck up towards the top of the jump; falling: reach for the floor.
    if (p.vel.y > 0) return [CLIPS.jump, 0.28 + 0.2 * clamp01(1 - p.vel.y / 9)]
    return [CLIPS.jump, 0.48 + 0.2 * clamp01(-p.vel.y / 10)]
  }
  if (ctx.landing > 0) return [CLIPS.fallLand, 0.75 + 0.25 * clamp01(1 - ctx.landing / 0.25)]
  return null
}

// Loads the model once per arena visit; each fighter gets its own clone.
export function loadHunterAsset(url = HUNTER_URL) {
  return new GLTFLoader().loadAsync(url)
}

// edge = the capsule fallback's colour, palette = 'hero' | 'enemy'.
export function createHunterFigure(gltf, { edge = '#22d3ee', palette = 'hero' } = {}) {
  const pal = PALETTES[palette] ?? PALETTES.hero
  const model = cloneSkinned(gltf.scene)

  // Fit the model to the body's height (1.8 m), feet at its origin.
  model.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(model, true)
  const scale = (2 * FOOT_OFFSET) / (box.max.y - box.min.y)
  model.scale.setScalar(scale)
  model.position.y = -box.min.y * scale

  // Toon materials: the VRoid texture where there is one, else a colour by part.
  // The dummy is the same hunter, tinted crimson, with red eyes.
  const ramp = toonRamp()
  const tint = new THREE.Color(palette === 'enemy' ? '#ff9a9a' : '#ffffff')
  const made = []
  model.traverse((o) => {
    if (!o.isMesh) return
    const toon = (src) => {
      const name = src.name ?? ''
      const look = partLook(name, pal)
      const eye = /EyeIris/.test(name)
      const m = new THREE.MeshToonMaterial({
        name,
        map: src.map ?? null,
        color: src.map
          ? eye && palette === 'enemy'
            ? new THREE.Color('#ff6070')
            : tint
          : new THREE.Color(look.color),
        emissive: eye ? new THREE.Color(pal.eye).multiplyScalar(0.6) : new THREE.Color(0x000000),
        emissiveMap: eye ? (src.map ?? null) : null,
        gradientMap: ramp,
        transparent: src.transparent,
        alphaTest: src.alphaTest,
        side: src.side,
        depthWrite: src.depthWrite,
      })
      made.push(m)
      return m
    }
    o.material = Array.isArray(o.material) ? o.material.map(toon) : toon(o.material)
    o.frustumCulled = false // skinned bounds don't follow the animation
  })

  const root = new THREE.Group()
  root.name = 'fighter'
  const body = new THREE.Group() // turns with the fighter
  body.add(model)
  root.add(body)
  const shadow = createShadow(edge)
  root.add(shadow.mesh)

  // --- animation: every clip runs all the time; we only set weights and times ---
  const mixer = new THREE.AnimationMixer(model)
  const actions = {}
  for (const clip of gltf.animations) {
    const a = mixer.clipAction(clip)
    a.play()
    a.setEffectiveWeight(0)
    a.timeScale = 0 // we set .time ourselves: scrubbed or advanced by our own clocks
    actions[clip.name] = a
  }
  const has = (n) => !!actions[n]
  const dur = (n) => actions[n].getClip().duration
  const ovr = {} // override clip name -> current weight (for cross-fades)
  let locoPhase = 0
  let idleTime = 0
  let loopTime = 0
  let lastOverride = null
  let wasGrounded = true
  let airTime = 0
  let landing = 0
  let lastJumps = 0
  let sinceDouble = Infinity
  let nearW = 0 // fight stance weight (eased)
  let yawOverride = null
  let shown = null

  // p = the fighter's state from the simulation, dt = seconds since last update,
  // ctx.near = an opponent is close (switches to the fight stance).
  function update(p, dt, ctx = {}) {
    if (dt <= 0) return
    if (p.grounded && !wasGrounded && airTime > 0.25) landing = 0.25
    airTime = p.grounded ? 0 : airTime + dt
    wasGrounded = p.grounded
    landing = Math.max(0, landing - dt)
    if (p.jumps !== lastJumps) {
      if (p.lastJump === 'double') sinceDouble = 0
      lastJumps = p.jumps
    }
    sinceDouble += dt
    if (p.grounded) sinceDouble = Infinity

    const frozen = p.hitstop > 0
    const step = frozen ? 0 : dt
    const speed = Math.sqrt(p.vel.x * p.vel.x + p.vel.z * p.vel.z)

    // Rolling: the body turns to roll the way the dash goes (render only).
    yawOverride = p.combat === 'dash' && speed > 0.5 ? Math.atan2(p.vel.x, p.vel.z) : null

    // Override (attack, block, hit, dash, air...) fades in quickly.
    const o = overrideClip(p, { landing, sinceDouble, near: ctx.near })
    const target = o && has(o[0]) ? o[0] : null
    if (target !== lastOverride) loopTime = 0
    lastOverride = target
    const fade = Math.min(1, dt / 0.07)
    for (const n of new Set([...Object.keys(ovr), ...(target ? [target] : [])])) {
      ovr[n] = (ovr[n] ?? 0) + ((n === target ? 1 : 0) - (ovr[n] ?? 0)) * fade
      if (ovr[n] < 0.001 && n !== target) delete ovr[n]
    }
    let ovrSum = 0
    for (const n in ovr) ovrSum += ovr[n]
    ovrSum = Math.min(1, ovrSum)

    // Locomotion: walk and run phase-synced, played at the speed that matches
    // the ground, so the feet don't slide.
    const w = locoWeights(speed)
    let phaseRate = 0
    if (has(CLIPS.walk)) phaseRate += (w.walk * (speed / STRIDE.walk)) / dur(CLIPS.walk)
    if (has(CLIPS.run)) phaseRate += (w.run * (speed / STRIDE.run)) / dur(CLIPS.run)
    if (w.walk + w.run > 0) phaseRate /= w.walk + w.run
    locoPhase = (locoPhase + phaseRate * step) % 1
    idleTime += step
    loopTime += step
    nearW += ((ctx.near ? 1 : 0) - nearW) * Math.min(1, dt * 4)

    for (const n in actions) actions[n].setEffectiveWeight(0)
    const rest = 1 - ovrSum
    const set = (name, weight, time) => {
      const a = actions[name]
      if (!a || weight <= 0) return
      a.time = time % dur(name)
      a.setEffectiveWeight(a.getEffectiveWeight() + weight)
    }
    set(CLIPS.idle, w.idle * (1 - nearW) * rest, idleTime)
    set(CLIPS.fightIdle, w.idle * nearW * rest, idleTime)
    set(CLIPS.walk, w.walk * rest, locoPhase * (has(CLIPS.walk) ? dur(CLIPS.walk) : 1))
    set(CLIPS.run, w.run * rest, locoPhase * (has(CLIPS.run) ? dur(CLIPS.run) : 1))
    for (const n in ovr) {
      const a = actions[n]
      const d = dur(n)
      if (n === target && o[1] !== 'loop') a.time = Math.min(o[1] * d, d - 1e-3)
      else if (n === target) a.time = loopTime % d
      a.setEffectiveWeight(a.getEffectiveWeight() + ovr[n])
    }
    mixer.update(0) // apply the times and weights we just set
    shown =
      target && ovrSum > 0.5
        ? target
        : w.idle >= w.walk && w.idle >= w.run
          ? nearW > 0.5
            ? CLIPS.fightIdle
            : CLIPS.idle
          : w.run > w.walk
            ? CLIPS.run
            : CLIPS.walk
  }

  return {
    kind: 'hunter',
    object: root,
    clips: Object.keys(actions),
    current: () => shown,
    place(pos, yaw) {
      // pos is the body's centre; the model's origin is at its feet.
      root.position.set(pos.x, pos.y - FOOT_OFFSET, pos.z)
      body.rotation.y = yawOverride ?? yaw
      shadow.place(pos.y - FOOT_OFFSET, pos.y - FOOT_OFFSET, groundUnder(pos))
    },
    update,
    dispose() {
      mixer.stopAllAction()
      mixer.uncacheRoot(model)
      ramp.dispose()
      for (const m of made) m.dispose()
    },
  }
}

// The floor height under a point. The shadow should sit on a ledge when you
// stand on one; for that the figure needs the room's blocks, set by the engine.
let blocksForShadow = []
export function setShadowBlocks(blocks) {
  blocksForShadow = blocks ?? []
}
function groundUnder(pos) {
  const feet = pos.y - FOOT_OFFSET + 0.05
  let top = 0
  for (const b of blocksForShadow) {
    if (b.h > feet || b.h <= top) continue
    if (Math.abs(pos.x - b.x) <= b.w / 2 && Math.abs(pos.z - b.z) <= b.d / 2) top = b.h
  }
  return top
}
