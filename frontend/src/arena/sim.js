// The headless simulation: the physics world, the room's colliders and the player,
// advanced in fixed steps. No three.js and no DOM, so the same code runs in the
// browser (wrapped by engine.js) and in unit tests under Node.
//
// Everything that decides what happens lives here and only moves on step(). The
// renderer only ever *reads* it. That split is what makes the game deterministic:
// same seed + same inputs, step by step = same state, every time.
import { buildRoomPhysics } from './world.js'
import { createPlayer } from './player.js'
import { STEP_S } from './loop.js'

// Small seeded PRNG (mulberry32). Nothing in M1 is random; it exists now so the
// boss in M4 draws from the server's seed instead of Math.random().
export function createRng(seed) {
  let a = seed >>> 0
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// The camera is locked behind the player looking towards -z, so "stick forward"
// means world -z and "stick right" means world +x. When the camera can orbit
// (open question, playbook §9) this is the one function that changes.
export function stickToWorld(stick) {
  return { x: stick.x, z: -stick.y }
}

// RAPIER must already be initialised (await RAPIER.init()).
export function createSimulation(RAPIER, room, { seed = 1 } = {}) {
  // Gravity is applied by the character controller ourselves; nothing in M1 is a
  // dynamic body, so the world's own gravity is left at zero.
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 })
  world.timestep = STEP_S
  buildRoomPhysics(RAPIER, world, room)
  const player = createPlayer(RAPIER, world, room.spawn)

  let tick = 0
  let currentSeed = seed
  let rng = createRng(seed)
  // The stick: x = right, y = forward, each -1..1. Held until changed.
  const stick = { x: 0, y: 0 }

  function step() {
    player.update(STEP_S, stickToWorld(stick))
    world.step()
    tick++
  }

  function setStick(x, y) {
    stick.x = Math.max(-1, Math.min(1, Number(x) || 0))
    stick.y = Math.max(-1, Math.min(1, Number(y) || 0))
  }

  // A plain-object snapshot, safe to JSON and compare in a test.
  function state() {
    const p = player.state
    return {
      tick,
      time: tick * STEP_S,
      seed: currentSeed,
      phase: 'explore', // M4 adds 'fight', 'won', 'lost'
      input: { x: stick.x, y: stick.y },
      player: {
        pos: { ...p.pos },
        vel: { ...p.vel },
        grounded: p.grounded,
        yaw: p.yaw,
        hp: null, // M3: from /api/arena/loadout
        stamina: null,
      },
      boss: null, // M4
    }
  }

  return {
    step,
    setStick,
    state,
    teleport: (pos) => player.teleport(pos),
    seed(n) {
      currentSeed = n >>> 0
      rng = createRng(currentSeed)
    },
    random: () => rng(),
    player,
    room,
    dispose() {
      // The controller lives outside the world's sets, so it is freed on its own;
      // world.free() then releases every body and collider in one go.
      world.removeCharacterController(player.controller)
      world.free()
    },
  }
}
