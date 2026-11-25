// The player's body: movement rules on top of our own collision (physics.js).
// No three.js and no DOM, so it runs headless in unit tests, and no Math.sin /
// cos / atan2 / hypot / pow, so it gives the same result on every machine
// (needed for online play: arena-design.md §0).
//
// Moves: walk, sprint, jump (with coyote time, a jump buffer and a short hop when
// you let go early), a double jump (Space again in the air: a little higher, and
// carries you the way you steer), and wall hug: push into a wall in mid-air to
// cling and slide down slowly, then jump to kick off it, higher and away.
import { moveBody } from './physics.js'

// Movement feel. Not combat balance (that will live on the server in ArenaRules),
// just how the body handles. Change a number, run the arena, feel the difference.
export const MOVE = {
  radius: 0.4, // body radius, metres
  halfHeight: 0.5, // kept from the capsule: total height = 2 * (halfHeight + radius) = 1.8 m
  walkSpeed: 5, // m/s at full stick
  sprintSpeed: 8.5, // m/s with sprint held
  accel: 40, // m/s² on the ground; high = snappy, low = icy
  airAccel: 14, // m/s² in the air: you can steer a jump, but not turn on a dime
  gravity: 24, // m/s², heavier than real (9.8): games feel floaty otherwise
  maxFall: 30, // terminal velocity, m/s
  jumpSpeed: 9, // m/s upwards; full jump height = jumpSpeed² / (2 * gravity) ≈ 1.69 m
  jumpCutSpeed: 4, // let go of jump while rising and upward speed drops to this: a short hop
  coyoteTime: 0.1, // s after walking off a ledge during which you can still jump
  jumpBuffer: 0.12, // s a jump press is remembered before landing
  wallSlideSpeed: 2.2, // m/s max fall while hugging a wall
  doubleJumpSpeed: 9.8, // m/s upwards for the second jump: a little higher than the first
  doubleJumpPush: 6, // m/s at least, in the direction you steer (or were moving)
  wallJumpUp: 10.5, // m/s upwards when kicking off a wall: higher than a normal jump
  wallJumpPush: 7.5, // m/s away from the wall
  wallGrace: 0.12, // s after leaving a wall during which a wall jump still works
  wallJumpLock: 0.2, // s after a wall jump during which the stick can't steer you back
  stepHeight: 0.3, // ledges this low are walked up without jumping
  snapDown: 0.2, // walking off a step this low stays glued to the floor
  killY: -20, // below this you fell out of the world: respawn
}

// Distance from the body's centre down to its feet.
export const FOOT_OFFSET = MOVE.halfHeight + MOVE.radius

// Turning: 14 rad/s, i.e. 14/60 rad per fixed step. These are cos and sin of
// 14/60 written out as numbers, because Math.cos may differ in the last digit
// between browsers and the simulation must not (sim.spec checks the values).
export const TURN_RATE = 14
export const TURN_COS = 0.97290106208145066
export const TURN_SIN = 0.23122180563429856

export const SHAPE = { radius: MOVE.radius, half: FOOT_OFFSET }
const SPRINT_MIN2 = MOVE.walkSpeed * 1.05 * (MOVE.walkSpeed * 1.05)

function approach(current, target, maxDelta) {
  if (current < target) return Math.min(current + maxDelta, target)
  return Math.max(current - maxDelta, target)
}

// Turn the facing vector f towards the unit vector (tx, tz) by at most one step.
function turnTowards(f, tx, tz) {
  const dot = f.x * tx + f.z * tz
  if (dot >= TURN_COS) {
    f.x = tx
    f.z = tz
    return
  }
  // Which way round is shorter: the sign of the 2D cross product.
  const sign = f.x * tz - f.z * tx < 0 ? 1 : -1
  const nx = f.x * TURN_COS + sign * f.z * TURN_SIN
  const nz = f.z * TURN_COS - sign * f.x * TURN_SIN
  const len = Math.sqrt(nx * nx + nz * nz)
  f.x = nx / len
  f.z = nz / len
}

