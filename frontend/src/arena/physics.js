// Our own collision for the arena. Replaces Rapier (decided 25 Nov, see
// arena-design.md §0): a fighting game is fighters on a floor between walls, not
// a physics problem, and online play needs the simulation to be
//
//   1. deterministic on every machine: this file uses only + - * / and
//      Math.sqrt, which are exactly rounded the same way in every JS engine.
//      No Math.sin / cos / atan2 / hypot / pow in here or in anything the
//      simulation calls: their last digit can differ between browsers.
//   2. cheap to snapshot: the state is a few plain numbers, not a wasm world.
//
// The model: a fighter is an upright cylinder (radius r, feet to head), the room
// is a list of axis-aligned boxes. Vertical and horizontal movement are resolved
// separately, horizontal collisions push the cylinder out along the contact
// normal, which is what makes walking into a wall at an angle slide along it.

// Push-out distance beyond touching, so a resolved body is never still
// "overlapping" by a rounding error on the next check.
const SKIN = 1e-3
// Longest move per sub-step. Faster moves are split so nothing tunnels through
// a thin wall (max fall 30 m/s = 0.5 m per step).
const MAX_SUBSTEP = 0.2

// Every solid part of the room as an axis-aligned box: centre + half extents.
// Pure data, used by the collision here and by the meshes in world.js, so what
// you see is exactly what you collide with.
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
    // An invisible lid at wall height: chained wall jumps up a corner must not be
    // able to carry you over the wall and out of the world. Not drawn.
    { kind: 'ceiling', center: [0, h + 0.5, 0], half: [hw + t, 0.5, hd + t] },
  ]
  for (const p of room.pillars ?? []) {
    boxes.push({ kind: 'pillar', center: [p.x, h / 2, p.z], half: [p.size / 2, h / 2, p.size / 2] })
  }
  for (const b of room.blocks ?? []) {
    boxes.push({ kind: 'block', center: [b.x, b.h / 2, b.z], half: [b.w / 2, b.h / 2, b.d / 2] })
  }
  return boxes
}

// The room as min/max boxes, ready for collision.
export function createCollisionWorld(room) {
  return roomBoxes(room).map((b) => ({
    kind: b.kind,
    minX: b.center[0] - b.half[0],
    maxX: b.center[0] + b.half[0],
    minY: b.center[1] - b.half[1],
    maxY: b.center[1] + b.half[1],
    minZ: b.center[2] - b.half[2],
    maxZ: b.center[2] + b.half[2],
  }))
}

// Circle (x, z, r) against a box's footprint. null if apart; otherwise the
// outward normal and how deep the circle is in.
function circleRect(x, z, r, b) {
  const cx = x < b.minX ? b.minX : x > b.maxX ? b.maxX : x
  const cz = z < b.minZ ? b.minZ : z > b.maxZ ? b.maxZ : z
  const dx = x - cx
  const dz = z - cz
  const d2 = dx * dx + dz * dz
  if (d2 >= r * r) return null
  if (d2 > 1e-12) {
    const d = Math.sqrt(d2)
    return { nx: dx / d, nz: dz / d, depth: r - d }
  }
  // The centre is inside the footprint: leave by the nearest side.
  const left = x - b.minX
  const right = b.maxX - x
  const back = z - b.minZ
  const front = b.maxZ - z
  const m = Math.min(left, right, back, front)
  if (m === left) return { nx: -1, nz: 0, depth: left + r }
  if (m === right) return { nx: 1, nz: 0, depth: right + r }
  if (m === back) return { nx: 0, nz: -1, depth: back + r }
  return { nx: 0, nz: 1, depth: front + r }
}

const overlapsY = (feet, head, b) => feet < b.maxY - 1e-6 && head > b.minY + 1e-6

// Moves a body by (dx, dy, dz) through the world and reports what it hit.
//   body:  { x, y, z } with y the body's centre; mutated in place
//   shape: { radius, half }  half = centre-to-feet distance
//   opts:  { stepHeight, snap, wasGrounded }
// Returns { grounded, ceiling, wall } where wall is the outward normal {x, z}
// of a wall the body is touching (any surface too tall to step onto), or null.
export function moveBody(world, body, dx, dy, dz, shape, opts = {}) {
  const r = shape.radius
  const half = shape.half
  const stepHeight = opts.stepHeight ?? 0
  let grounded = false
  let ceiling = false

  const longest = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz))
  const n = longest > MAX_SUBSTEP ? Math.ceil(longest / MAX_SUBSTEP) : 1
  const sx = dx / n
  const sy = dy / n
  const sz = dz / n

  for (let i = 0; i < n; i++) {
    // --- vertical ---
    body.y += sy
    for (const b of world) {
      if (!overlapsY(body.y - half, body.y + half, b)) continue
      if (!circleRect(body.x, body.z, r, b)) continue
      if (sy < 0) {
        body.y = b.maxY + half
        grounded = true
      } else if (sy > 0) {
        body.y = b.minY - half
        ceiling = true
      }
    }

    // --- horizontal, with step-up onto low ledges ---
    body.x += sx
    body.z += sz
    for (let pass = 0; pass < 3; pass++) {
      let moved = false
      for (const b of world) {
        const feet = body.y - half
        if (!overlapsY(feet, body.y + half, b)) continue
        const hit = circleRect(body.x, body.z, r, b)
        if (!hit) continue
        const rise = b.maxY - feet
        if (
          (grounded || opts.wasGrounded) &&
          rise > 0 &&
          rise <= stepHeight &&
          fits(world, body, r, half, b.maxY + half)
        ) {
          body.y = b.maxY + half
          grounded = true
          continue
        }
        body.x += hit.nx * (hit.depth + SKIN)
        body.z += hit.nz * (hit.depth + SKIN)
        moved = true
      }
      if (!moved) break
    }
  }

  // --- snap down: walking off a small step stays on the floor ---
  if (!grounded && dy <= 0 && opts.wasGrounded && opts.snap > 0) {
    const feet = body.y - half
    let top = -Infinity
    for (const b of world) {
      if (b.maxY > feet + 1e-6 || b.maxY < feet - opts.snap || b.maxY <= top) continue
      if (circleRect(body.x, body.z, r, b)) top = b.maxY
    }
    if (top > -Infinity) {
      body.y = top + half
      grounded = true
    }
  }

  // --- walls we are touching (for wall hug) ---
  let wall = null
  const feet = body.y - half
  for (const b of world) {
    if (!overlapsY(feet, body.y + half, b) || b.maxY - feet <= stepHeight) continue
    const hit = circleRect(body.x, body.z, r + 0.02, b)
    if (hit) wall = { x: hit.nx, z: hit.nz }
  }

  return { grounded, ceiling, wall }
}

// Would a body centred at height y fit here without overlapping anything?
function fits(world, body, r, half, y) {
  for (const b of world) {
    if (overlapsY(y - half, y + half, b) && circleRect(body.x, body.z, r, b)) return false
  }
  return true
}
