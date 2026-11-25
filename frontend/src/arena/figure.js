// What the fighters look like. Render-only: nothing here feeds back into the
// simulation, so the model, its animations and every effect can change freely
// without touching determinism.
//
//   createHunterFigure()   the hunter: a CC0 glTF character (KayKit, see
//                          docs/arena-assets.md), dark toon-shaded with a cyan
//                          outline, animated from the simulation's state.
//   createCapsuleFigure()  M1's capsule. Used if the model fails to load.
//
// Both return { object, place(pos, yaw), update(fighterState, dt), kind }.
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { FOOT_OFFSET, MOVE } from './player.js'
import { COMBAT, MOVES } from './moves.js'

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
  // A faint contact ring: a black shadow alone vanishes on the dark floor, and
  // this is what shows you are in the air (it shrinks and fades as you rise).
  const c = new THREE.Color(edge)
  ctx.strokeStyle = `rgba(${(c.r * 255) | 0},${(c.g * 255) | 0},${(c.b * 255) | 0},0.5)`
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.arc(size / 2, size / 2, size * 0.36, 0, Math.PI * 2)
  ctx.stroke()
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

// Props the Rogue carries that the arena doesn't use (yet).
const HIDDEN_NODES = ['Knife_Offhand', '1H_Crossbow', '2H_Crossbow', 'Knife', 'Throwable']

// Three light bands instead of smooth shading: the anime look.
function toonRamp() {
  const data = new Uint8Array([40, 40, 40, 255, 120, 120, 120, 255, 255, 255, 255, 255])
  const tex = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat)
  tex.minFilter = tex.magFilter = THREE.NearestFilter
  tex.generateMipmaps = false
  tex.needsUpdate = true
  return tex
}

