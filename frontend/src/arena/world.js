// The room: floor, walls, pillars, blocks, lights, fog, neon trim and dust, built
// from a room file in rooms/. One function describes the solid boxes (`roomBoxes`)
// and both the physics and the meshes are made from that list, so what you see is
// exactly what you collide with.
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { roomBoxes } from './physics.js'

export { roomBoxes }

// roomBoxes() lives in physics.js (pure, no three.js) so the simulation can use
// it without pulling in the renderer. Meshes are built from the same list.

function boxGeometry(center, half) {
  const g = new THREE.BoxGeometry(half[0] * 2, half[1] * 2, half[2] * 2)
  g.translate(...center)
  return g
}

// The neon strips. Bands are deliberately a few centimetres thick: hairline
// strips become thinner than a pixel at distance and shimmer as you move.
const BAND = 0.08
const LIP = 0.03

function trimGeometries(room) {
  const hw = room.width / 2
  const hd = room.depth / 2
  const h = room.wallHeight
  const out = []
  const ys = [BAND / 2 + 0.02, h - BAND / 2 - 0.2]

  for (const y of ys) {
    out.push(boxGeometry([0, y, -hd + LIP / 2], [hw, BAND / 2, LIP / 2]))
    out.push(boxGeometry([0, y, hd - LIP / 2], [hw, BAND / 2, LIP / 2]))
    out.push(boxGeometry([-hw + LIP / 2, y, 0], [LIP / 2, BAND / 2, hd]))
    out.push(boxGeometry([hw - LIP / 2, y, 0], [LIP / 2, BAND / 2, hd]))
  }
  for (const p of room.pillars ?? []) {
    const s = p.size / 2 + LIP
    for (const y of ys) out.push(boxGeometry([p.x, y, p.z], [s, BAND / 2, s]))
  }
  // Blocks: a glowing edge round the top, so you can read where to land.
  for (const b of room.blocks ?? []) {
    const y = b.h - BAND / 2
    const hx = b.w / 2 + LIP
    const hz = b.d / 2 + LIP
    out.push(boxGeometry([b.x, y, b.z - hz + LIP / 2], [hx, BAND / 2, LIP / 2]))
    out.push(boxGeometry([b.x, y, b.z + hz - LIP / 2], [hx, BAND / 2, LIP / 2]))
    out.push(boxGeometry([b.x - hx + LIP / 2, y, b.z], [LIP / 2, BAND / 2, hz]))
    out.push(boxGeometry([b.x + hx - LIP / 2, y, b.z], [LIP / 2, BAND / 2, hz]))
  }
  return out
}

// The floor grid as a texture, not as line geometry. A texture gets mipmaps, so
// far-away lines fade smoothly instead of flickering in and out pixel by pixel.
function gridTexture(color) {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, size, size)
  ctx.strokeStyle = color
  ctx.lineWidth = 4
  ctx.strokeRect(0, 0, size, size)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.anisotropy = 8
  return tex
}

// A soft round dot, so dust near the camera is not a square.
function dotTexture() {
  const size = 32
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  return new THREE.CanvasTexture(canvas)
}

// Slow-drifting dust in the air: makes the dark feel like a space, not a void.
// Render-only; it never touches the simulation.
function dust(room, count = 260) {
  const pos = new Float32Array(count * 3)
  // A fixed pattern, not Math.random, so screenshots are reproducible.
  let s = 1234567
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (rnd() - 0.5) * room.width
    pos[i * 3 + 1] = rnd() * room.wallHeight
    pos[i * 3 + 2] = (rnd() - 0.5) * room.depth
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  const mat = new THREE.PointsMaterial({
    color: room.colors.trim,
    map: dotTexture(),
    size: 0.06,
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
  })
  const points = new THREE.Points(geo, mat)
  points.name = 'dust'
  const base = pos.slice()
  points.userData.update = (t) => {
    const a = points.geometry.attributes.position.array
    for (let i = 0; i < count; i++) {
      a[i * 3] = base[i * 3] + Math.sin(t * 0.07 + i) * 0.4
      a[i * 3 + 1] = (base[i * 3 + 1] + t * 0.05 * (0.5 + (i % 5) * 0.1)) % room.wallHeight
      a[i * 3 + 2] = base[i * 3 + 2] + Math.cos(t * 0.05 + i * 1.3) * 0.4
    }
    points.geometry.attributes.position.needsUpdate = true
  }
  return points
}

// Builds everything visible. Static geometry is merged by material, so the whole
// room is a handful of draw calls (budget: playbook §6). Call
// group.userData.update(seconds) each frame for the ambient animation.
export function buildRoomScene(room) {
  const c = room.colors
  const group = new THREE.Group()
  group.name = 'room'
  const boxes = roomBoxes(room)
  const pick = (kinds) =>
    mergeGeometries(
      boxes.filter((b) => kinds.includes(b.kind)).map((b) => boxGeometry(b.center, b.half)),
    )

  const floor = new THREE.Mesh(
    pick(['floor']),
    new THREE.MeshStandardMaterial({ color: c.floor, roughness: 0.9, metalness: 0.05 }),
  )
  floor.name = 'floor'
  group.add(floor)

  const walls = new THREE.Mesh(
    pick(['wall', 'pillar']),
    new THREE.MeshStandardMaterial({ color: c.wall, roughness: 0.75, metalness: 0.15 }),
  )
  walls.name = 'walls'
  group.add(walls)

  if (room.blocks?.length) {
    const blocks = new THREE.Mesh(
      pick(['block']),
      new THREE.MeshStandardMaterial({ color: c.block ?? c.wall, roughness: 0.7, metalness: 0.2 }),
    )
    blocks.name = 'blocks'
    group.add(blocks)
  }

  // The trim is an unlit colour, dimmed by trimIntensity; bloom picks up only
  // the brightest of it.
  const trimColor = new THREE.Color(c.trim).multiplyScalar(room.trimIntensity ?? 1)
  const trim = new THREE.Mesh(
    mergeGeometries(trimGeometries(room)),
    new THREE.MeshBasicMaterial({ color: trimColor }),
  )
  trim.name = 'trim'
  group.add(trim)

  const grid = new THREE.Mesh(
    new THREE.PlaneGeometry(room.width, room.depth),
    new THREE.MeshBasicMaterial({
      map: gridTexture(c.grid),
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  )
  grid.material.map.repeat.set(room.width / 2, room.depth / 2) // 2 m cells
  grid.rotation.x = -Math.PI / 2
  grid.position.y = 0.005
  grid.name = 'grid'
  group.add(grid)

  // A dim ring in the centre: where the opponent will stand once there is a fight.
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.85, 3, 96),
    new THREE.MeshBasicMaterial({
      color: trimColor,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    }),
  )
  ring.rotation.x = -Math.PI / 2
  ring.position.y = 0.01
  ring.name = 'center-ring'
  group.add(ring)

  const motes = dust(room)
  group.add(motes)

  // Light: dark and cold. A faint fill and one dim key light. No shadow maps.
  group.add(new THREE.HemisphereLight('#4a62b8', '#010104', 0.55))
  const key = new THREE.DirectionalLight('#a9d8ff', 0.6)
  key.position.set(5, 12, 7)
  group.add(key)

  group.userData.update = (t) => motes.userData.update(t)
  return group
}
