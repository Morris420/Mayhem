// The headless simulation: the room's collision boxes and the player, advanced in
// fixed steps. No three.js, no DOM, no physics library, so the same code runs in
// the browser (wrapped by engine.js), in unit tests under Node, and later in a
// Node verifier on the server.
//
// Everything that decides what happens lives here and only moves on step(). The
// renderer only ever *reads* it. Same seed + same inputs, step by step = same
// state, on every machine: that is what online rollback play is built on
// (arena-design.md §0), and snapshot()/restore() are its save and load.
import { createCollisionWorld } from './physics.js'
import { createPlayer } from './player.js'
import { STEP_S } from './loop.js'

// Small seeded PRNG (mulberry32). Integer maths only, so identical everywhere.
// Nothing uses it yet; it exists so the boss draws from the server's seed
// instead of Math.random().
export function createRng(seed) {
  const rng = {
    a: seed >>> 0,
    next() {
      rng.a = (rng.a + 0x6d2b79f5) >>> 0
      let t = rng.a
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    },
  }
  return rng
}

// The camera is locked behind the player looking towards -z, so "stick forward"
// means world -z and "stick right" means world +x. When the camera can orbit this
// is the one function that changes.
export function stickToWorld(stick) {
  return { x: stick.x, z: -stick.y }
}

const clone = (o) => JSON.parse(JSON.stringify(o))

export function createSimulation(room, { seed = 1 } = {}) {
  const world = createCollisionWorld(room)
  const player = createPlayer(world, room.spawn)

  let tick = 0
  let currentSeed = seed
  let rng = createRng(seed)
  // The controls, held until changed. Stick: x = right, y = forward, each -1..1.
  const input = { x: 0, y: 0, sprint: false, jump: false }
  let jumpWasHeld = false
  let queuedJump = false // a press from press('jump')...
  let pressHolding = false // ...which then counts as held until the jump peaks

  function step() {
    // The press is detected here, inside the step, so it is part of the
    // deterministic input stream and never depends on when a key event arrived.
    const jumpPressed = (input.jump && !jumpWasHeld) || queuedJump
    jumpWasHeld = input.jump
    if (queuedJump) pressHolding = true
    queuedJump = false
    player.update(STEP_S, {
      move: stickToWorld(input),
      sprint: input.sprint,
      jumpHeld: input.jump || pressHolding,
      jumpPressed,
    })
    if (pressHolding && player.state.vel.y <= 0 && !player.state.fromJump) pressHolding = false
    tick++
  }

  const clampAxis = (v) => Math.max(-1, Math.min(1, Number(v) || 0))

  function setStick(x, y) {
    input.x = clampAxis(x)
    input.y = clampAxis(y)
  }

  // Partial update: only the fields given change. { x, y, sprint, jump }
  function setInput(next = {}) {
    if ('x' in next) input.x = clampAxis(next.x)
    if ('y' in next) input.y = clampAxis(next.y)
    if ('sprint' in next) input.sprint = !!next.sprint
    if ('jump' in next) input.jump = !!next.jump
  }

  // A full jump in one call (tests, the boss AI later): pressed now and treated
  // as held until the jump peaks. For a short hop, hold jump via setInput and
  // release it early instead.
  function press(button) {
    if (button !== 'jump') throw new Error(`Unknown button: ${button}`)
    queuedJump = true
  }

  // A plain-object snapshot, safe to JSON and compare in a test.
  function state() {
    const p = player.state
    return {
      tick,
      time: tick * STEP_S,
      seed: currentSeed,
      phase: 'explore', // the fight adds 'fight', 'won', 'lost'
      input: { ...input },
      player: {
        pos: { ...p.pos },
        vel: { ...p.vel },
        grounded: p.grounded,
        sprinting: p.sprinting,
        wall: p.wall ? { ...p.wall } : null,
        jumps: p.jumps,
        lastJump: p.lastJump,
        facing: { ...p.facing },
        // For the renderer and humans. Derived with atan2, so not part of the
        // deterministic state: compare `facing`, never `yaw`, across machines.
        yaw: Math.atan2(p.facing.x, p.facing.z),
        hp: null, // from /api/arena/loadout, later
        stamina: null,
      },
      boss: null,
    }
  }

  // Everything needed to rewind: the whole state as plain data.
  function snapshot() {
    return clone({
      tick,
      seed: currentSeed,
      rng: rng.a,
      input,
      jumpWasHeld,
      queuedJump,
      pressHolding,
      player: player.state,
    })
  }

  function restore(snap) {
    const s = clone(snap)
    tick = s.tick
    currentSeed = s.seed
    rng = createRng(0)
    rng.a = s.rng
    Object.assign(input, s.input)
    jumpWasHeld = s.jumpWasHeld
    queuedJump = s.queuedJump
    pressHolding = s.pressHolding
    Object.assign(player.state, s.player)
  }

  return {
    step,
    setStick,
    setInput,
    press,
    state,
    snapshot,
    restore,
    teleport: (pos) => player.teleport(pos),
    seed(n) {
      currentSeed = n >>> 0
      rng = createRng(currentSeed)
    },
    random: () => rng.next(),
    player,
    room,
    world,
    dispose() {}, // nothing to free any more: plain JS objects
  }
}