export function createPlayer(world, spawn) {
  // Everything the simulation knows about the player, in plain numbers.
  const s = {
    pos: { x: spawn.x, y: spawn.y, z: spawn.z },
    vel: { x: 0, y: 0, z: 0 }, // the velocity we are trying to have
    moved: { x: 0, y: 0, z: 0 }, // what actually happened last step, after collisions
    grounded: false,
    sprinting: false,
    facing: { x: 0, z: -1 }, // unit vector; -z = away from the camera
    wall: null, // { x, z } outward normal of the wall being hugged, or null
    jumps: 0, // counts every jump, so the renderer can tell a new one started
    lastJump: null, // 'ground' | 'wall' | 'double'
    airJumpUsed: false, // the double jump, used since leaving the ground
    wallJumpUsed: false, // one wall jump per time in the air, and it ends your jumps
    // timers, in seconds
    coyote: 0,
    buffer: 0,
    wallGrace: 0,
    lock: 0,
    lastWall: null, // the wall we may still kick off during wallGrace
    fromJump: false, // rising because of a jump (so letting go can cut it short)
  }

  // One fixed step.
  //   move   wish direction in world space, each axis -1..1
  //   sprint held
  //   jumpHeld / jumpPressed   the button, and whether it went down this step
  //   face   optional unit vector {x, z}: turn towards it instead of towards the
  //          movement (combat uses it to face the opponent while blocking)
  function update(
    dt,
    { move, sprint = false, jumpHeld = false, jumpPressed = false, face = null },
  ) {
    let mx = move.x
    let mz = move.z
    const len2 = mx * mx + mz * mz
    if (len2 > 1) {
      const len = Math.sqrt(len2)
      mx /= len
      mz /= len
    }

    // --- timers ---
    s.coyote = s.grounded ? MOVE.coyoteTime : Math.max(0, s.coyote - dt)
    s.buffer = jumpPressed ? MOVE.jumpBuffer : Math.max(0, s.buffer - dt)
    s.wallGrace = Math.max(0, s.wallGrace - dt)
    s.lock = Math.max(0, s.lock - dt)

    // --- horizontal: accelerate towards the wish ---
    const top = sprint ? MOVE.sprintSpeed : MOVE.walkSpeed
    if (s.lock === 0) {
      const a = (s.grounded ? MOVE.accel : MOVE.airAccel) * dt
      s.vel.x = approach(s.vel.x, mx * top, a)
      s.vel.z = approach(s.vel.z, mz * top, a)
    }

    // --- jumping ---
    let jumpedNow = false
    if (s.buffer > 0) {
      if (s.coyote > 0) {
        s.vel.y = MOVE.jumpSpeed
        s.lastJump = 'ground'
        jumpedNow = true
      } else if (s.wallGrace > 0 && s.lastWall && !s.wallJumpUsed) {
        // Kick off the wall: up and away, and briefly ignore the stick so you
        // actually leave the wall instead of re-hugging it.
        s.vel.y = MOVE.wallJumpUp
        s.vel.x = s.lastWall.x * MOVE.wallJumpPush
        s.vel.z = s.lastWall.z * MOVE.wallJumpPush
        s.lock = MOVE.wallJumpLock
        s.facing.x = s.lastWall.x
        s.facing.z = s.lastWall.z
        s.lastJump = 'wall'
        s.wallGrace = 0
        s.wall = null
        s.airJumpUsed = true // and that's it: no double jump after a wall jump
        s.wallJumpUsed = true // nor a second wall jump, until you land
        jumpedNow = true
      } else if (!s.grounded && !s.airJumpUsed) {
        // Double jump: up again, and off in the direction you steer; with no
        // direction held, keep going the way you were moving.
        s.vel.y = MOVE.doubleJumpSpeed
        let dx = mx
        let dz = mz
        let d2 = dx * dx + dz * dz
        if (d2 < 0.01) {
          dx = s.vel.x
          dz = s.vel.z
          d2 = dx * dx + dz * dz
        }
        if (d2 > 0.01) {
          const d = Math.sqrt(d2)
          const cur = Math.sqrt(s.vel.x * s.vel.x + s.vel.z * s.vel.z)
          const sp = Math.max(cur, MOVE.doubleJumpPush)
          s.vel.x = (dx / d) * sp
          s.vel.z = (dz / d) * sp
        }
        s.airJumpUsed = true
        s.lastJump = 'double'
        jumpedNow = true
      }
      if (jumpedNow) {
        s.buffer = 0
        s.coyote = 0
        s.grounded = false
        s.fromJump = true
        s.jumps++
      }
    }

    // --- vertical ---
    const wasGrounded = s.grounded
    if (s.grounded && !jumpedNow) {
      // A small downward push keeps us in contact with the floor every step.
      s.vel.y = -1
    } else {
      // Let go of jump early and the jump is cut short: tap = hop, hold = full.
      if (s.fromJump && !jumpHeld && s.vel.y > MOVE.jumpCutSpeed) s.vel.y = MOVE.jumpCutSpeed
      if (s.vel.y <= 0) s.fromJump = false
      s.vel.y = Math.max(s.vel.y - MOVE.gravity * dt, -MOVE.maxFall)
      // Hugging a wall: fall slowly.
      if (s.wall && s.vel.y < -MOVE.wallSlideSpeed) s.vel.y = -MOVE.wallSlideSpeed
    }

    // --- move, and see what we hit ---
    const bx = s.pos.x
    const by = s.pos.y
    const bz = s.pos.z
    const hit = moveBody(world, s.pos, s.vel.x * dt, s.vel.y * dt, s.vel.z * dt, SHAPE, {
      stepHeight: MOVE.stepHeight,
      snap: MOVE.snapDown,
      wasGrounded,
    })
    s.grounded = hit.grounded
    const m = s.moved
    m.x = s.pos.x - bx
    m.y = s.pos.y - by
    m.z = s.pos.z - bz

    // Hugging = in the air, touching a wall, and pushing into it.
    const pushingIn = hit.wall && mx * -hit.wall.x + mz * -hit.wall.z > 0.3
    if (!s.grounded && pushingIn && s.lock === 0) {
      s.wall = hit.wall
      s.lastWall = hit.wall
      s.wallGrace = MOVE.wallGrace
    } else {
      s.wall = null
    }
    if (s.grounded) {
      s.lastWall = null
      s.airJumpUsed = false
      s.wallJumpUsed = false
    }

    // A wall that stopped us also stops the velocity, so letting go of the key
    // next to a wall does not leave a stored-up push.
    if (Math.abs(m.x) < Math.abs(s.vel.x * dt) * 0.5) s.vel.x = m.x / dt
    if (Math.abs(m.z) < Math.abs(s.vel.z * dt) * 0.5) s.vel.z = m.z / dt
    if (s.grounded && s.vel.y < 0) s.vel.y = 0
    if (hit.ceiling && s.vel.y > 0) s.vel.y = 0

    const speed2 = (m.x * m.x + m.z * m.z) / (dt * dt)
    s.sprinting = sprint && s.grounded && speed2 > SPRINT_MIN2

    // Face where we are going; when hugging a wall, face the wall.
    if (face) turnTowards(s.facing, face.x, face.z)
    else if (s.wall) turnTowards(s.facing, -s.wall.x, -s.wall.z)
    else if (speed2 > 0.25 && mx * mx + mz * mz > 0.01) {
      // Only while steering: sliding (knockback, the end of a dash) with no
      // direction held keeps you facing where you were.
      const sp = Math.sqrt(m.x * m.x + m.z * m.z)
      turnTowards(s.facing, m.x / sp, m.z / sp)
    }

    if (s.pos.y < MOVE.killY) teleport(spawn)
  }

  // Instantly place the body somewhere (respawn, tests). Clears velocity.
  function teleport(p) {
    s.pos.x = p.x
    s.pos.y = p.y
    s.pos.z = p.z
    s.vel.x = s.vel.y = s.vel.z = 0
    s.grounded = false
    s.wall = null
    s.lastWall = null
    s.coyote = s.buffer = s.wallGrace = s.lock = 0
    s.fromJump = false
    s.airJumpUsed = false
    s.wallJumpUsed = false
  }

  return { state: s, update, teleport }
}
