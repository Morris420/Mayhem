// The headless simulation: the room's collision boxes and the fighters, advanced
// in fixed steps. No three.js, no DOM, no physics library, so the same code runs
// in the browser (wrapped by engine.js), in unit tests under Node, and later in a
// Node verifier on the server.
//
// Everything that decides what happens lives here and only moves on step(). The
// renderer only ever *reads* it. Same seed + same inputs, step by step = same
// state, on every machine: that is what online rollback play is built on
// (arena-design.md §0), and snapshot()/restore() are its save and load.
import { createCollisionWorld } from './physics.js'
import {
  canBeHit,
  createFighter,
  projectileHit,
  resolveHits,
  separate,
  stepFighter,
} from './combat.js'
import { spawnProjectile, stepProjectiles } from './abilities.js'
import { createBrain, think } from './ai.js'
import { STEP_S } from './loop.js'

// Small seeded PRNG (mulberry32). Integer maths only, so identical everywhere.
// The dummy's brain draws from it, so a fight replays identically.
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

// The stick is relative to the camera: "forward" is the way the camera looks.
// `view` is the camera's horizontal direction as a unit vector, sent with the
// input (so it is part of the recorded, deterministic input stream, like the
// stick itself). Default: looking towards -z, the fixed exploring camera.
export function stickToWorld(stick, view = { x: 0, z: -1 }) {
  // right = forward turned 90° clockwise seen from above: (-z, x)
  return {
    x: stick.x * -view.z + stick.y * view.x,
    z: stick.x * view.x + stick.y * view.z,
  }
}

const BUTTONS = ['jump', 'light', 'heavy', 'block', 'dash', 'ability1', 'ability2', 'ability3']
const TAPS = ['jump', 'light', 'heavy', 'dash', 'ability1', 'ability2', 'ability3']
const clone = (o) => JSON.parse(JSON.stringify(o))

