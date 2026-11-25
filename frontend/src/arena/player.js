// The player's body in the physics world: a capsule moved by Rapier's kinematic
// character controller. No three.js in here, so it runs headless in unit tests.
//
// Why kinematic and not a dynamic rigid body: a dynamic body slides on slopes,
// tips over, and gets shoved by everything it touches. A kinematic controller
// moves exactly where we tell it, minus whatever the walls refuse (playbook §6).

// Movement feel. These are not combat balance (that lives on the server in
// ArenaRules), just how the body handles.
export const MOVE = {
  radius: 0.4, // capsule radius, metres
  halfHeight: 0.5, // half the straight middle section; total height = 2*(halfHeight+radius) = 1.8 m
  walkSpeed: 5, // m/s at full stick
  accel: 40, // m/s² towards the target speed; high = snappy, low = icy
  gravity: 24, // m/s², heavier than real (9.8) because games feel floaty otherwise
  maxFall: 30, // terminal velocity, m/s
  turnRate: 14, // how fast the body turns to face its movement, rad/s
  killY: -20, // below this you fell out of the world: respawn
}

// Distance from the capsule's centre down to its feet.
export const FOOT_OFFSET = MOVE.halfHeight + MOVE.radius

function approach(current, target, maxDelta) {
  if (current < target) return Math.min(current + maxDelta, target)
  return Math.max(current - maxDelta, target)
}

// Shortest signed angle from a to b, in (-π, π].
function angleDelta(a, b) {
  let d = (b - a) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d <= -Math.PI) d += Math.PI * 2
  return d
}

export function createPlayer(RAPIER, world, spawn) {
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(spawn.x, spawn.y, spawn.z),
  )
  const collider = world.createCollider(
    RAPIER.ColliderDesc.capsule(MOVE.halfHeight, MOVE.radius),
    body,
  )

  // A small gap the controller keeps from every surface, so it never starts a
  // step already touching a wall (which is when controllers get stuck).
  const controller = world.createCharacterController(0.02)
  controller.setUp({ x: 0, y: 1, z: 0 })
  // How hard the controller pushes itself off a surface it is touching. Rapier's
  // default (1e-4) is too small for us: every ~13 steps the capsule snagged on its
  // own floor contact and stopped dead for one frame, which cost ~20% of walking
  // speed and felt like a stutter. 1e-2 removes it (see sim.spec "walks forward").
  controller.setNormalNudgeFactor(0.01)
  controller.setSlideEnabled(true) // walking into a wall at an angle slides along it
  controller.setMaxSlopeClimbAngle((45 * Math.PI) / 180)
  controller.enableAutostep(0.3, 0.2, false) // small ledges don't stop you
  controller.enableSnapToGround(0.2) // walking down a step stays glued to the floor

  // Everything the simulation knows about the player, in plain numbers.
  const s = {
    pos: { x: spawn.x, y: spawn.y, z: spawn.z },
    vel: { x: 0, y: 0, z: 0 }, // the velocity we are trying to have
    moved: { x: 0, y: 0, z: 0 }, // what actually happened last step, after collisions
    grounded: false,
    yaw: Math.PI, // facing -z, away from the camera
  }

  // One fixed step. `move` is the wish in world space, each axis -1..1.
  function update(dt, move) {
    let mx = move.x
    let mz = move.z
    const len = Math.hypot(mx, mz)
    if (len > 1) {
      mx /= len
      mz /= len
    }

    // Horizontal: accelerate towards the wished-for velocity.
    s.vel.x = approach(s.vel.x, mx * MOVE.walkSpeed, MOVE.accel * dt)
    s.vel.z = approach(s.vel.z, mz * MOVE.walkSpeed, MOVE.accel * dt)

    // Vertical: gravity, unless standing. A small downward push while grounded
    // keeps the controller reporting "grounded" on every step.
    s.vel.y = s.grounded ? -1 : Math.max(s.vel.y - MOVE.gravity * dt, -MOVE.maxFall)

    controller.computeColliderMovement(collider, {
      x: s.vel.x * dt,
      y: s.vel.y * dt,
      z: s.vel.z * dt,
    })
    const m = controller.computedMovement()
    s.grounded = controller.computedGrounded()

    s.moved.x = m.x
    s.moved.y = m.y
    s.moved.z = m.z
    s.pos.x += m.x
    s.pos.y += m.y
    s.pos.z += m.z

    // A wall that stopped us also stops the velocity, so letting go of the key
    // next to a wall does not leave a stored-up push.
    if (Math.abs(m.x) < Math.abs(s.vel.x * dt) * 0.5) s.vel.x = m.x / dt
    if (Math.abs(m.z) < Math.abs(s.vel.z * dt) * 0.5) s.vel.z = m.z / dt
    if (s.grounded && s.vel.y < 0) s.vel.y = 0

    // Turn to face where we are going.
    const speed = Math.hypot(m.x, m.z) / dt
    if (speed > 0.5) {
      const target = Math.atan2(m.x, m.z)
      const d = angleDelta(s.yaw, target)
      const maxTurn = MOVE.turnRate * dt
      s.yaw += Math.max(-maxTurn, Math.min(maxTurn, d))
    }

    if (s.pos.y < MOVE.killY) teleport(spawn)
    body.setNextKinematicTranslation(s.pos)
  }

  // Instantly place the body somewhere (respawn, tests). Clears velocity.
  function teleport(p) {
    s.pos.x = p.x
    s.pos.y = p.y
    s.pos.z = p.z
    s.vel.x = s.vel.y = s.vel.z = 0
    s.grounded = false
    body.setTranslation(s.pos, true)
    body.setNextKinematicTranslation(s.pos)
  }

  return { state: s, update, teleport, collider, body, controller }
}