// The outline: the same mesh again, drawn inside-out and pushed out along its
// normals, so only a rim shows round the body. Works for skinned meshes because
// the push happens before skinning, in the model's own space.
function outlineMaterial(color, width) {
  const mat = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide })
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>\n  transformed += normalize(normal) * ${width.toFixed(4)};`,
    )
  }
  return mat
}

// --- animation ----------------------------------------------------------------

// Locomotion clips, blended by speed so walking speeds up into a jog, a run and a
// sprint without a visible switch. Swap these names for Mixamo ones later.
export const LOCO = {
  idle: 'Unarmed_Idle',
  walk: 'Walking_A',
  run: 'Running_A',
  sprint: 'Running_B',
}
// One clip per move. Attacks are *scrubbed*: the pose is computed from the move's
// frame, so the strike lands exactly on the active frames and freezes in hitstop.
export const MOVE_CLIPS = {
  L1: 'Unarmed_Melee_Attack_Punch_A',
  L2: 'Unarmed_Melee_Attack_Punch_B',
  L3: '1H_Melee_Attack_Slice_Diagonal', // closest to an uppercut in this pack; Mixamo has a real one
  LH: 'Unarmed_Melee_Attack_Kick',
  H: '1H_Melee_Attack_Stab',
  AIR: 'Unarmed_Melee_Attack_Kick',
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)

// Blend weights for the four locomotion clips at a given speed (m/s).
export function locoWeights(speed) {
  const w = {
    idle: clamp01(1 - speed / 0.8),
    walk: speed <= 2 ? clamp01(speed / 0.8) : clamp01((3.5 - speed) / 1.5),
    run: speed < 2 ? 0 : speed <= 5.2 ? clamp01((speed - 2) / 1.5) : clamp01((7.5 - speed) / 2.3),
    sprint: clamp01((speed - 5.5) / 2.5),
  }
  const sum = w.idle + w.walk + w.run + w.sprint || 1
  for (const k in w) w[k] /= sum
  return w
}

// Where in an attack clip to be at a given move frame: wind-up over the startup,
// the strike over the active frames, follow-through over the recovery. The clip's
// own impact moment is roughly 40-55% through, which is where active lands.
function attackProgress(m, frame) {
  if (frame <= m.startup) return 0.4 * (frame / m.startup)
  if (frame <= m.startup + m.active) return 0.4 + 0.15 * ((frame - m.startup) / m.active)
  return 0.55 + 0.45 * clamp01((frame - m.startup - m.active) / m.recovery)
}

// The non-locomotion clip a fighter state calls for: [name, progress 0..1] for a
// scrubbed clip, [name, 'loop'] for one that plays by itself, or null = locomotion.
export function overrideClip(p, landing) {
  switch (p.combat) {
    case 'attack': {
      const m = MOVES[p.move]
      return [MOVE_CLIPS[p.move], attackProgress(m, p.moveFrame)]
    }
    case 'block':
      return ['Blocking', 'loop']
    case 'blockstun':
      return ['Block_Hit', clamp01(1 - p.timer / 14)]
    case 'guardbreak':
      return ['Hit_B', clamp01(1 - p.timer / COMBAT.guardBreakFrames) * 0.7]
    case 'hitstun':
      return [p.juggle % 2 ? 'Hit_A' : 'Hit_B', clamp01(1 - p.timer / 20)]
    case 'down':
      return ['Death_A', clamp01((COMBAT.knockdownFrames - p.timer) / 25)]
    case 'getup':
      return ['Death_A', clamp01(p.timer / COMBAT.getupFrames)] // the fall, played backwards
    case 'ko':
      return ['Death_A', clamp01((COMBAT.koFrames - p.timer) / 30)]
    case 'dash': {
      // Which way relative to where you face.
      const f = p.facing
      const fwd = p.vel.x * f.x + p.vel.z * f.z
      const right = p.vel.x * -f.z + p.vel.z * f.x
      const name =
        Math.abs(fwd) >= Math.abs(right)
          ? fwd >= 0
            ? 'Dodge_Forward'
            : 'Dodge_Backward'
          : right >= 0
            ? 'Dodge_Right'
            : 'Dodge_Left'
      return [name, clamp01((COMBAT.dashFrames - p.timer) / COMBAT.dashFrames)]
    }
  }
  if (p.wall || !p.grounded) return ['Jump_Idle', 'loop']
  if (landing > 0) return ['Jump_Land', clamp01(1 - landing / 0.22) * 0.6]
  return null
}

// Loads the model once per arena visit; each fighter gets its own clone.
export function loadHunterAsset(url = HUNTER_URL) {
  return new GLTFLoader().loadAsync(url)
}

// edge = outline colour, tint = body colour multiplier (the dummy is reddish).
export function createHunterFigure(gltf, { edge = '#22d3ee', tint = [0.78, 0.82, 0.95] } = {}) {
  const model = cloneSkinned(gltf.scene)
  for (const name of HIDDEN_NODES) {
    const n = model.getObjectByName(name)
    if (n) n.visible = false
  }

  // Fit the model to the body's height (1.8 m), feet at its origin.
  model.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(model, true)
  const scale = (2 * FOOT_OFFSET) / (box.max.y - box.min.y)
  model.scale.setScalar(scale)
  model.position.y = -box.min.y * scale

  // Toon body with the original colours, tinted, plus the outline.
  const ramp = toonRamp()
  const outline = outlineMaterial(new THREE.Color(edge), 0.018 / scale)
  const shells = []
  model.traverse((o) => {
    if (!o.isMesh) return
    const src = o.material
    o.material = new THREE.MeshToonMaterial({
      map: src.map ?? null,
      color: new THREE.Color(...tint),
      emissive: new THREE.Color(0.02, 0.05, 0.07), // never fully black in the dark
      gradientMap: ramp,
    })
    // Skinned meshes need a skinned twin for the outline, bound to the same skeleton.
    const shell = o.isSkinnedMesh
      ? new THREE.SkinnedMesh(o.geometry, outline)
      : new THREE.Mesh(o.geometry, outline)
    if (o.isSkinnedMesh) shell.bind(o.skeleton, o.bindMatrix)
    shell.name = `${o.name}-outline`
    shells.push([o, shell])
  })
  for (const [o, shell] of shells) {
    shell.position.copy(o.position)
    shell.quaternion.copy(o.quaternion)
    shell.scale.copy(o.scale)
    shell.visible = o.visible && o.parent?.visible !== false
    o.parent.add(shell)
  }

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
  const ovr = {} // override clip name -> current weight (for cross-fades)
  let locoPhase = 0
  let idleTime = 0
  let loopTime = 0
  let lastOverride = null
  let wasGrounded = true
  let airTime = 0
  let landing = 0
  let shown = null

  function update(p, dt) {
    if (dt <= 0) return
    // Landing: a short knee bend after a real fall.
    if (p.grounded && !wasGrounded && airTime > 0.25) landing = 0.22
    airTime = p.grounded ? 0 : airTime + dt
    wasGrounded = p.grounded
    landing = Math.max(0, landing - dt)

    const frozen = p.hitstop > 0
    const step = frozen ? 0 : dt
    const speed = Math.sqrt(p.vel.x * p.vel.x + p.vel.z * p.vel.z)

    // Override (attack, block, hit, dash, air...) fades in over ~0.06 s.
    const o = overrideClip(p, landing)
    const target = o && has(o[0]) ? o[0] : null
    if (target !== lastOverride) loopTime = 0
    lastOverride = target
    const fade = Math.min(1, dt / 0.06)
    for (const n of new Set([...Object.keys(ovr), ...(target ? [target] : [])])) {
      ovr[n] = (ovr[n] ?? 0) + ((n === target ? 1 : 0) - (ovr[n] ?? 0)) * fade
      if (ovr[n] < 0.001 && n !== target) delete ovr[n]
    }
    let ovrSum = 0
    for (const n in ovr) ovrSum += ovr[n]
    ovrSum = Math.min(1, ovrSum)

    // Locomotion, phase-synced so the feet of the walk, run and sprint line up.
    const w = locoWeights(speed)
    const rates = { walk: Math.max(0.5, speed / 1.6), run: speed / 5, sprint: speed / 7.5 }
    let phaseRate = 0
    for (const k of ['walk', 'run', 'sprint']) {
      if (has(LOCO[k])) phaseRate += (w[k] * rates[k]) / actions[LOCO[k]].getClip().duration
    }
    locoPhase = (locoPhase + phaseRate * step) % 1
    idleTime += step
    loopTime += step

    for (const n in actions) actions[n].setEffectiveWeight(0)
    for (const k in LOCO) {
      const a = actions[LOCO[k]]
      if (!a) continue
      const d = a.getClip().duration
      a.time = k === 'idle' ? idleTime % d : locoPhase * d
      a.setEffectiveWeight(w[k] * (1 - ovrSum))
    }
    for (const n in ovr) {
      const a = actions[n]
      const d = a.getClip().duration
      if (n === target && o[1] !== 'loop') a.time = Math.min(o[1] * d, d - 1e-3)
      else if (n === target) a.time = loopTime % d
      a.setEffectiveWeight(ovr[n])
    }
    mixer.update(0) // apply the times and weights we just set
    shown = target && ovrSum > 0.5 ? target : maxKey(w, LOCO)
  }

  return {
    kind: 'hunter',
    object: root,
    clips: Object.keys(actions),
    current: () => shown,
    place(pos, yaw) {
      // pos is the body's centre; the model's origin is at its feet.
      root.position.set(pos.x, pos.y - FOOT_OFFSET, pos.z)
      body.rotation.y = yaw
      shadow.place(pos.y - FOOT_OFFSET, pos.y - FOOT_OFFSET, groundUnder(pos))
    },
    update,
    dispose() {
      mixer.stopAllAction()
      mixer.uncacheRoot(model)
      outline.dispose()
      ramp.dispose()
    },
  }
}

function maxKey(w, names) {
  let best = 'idle'
  for (const k in w) if (w[k] > w[best]) best = k
  return names[best]
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