// options.dummy: 'auto' | 'idle' | 'block' | 'attack' | 'none' (no dummy at all)
// options.loadout: the player's stat block from the server (GET /api/arena/loadout).
//   An input to the simulation, like the controls: it is never computed here.
// options.dummyLoadout: the same for the dummy (default: the base numbers).
export function createSimulation(room, { seed = 1, dummy = 'none', loadout, dummyLoadout } = {}) {
  const world = createCollisionWorld(room)
  const fighters = [
    createFighter(world, { id: 'player', spawn: room.spawn, facing: { x: 0, z: -1 }, loadout }),
  ]
  if (dummy !== 'none' && room.dummySpawn) {
    fighters.push(
      createFighter(world, {
        id: 'dummy',
        spawn: room.dummySpawn,
        facing: { x: 0, z: 1 },
        loadout: dummyLoadout,
      }),
    )
  }
  const [hero] = fighters
  const brain = createBrain(dummy === 'none' ? 'idle' : dummy)

  let tick = 0
  let currentSeed = seed
  let rng = createRng(seed)
  const random = () => rng.next()
  // The player's controls, held until changed. Stick: x = right, y = forward.
  const input = {
    x: 0,
    y: 0,
    sprint: false,
    jump: false,
    light: false,
    heavy: false,
    block: false,
    dash: false,
    ability1: false,
    ability2: false,
    ability3: false,
    view: { x: 0, z: -1 }, // the camera direction the stick is relative to
  }
  const wasHeld = Object.fromEntries(TAPS.map((b) => [b, false]))
  const queued = Object.fromEntries(TAPS.map((b) => [b, false])) // press() taps
  let pressHolding = false // a press('jump') counts as held until the jump peaks
  let events = []
  let projectiles = [] // fire bolts in flight (abilities.js), in spawn order
  let nextProjectile = 1

  function heroControls() {
    const pressed = {}
    for (const b of TAPS) {
      pressed[b] = (input[b] && !wasHeld[b]) || queued[b]
      wasHeld[b] = input[b]
    }
    if (queued.jump) pressHolding = true
    for (const b in queued) queued[b] = false
    const move = stickToWorld(input, input.view)
    return {
      mx: move.x,
      mz: move.z,
      sprint: input.sprint,
      jump: input.jump || pressHolding,
      jumpPressed: pressed.jump,
      lightPressed: pressed.light,
      heavyPressed: pressed.heavy,
      block: input.block,
      dashPressed: pressed.dash,
      abilityPressed: pressed.ability1 ? 1 : pressed.ability2 ? 2 : pressed.ability3 ? 3 : 0,
    }
  }

  function step() {
    // Everyone decides from the same moment, then everyone moves, then hits land.
    const controls = fighters.map((f) =>
      f === hero ? heroControls() : think(brain, f, hero, random),
    )
    fighters.forEach((f, i) => {
      // A spell leaving the hand this step becomes a projectile (flies from next step).
      if (stepFighter(f, controls[i], fighters, STEP_S))
        projectiles.push(spawnProjectile(f, nextProjectile++))
    })
    if (pressHolding && hero.body.state.vel.y <= 0 && !hero.body.state.fromJump)
      pressHolding = false
    separate(world, fighters)
    events = resolveHits(fighters)
    const flown = stepProjectiles(projectiles, world, fighters, canBeHit, projectileHit, STEP_S)
    projectiles = flown.projectiles
    events.push(...flown.events)
    for (const e of events) e.tick = tick
    tick++
  }

  const clampAxis = (v) => Math.max(-1, Math.min(1, Number(v) || 0))

  function setStick(x, y) {
    input.x = clampAxis(x)
    input.y = clampAxis(y)
  }

  // Partial update: only the fields given change.
  // { x, y, sprint, jump, light, heavy, block, dash }
  function setInput(next = {}) {
    if (next.view) {
      const l = Math.sqrt(next.view.x * next.view.x + next.view.z * next.view.z)
      if (l > 1e-6) input.view = { x: next.view.x / l, z: next.view.z / l }
    }
    if ('x' in next) input.x = clampAxis(next.x)
    if ('y' in next) input.y = clampAxis(next.y)
    if ('sprint' in next) input.sprint = !!next.sprint
    for (const b of BUTTONS) if (b in next) input[b] = !!next[b]
  }

  // A tap of one button on the next step: 'jump' | 'light' | 'heavy' | 'dash' |
  // 'ability1' | 'ability2' | 'ability3'.
  // A tapped jump is a full jump (held until it peaks); for a short hop, hold
  // jump via setInput and release it early instead.
  function press(button) {
    if (!(button in queued)) throw new Error(`Unknown button: ${button}`)
    queued[button] = true
  }

  function fighterState(f) {
    const p = f.body.state
    const c = f.c
    return {
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
      hp: c.hp,
      maxHp: c.maxHp,
      combat: c.state,
      timer: c.timer,
      move: c.move,
      moveFrame: c.moveFrame,
      moveCount: c.moveCount,
      hitstop: c.hitstop,
      guard: c.guard,
      guardMax: c.guardMax,
      invuln: c.invuln,
      juggle: c.juggle,
      mana: c.mana,
      manaMax: c.manaMax,
      damage: c.damage,
      power: c.power,
      slots: [...c.slots],
      cooldowns: [...c.cooldowns],
      cast: c.cast,
      castFrame: c.castFrame,
      castCount: c.castCount,
    }
  }

  // A plain-object snapshot, safe to JSON and compare in a test.
  function state() {
    return {
      tick,
      time: tick * STEP_S,
      seed: currentSeed,
      phase: 'training', // a real fight adds 'fight', 'won', 'lost'
      input: { ...input },
      player: fighterState(hero),
      dummy: fighters[1] ? { ...fighterState(fighters[1]), mode: brain.mode } : null,
      projectiles: projectiles.map((p) => ({ ...p })),
      events: events.map((e) => ({ ...e })),
    }
  }

  // Everything needed to rewind: the whole state as plain data.
  function snapshot() {
    return clone({
      tick,
      seed: currentSeed,
      rng: rng.a,
      input,
      wasHeld,
      queued,
      pressHolding,
      brain,
      projectiles,
      nextProjectile,
      fighters: fighters.map((f) => ({ body: f.body.state, c: f.c })),
    })
  }

  function restore(snap) {
    const s = clone(snap)
    tick = s.tick
    currentSeed = s.seed
    rng = createRng(0)
    rng.a = s.rng
    Object.assign(input, s.input)
    Object.assign(wasHeld, s.wasHeld)
    Object.assign(queued, s.queued)
    pressHolding = s.pressHolding
    Object.assign(brain, s.brain)
    projectiles = s.projectiles
    nextProjectile = s.nextProjectile
    s.fighters.forEach((saved, i) => {
      Object.assign(fighters[i].body.state, saved.body)
      Object.assign(fighters[i].c, saved.c)
    })
    events = []
  }

  return {
    step,
    setStick,
    setInput,
    press,
    state,
    snapshot,
    restore,
    teleport: (pos) => hero.body.teleport(pos),
    teleportDummy: (pos) => fighters[1]?.body.teleport(pos),
    setDummyMode(mode) {
      if (!['auto', 'idle', 'block', 'attack'].includes(mode))
        throw new Error(`Unknown mode: ${mode}`)
      brain.mode = mode
      brain.blockFor = 0
      brain.string = 0
    },
    seed(n) {
      currentSeed = n >>> 0
      rng = createRng(currentSeed)
    },
    random,
    fighters,
    player: hero.body, // the player's body (kept for the renderer and older tests)
    room,
    world,
    dispose() {}, // nothing to free: plain JS objects
  }
}
