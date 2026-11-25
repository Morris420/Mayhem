// Abilities: casting, cooldowns and projectiles (no mana: Morrison, 25 Nov). Part of the deterministic
// simulation (same rules as combat.js: only + - * /, sqrt, floor/ceil/min/max/abs,
// everything processed in array order), so a fire bolt rewinds and replays like
// a punch does.
//
// Which abilities you have and how hard they hit are NOT decided here: they come
// from the server (GET /api/arena/loadout, backend ArenaRules) and are handed to
// the sim as fighter options. This file only holds the feel numbers (frames,
// speeds, sizes), like moves.js does for attacks.
//
// A cast: press the ability's key (Q / E / R = slots 1-3) while free or guarding,
// on the ground, off cooldown. You stand and wind up (`startup` frames,
// interruptible: get hit and the cooldown is spent anyway), the spell leaves your
// hand, then `recovery` frames before you can act. An ability with `move` is a
// technique instead of a spell: it starts that move from moves.js.
import { MOVE } from './player.js'
import { COMBAT } from './moves.js'

//   cooldown   frames before the slot can be used again (counted from the cast)
//   startup    wind-up frames before the bolt leaves your hand
//   recovery   frames after it leaves, before you can act again
//   aimRange   the cast turns you towards an opponent this close (metres)
//   speed      m/s the bolt flies (flat)
//   homing     how hard it bends towards the nearest enemy each step (0 = straight).
//              Gentle on purpose: a bolt aimed well flies straight; one that goes
//              wide curves back in, but a dash or a sidestep still beats it.
//   life       frames before it fizzles: speed x life / 60 = range in metres
//   radius     size of the bolt's hit sphere, metres
//   height     metres above the caster's body centre it flies at
//   damage     health taken on hit, before the caster's ability power (%)
//   guard      guard meter taken from a blocker
//   hitstun / blockstun / push / hitstop   as in moves.js (hitstop: the target only)
export const ABILITIES = {
  fire_bolt: {
    name: 'Fire bolt',
    cooldown: 150, // 2.5 s
    startup: 14,
    recovery: 16,
    aimRange: 14,
    speed: 16,
    homing: 0.07,
    homingDelay: 6, // frames of straight flight before it starts to curve
    life: 66, // ~17 m of flight
    radius: 0.35,
    height: 0.35,
    damage: 10,
    guard: 20,
    hitstun: 22,
    blockstun: 12,
    push: 3,
    hitstop: 6,
  },
  // Unlocked by beating the Shadow Knight: his charge-and-dash slash, yours now.
  shadow_slash: {
    name: 'Shadow slash',
    cooldown: 360, // 6 s
    move: 'SHADOW_SLASH',
  },
}

// What every fighter gets when no loadout is given (unit tests, the dummy, the
// server unreachable): the tuned numbers, no abilities.
export const BASE_LOADOUT = {
  stats: { health: 100, guard: 100, damage: 100, ability_power: 100 },
  abilities: [],
}

const int = (v, lo, hi, dflt) => {
  const n = Math.floor(Number(v))
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : dflt
}

// The server's loadout JSON -> what a fighter needs. Defensive: anything odd falls
// back to the base numbers, and only abilities this client knows can be slotted.
export function fighterLoadout(loadout = BASE_LOADOUT) {
  const s = loadout?.stats ?? {}
  const b = BASE_LOADOUT.stats
  const slots = [null, null, null]
  for (const a of loadout?.abilities ?? []) {
    const slot = int(a?.slot, 1, 3, 0)
    if (a?.unlocked && ABILITIES[a.slug] && slot) slots[slot - 1] = a.slug
  }
  return {
    hp: int(s.health, 1, 999, b.health),
    guard: int(s.guard, 1, 999, b.guard),
    damage: int(s.damage, 1, 500, b.damage), // % of the frame data's damage
    power: int(s.ability_power, 1, 500, b.ability_power), // % of an ability's damage
    slots,
  }
}

// A damage number scaled by a percentage, rounded to a whole point of health.
export const scaled = (base, pct) => Math.floor((base * pct) / 100 + 0.5)

export const castFrames = (ab) => ab.startup + ab.recovery

// Can `f` start the ability in `slot` (0-based) right now?
export function canCast(f, slot) {
  const c = f.c
  const id = c.slots[slot]
  if (!id) return false
  return (
    (c.state === 'free' || c.state === 'block') && f.body.state.grounded && c.cooldowns[slot] === 0
  )
}

export function startCast(f, slot, opp) {
  const c = f.c
  const s = f.body.state
  const ab = ABILITIES[c.slots[slot]]
  c.state = 'cast'
  c.cast = slot
  c.castFrame = 0
  c.castCount++
  c.released = false
  c.cooldowns[slot] = ab.cooldown
  c.queued = null
  if (opp && opp.d < ab.aimRange && opp.d > 1e-6) {
    s.facing.x = opp.x
    s.facing.z = opp.z
  }
}

