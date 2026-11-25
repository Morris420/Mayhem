// The room: floor, walls, pillars, lights, fog and neon trim, built from a room
// file in rooms/. One function describes the solid boxes (`roomBoxes`) and both the
// physics and the meshes are made from that list, so what you see is exactly what
// you collide with.
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

// Every solid part of the room as an axis-aligned box: centre + half extents.
// Pure data, no three.js or Rapier, so it is trivially testable.
export function roomBoxes(room) {
  const hw = room.width / 2
  const hd = room.depth / 2
  const t = room.wallThickness
  const h = room.wallHeight
  const floorThickness = 1

  const boxes = [
    // The floor is a thick slab whose top face is exactly y = 0.
    {
      kind: 'floor',
      center: [0, -floorThickness / 2, 0],
      half: [hw + t, floorThickness / 2, hd + t],
    },
    // Four walls standing on the floor, just outside the playable area.
    { kind: 'wall', center: [0, h / 2, -hd - t / 2], half: [hw + t, h / 2, t / 2] },
    { kind: 'wall', center: [0, h / 2, hd + t / 2], half: [hw + t, h / 2, t / 2] },
    { kind: 'wall', center: [-hw - t / 2, h / 2, 0], half: [t / 2, h / 2, hd] },
    { kind: 'wall', center: [hw + t / 2, h / 2, 0], half: [t / 2, h / 2, hd] },
  ]
  for (const p of room.pillars ?? []) {
    boxes.push({ kind: 'pillar', center: [p.x, h / 2, p.z], half: [p.size / 2, h / 2, p.size / 2] })
  }
  return boxes
}

// Fixed (immovable) colliders for every box. Rapier frees them with the world.
export function buildRoomPhysics(RAPIER, world, room) {
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed())
  for (const b of roomBoxes(room)) {
    const desc = RAPIER.ColliderDesc.cuboid(...b.half).setTranslation(...b.center)
    world.createCollider(desc, body)
  }
}

function boxGeometry(center, half) {
  const g = new THREE.BoxGeometry(half[0] * 2, half[1] * 2, half[2] * 2)
  g.translate(...center)
  return g
}

// The neon strips: a thin glowing band along the bottom and top of every wall's
// inner face, and a collar round the foot and head of every pillar.
function trimGeometries(room) {
  const hw = room.width / 2
  const hd = room.depth / 2
  const h = room.wallHeight
  const band = 0.06 // strip height
  const lip = 0.03 // how far it stands proud of the wall
  const out = []

  for (const y of [band / 2 + 0.02, h - band / 2 - 0.15]) {
    out.push(boxGeometry([0, y, -hd + lip / 2], [hw, band / 2, lip / 2]))
    out.push(boxGeometry([0, y, hd - lip / 2], [hw, band / 2, lip / 2]))
    out.push(boxGeometry([-hw + lip / 2, y, 0], [lip / 2, band / 2, hd]))
    out.push(boxGeometry([hw - lip / 2, y, 0], [lip / 2, band / 2, hd]))
  }
  for (const p of room.pillars ?? []) {
    const s = p.size / 2 + lip
    for (const y of [band / 2 + 0.02, h - band / 2 - 0.15])
      out.push(boxGeometry([p.x, y, p.z], [s, band / 2, s]))
  }
  return out
}

// Builds everything visible. Static geometry is merged by material, so the whole
// room is a handful of draw calls (budget: playbook §6).
export function buildRoomScene(room) {
  const c = room.colors
  const group = new THREE.Group()
  group.name = 'room'

  const boxes = roomBoxes(room)

  const floorMat = new THREE.MeshStandardMaterial({
    color: c.floor,
    roughness: 0.85,
    metalness: 0.1,
  })
  const floor = new THREE.Mesh(
    mergeGeometries(
      boxes.filter((b) => b.kind === 'floor').map((b) => boxGeometry(b.center, b.half)),
    ),
    floorMat,
  )
  floor.name = 'floor'
  group.add(floor)

  const wallMat = new THREE.MeshStandardMaterial({ color: c.wall, roughness: 0.7, metalness: 0.2 })
  const walls = new THREE.Mesh(
    mergeGeometries(
      boxes.filter((b) => b.kind !== 'floor').map((b) => boxGeometry(b.center, b.half)),
    ),
    wallMat,
  )
  walls.name = 'walls'
  group.add(walls)

  // Emissive + bloom is what makes the trim "neon". toneMapped:false keeps the
  // colour from being flattened before the bloom pass picks it up.
  const trimMat = new THREE.MeshBasicMaterial({ color: c.trim, toneMapped: false })
  const trim = new THREE.Mesh(mergeGeometries(trimGeometries(room)), trimMat)
  trim.name = 'trim'
  group.add(trim)

  // A faint grid on the floor gives a sense of speed when you move.
  const size = Math.max(room.width, room.depth)
  const grid = new THREE.GridHelper(size, size / 2, c.grid, c.grid)
  grid.position.y = 0.005
  grid.material.transparent = true
  grid.material.opacity = 0.28
  grid.name = 'grid'
  group.add(grid)

  // A glowing ring in the centre: where the boss will stand from M4.
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.4, 2.5, 64),
    new THREE.MeshBasicMaterial({
      color: c.trim,
      toneMapped: false,
      transparent: true,
      opacity: 0.55,
    }),
  )
  ring.rotation.x = -Math.PI / 2
  ring.position.y = 0.01
  ring.name = 'center-ring'
  group.add(ring)

  // Light: a cold dim fill plus one key light. No shadow maps (playbook §6).
  group.add(new THREE.HemisphereLight('#6b8cff', '#020308', 0.9))
  const key = new THREE.DirectionalLight('#bfe9ff', 0.9)
  key.position.set(4, 10, 6)
  group.add(key)

  return group
}
