// What the fighters look like. Render-only: nothing here feeds back into the
// simulation, so the model, its animations and every effect can change freely
// without touching determinism.
//
//   createHunterFigure()   the hunter: a CC0 glTF character (KayKit, see
//                          docs/arena-assets.md), dark toon-shaded with a cyan
//                          outline, animated from the simulation's state.
//   createCapsuleFigure()  M1's capsule. Used if the model fails to load.
//
// Both return { object, place(pos, yaw), update(playerState, dt), kind }.
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { FOOT_OFFSET, MOVE } from './player.js'

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

// The clip to play for a given moment, from the simulation's player state.
// speed = horizontal speed in m/s. Returns [clip name, playback speed].
export function pickClip(p, speed, landing) {
  if (p.wall) return ['Jump_Idle', 1]
  if (!p.grounded) return ['Jump_Idle', 1]
  if (landing) return ['Jump_Land', 1.4]
  if (speed < 0.3) return ['Unarmed_Idle', 1]
  if (p.sprinting) return ['Running_B', Math.min(1.5, Math.max(0.9, speed / 7.5))]
  if (speed < 2.5) return ['Walking_A', Math.max(0.6, speed / 1.8)]
  return ['Running_A', Math.min(1.3, Math.max(0.8, speed / 5))]
}

export async function createHunterFigure({ edge = '#22d3ee', url = HUNTER_URL } = {}) {
  const gltf = await new GLTFLoader().loadAsync(url)
  const model = gltf.scene
  for (const name of HIDDEN_NODES) {
    const n = model.getObjectByName(name)
    if (n) n.visible = false
  }

  // Fit the model to the physics capsule's height (1.8 m), feet at its origin.
  model.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(model, true)
  const scale = (2 * FOOT_OFFSET) / (box.max.y - box.min.y)
  model.scale.setScalar(scale)
  model.position.y = -box.min.y * scale

  // Dark toon body with the original colours kept faintly, plus the outline.
  const ramp = toonRamp()
  const outline = outlineMaterial(new THREE.Color(edge), 0.018 / scale)
  const shells = []
  model.traverse((o) => {
    if (!o.isMesh) return
    const src = o.material
    o.material = new THREE.MeshToonMaterial({
      map: src.map ?? null,
      color: new THREE.Color(0.78, 0.82, 0.95), // cools the texture slightly
      emissive: new THREE.Color(0.02, 0.05, 0.07), // never fully black in the dark
      gradientMap: ramp,
    })
    src.dispose()
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
  root.name = 'player'
  const body = new THREE.Group() // turns with the player
  body.add(model)
  root.add(body)
  const shadow = createShadow(edge)
  root.add(shadow.mesh)

  // --- animation ---
  const mixer = new THREE.AnimationMixer(model)
  const actions = {}
  for (const clip of gltf.animations) actions[clip.name] = mixer.clipAction(clip)
  for (const once of ['Jump_Land', 'Jump_Start']) {
    if (!actions[once]) continue
    actions[once].setLoop(THREE.LoopOnce, 1)
    actions[once].clampWhenFinished = true
  }
  let current = null
  function play(name, timeScale) {
    const next = actions[name] ?? actions.Idle
    next.timeScale = timeScale
    if (next === current) return
    next.reset().play()
    if (current) next.crossFadeFrom(current, name === 'Jump_Land' ? 0.08 : 0.15, false)
    current = next
  }

  // Remember what happened last frame to spot landings.
  let wasGrounded = true
  let airTime = 0
  let landTimer = 0
  const last = { x: 0, z: 0, set: false }

  return {
    kind: 'hunter',
    object: root,
    clips: Object.keys(actions),
    current: () => current?.getClip().name ?? null,
    place(pos, yaw) {
      // pos is the capsule centre; the model's origin is at its feet.
      root.position.set(pos.x, pos.y - FOOT_OFFSET, pos.z)
      body.rotation.y = yaw
      shadow.place(pos.y - FOOT_OFFSET, pos.y - FOOT_OFFSET, groundUnder(pos))
    },
    // p = the simulation's player state, dt = seconds since the last update.
    update(p, dt) {
      if (dt <= 0) return
      const speed = last.set ? Math.hypot(p.pos.x - last.x, p.pos.z - last.z) / dt : 0
      last.x = p.pos.x
      last.z = p.pos.z
      last.set = true

      if (p.grounded && !wasGrounded && airTime > 0.25) landTimer = 0.22
      airTime = p.grounded ? 0 : airTime + dt
      wasGrounded = p.grounded
      landTimer = Math.max(0, landTimer - dt)

      const [clip, ts] = pickClip(p, speed, landTimer > 0 && speed < 2)
      play(clip, ts)
      mixer.update(dt)
    },
    dispose() {
      mixer.stopAllAction()
      mixer.uncacheRoot(model)
      outline.dispose()
      ramp.dispose()
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