// Cooldowns, once per (unfrozen) step.
export function tickAbilities(c) {
  for (let i = 0; i < c.cooldowns.length; i++) if (c.cooldowns[i] > 0) c.cooldowns[i]--
}

// The cast's own frames. Returns true when the spell should leave the hand this
// step (the sim then spawns it).
export function stepCast(f) {
  const c = f.c
  const ab = ABILITIES[c.slots[c.cast]]
  c.castFrame++
  let release = false
  if (!c.released && c.castFrame >= ab.startup) {
    c.released = true
    release = true
  }
  if (c.castFrame >= castFrames(ab)) {
    c.state = 'free'
    c.cast = null
  }
  return release
}

// A new projectile from fighter `f`'s current cast, in front of them.
export function spawnProjectile(f, id) {
  const c = f.c
  const s = f.body.state
  const kind = c.slots[c.cast]
  const ab = ABILITIES[kind]
  const out = MOVE.radius + ab.radius + 0.05 // starts just outside your own body
  return {
    id,
    kind,
    owner: f.id,
    team: c.team,
    age: 0,
    x: s.pos.x + s.facing.x * out,
    y: s.pos.y + ab.height,
    z: s.pos.z + s.facing.z * out,
    vx: s.facing.x * ab.speed,
    vz: s.facing.z * ab.speed,
    life: ab.life,
    power: c.power,
  }
}

// Bend a projectile's flight a little towards the nearest enemy in front of it.
// Normalised blend of the current direction and the direction to the target, so
// the speed never changes and the turn per step stays small.
function steer(p, ab, fighters, canBeHit) {
  p.age = (p.age ?? 0) + 1
  if (p.age <= (ab.homingDelay ?? 0)) return
  const sp = Math.sqrt(p.vx * p.vx + p.vz * p.vz)
  if (sp < 1e-6) return
  const ux = p.vx / sp
  const uz = p.vz / sp
  let best = null
  let bestD2 = Infinity
  for (const t of fighters) {
    if (t.id === p.owner || t.c.team === p.team || !canBeHit(t)) continue
    const dx = t.body.state.pos.x - p.x
    const dz = t.body.state.pos.z - p.z
    const d2 = dx * dx + dz * dz
    if (d2 < 1e-6 || d2 >= bestD2) continue
    if (dx * ux + dz * uz <= 0) continue // only what is still ahead of it
    best = { dx, dz }
    bestD2 = d2
  }
  if (!best) return
  const d = Math.sqrt(bestD2)
  let nx = ux + (best.dx / d) * ab.homing
  let nz = uz + (best.dz / d) * ab.homing
  const n = Math.sqrt(nx * nx + nz * nz)
  nx /= n
  nz /= n
  p.vx = nx * sp
  p.vz = nz * sp
}

const SUBSTEPS = 2 // 16 m/s = 0.27 m a step; halve it so nothing is skipped

function insideBox(world, x, y, z, r) {
  for (const b of world) {
    if (
      x + r > b.minX &&
      x - r < b.maxX &&
      y + r > b.minY &&
      y - r < b.maxY &&
      z + r > b.minZ &&
      z - r < b.maxZ
    )
      return true
  }
  return false
}

// Move every projectile one step. `hit(projectile, target)` is called when one
// touches a fighter it can hit (combat.js decides block / damage) and returns the
// event. Fighters who can't be hit right now (dash i-frames, down, KO) let it fly
// through: that is how you dodge one. Walls and ledges stop it.
// Returns { projectiles, events } — the survivors, in their original order.
export function stepProjectiles(projectiles, world, fighters, canBeHit, hit, dt) {
  const keep = []
  const events = []
  for (const p of projectiles) {
    const ab = ABILITIES[p.kind]
    let alive = true
    if (ab.homing) steer(p, ab, fighters, canBeHit)
    for (let k = 0; k < SUBSTEPS && alive; k++) {
      p.x += (p.vx * dt) / SUBSTEPS
      p.z += (p.vz * dt) / SUBSTEPS
      if (insideBox(world, p.x, p.y, p.z, ab.radius)) {
        alive = false
        events.push({ type: 'fizzle', kind: p.kind, owner: p.owner, x: p.x, y: p.y, z: p.z })
        break
      }
      const reach = ab.radius + MOVE.radius
      for (const t of fighters) {
        if (t.id === p.owner || t.c.team === p.team || !canBeHit(t)) continue
        const ts = t.body.state
        const dx = ts.pos.x - p.x
        const dz = ts.pos.z - p.z
        if (dx * dx + dz * dz > reach * reach) continue
        if (Math.abs(ts.pos.y - p.y) > COMBAT.hitHeight) continue
        events.push(hit(p, t))
        alive = false
        break
      }
    }
    if (alive && --p.life <= 0) {
      alive = false
      events.push({ type: 'fizzle', kind: p.kind, owner: p.owner, x: p.x, y: p.y, z: p.z })
    }
    if (alive) keep.push(p)
  }
  return { projectiles: keep, events }
}
