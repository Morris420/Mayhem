// The training dummy's brain. It doesn't cheat: it produces the same controls a
// player would ({ mx, mz, block, lightPressed, ... }) and drives the same fighter
// kit, so everything it does you can do too. Randomness comes from the
// simulation's seeded rng, never Math.random, so a fight replays identically.
//
// Modes (test hook / later a HUD toggle):
//   auto    wanders, closes in, attacks with strings and heavies, blocks some of
//           your attacks, dashes in and sidesteps
//   idle    stands still: a punching bag
//   block   blocks everything from the front
//   attack  attacks whenever you are in range, never blocks
import { MOVES } from './moves.js'

export const AI = {
  wanderRadius: 12, // wanders inside this distance of the centre
  engageRange: 9, // closes in when you are nearer than this
  attackRange: 1.7, // starts an attack when you are nearer than this
  blockChance: 0.45, // chance to block an attack it sees coming
  blockSeeRange: 3, // ...if you start it this close
  thinkMin: 18, // frames between decisions when in range
  thinkSpread: 30,
  guardKeep: 35, // won't start blocking with less guard than this left
  castSeeRange: 12, // reacts to a spell cast this close...
  castGuardFrames: 24, // ...by guarding this long plus the bolt's flight time
}

export function createBrain(mode = 'auto') {
  return {
    mode,
    target: null, // wander point {x, z}
    wanderTimer: 0,
    thinkTimer: 0,
    blockFor: 0, // frames left holding block
    string: 0, // extra presses left in the current string
    finisher: false, // end the string with heavy
    seenMove: -1, // the opponent's last move it reacted to
    seenCast: -1, // ...and their last cast
  }
}

const idle = () => ({
  mx: 0,
  mz: 0,
  sprint: false,
  jump: false,
  jumpPressed: false,
  lightPressed: false,
  heavyPressed: false,
  block: false,
  dashPressed: false,
  abilityPressed: 0,
})

// One step of thinking. Returns this step's controls for `self`.
export function think(b, self, foe, rng) {
  const ctl = idle()
  if (b.mode === 'idle' || !foe) return ctl
  if (b.mode === 'block') {
    ctl.block = true
    return ctl
  }

  const sc = self.c
  const s = self.body.state.pos
  const f = foe.body.state.pos
  const dx = f.x - s.x
  const dz = f.z - s.z
  const d = Math.sqrt(dx * dx + dz * dz)
  const ux = d > 1e-9 ? dx / d : 0
  const uz = d > 1e-9 ? dz / d : 0
  const canAct = sc.state === 'free' || sc.state === 'block'
  if (b.blockFor > 0) b.blockFor--

  if (foe.c.state === 'ko') return ctl

  // See an attack coming: maybe block it (decided once per attack).
  if (b.mode === 'auto' && foe.c.state === 'attack' && foe.c.moveCount !== b.seenMove) {
    b.seenMove = foe.c.moveCount
    if (d < AI.blockSeeRange && canAct && sc.guard > AI.guardKeep && rng() < AI.blockChance) {
      b.blockFor = MOVES[foe.c.move].startup + MOVES[foe.c.move].active + 14
    }
  }
  // See a spell being cast: maybe guard until it would arrive (1 m = 60/speed frames).
  if (b.mode === 'auto' && foe.c.state === 'cast' && foe.c.castCount !== b.seenCast) {
    b.seenCast = foe.c.castCount
    if (d < AI.castSeeRange && canAct && sc.guard > AI.guardKeep && rng() < AI.blockChance) {
      b.blockFor = AI.castGuardFrames + Math.ceil((d * 60) / 16)
    }
  }
  if (b.blockFor > 0 && canAct) {
    ctl.block = true
    return ctl
  }

  // Mid-string: press the next button once the current move is under way.
  if (sc.state === 'attack') {
    const m = MOVES[sc.move]
    if (b.string > 0 && sc.moveFrame === m.startup && m.next) {
      b.string--
      if (b.string === 0 && b.finisher) ctl.heavyPressed = true
      else ctl.lightPressed = true
    }
    return ctl
  }
  if (sc.state !== 'free') return ctl

  if (b.mode === 'attack') {
    if (d < AI.attackRange) {
      b.string = 2
      b.finisher = false
      ctl.lightPressed = true
    } else {
      ctl.mx = ux
      ctl.mz = uz
    }
    return ctl
  }

  // --- auto ---
  if (d > AI.engageRange) {
    // Wander between random points around the centre, at a stroll.
    const t = b.target
    const reached = t && (t.x - s.x) * (t.x - s.x) + (t.z - s.z) * (t.z - s.z) < 1
    if (!t || reached || --b.wanderTimer <= 0) {
      b.target = { x: (rng() * 2 - 1) * AI.wanderRadius, z: (rng() * 2 - 1) * AI.wanderRadius }
      b.wanderTimer = 180 + Math.floor(rng() * 120)
    }
    const wx = b.target.x - s.x
    const wz = b.target.z - s.z
    const wl = Math.sqrt(wx * wx + wz * wz) || 1
    ctl.mx = (wx / wl) * 0.5
    ctl.mz = (wz / wl) * 0.5
    return ctl
  }

  if (d > AI.attackRange) {
    // Close in; now and then dash in or sidestep.
    ctl.mx = ux
    ctl.mz = uz
    const r = rng()
    if (r < 0.006) ctl.dashPressed = true
    else if (r < 0.01) {
      const side = rng() < 0.5 ? 1 : -1
      ctl.mx = -uz * side
      ctl.mz = ux * side
      ctl.dashPressed = true
    }
    return ctl
  }

  // In range: decide every so often.
  if (--b.thinkTimer > 0) return ctl
  b.thinkTimer = AI.thinkMin + Math.floor(rng() * AI.thinkSpread)
  const r = rng()
  if (r < 0.45) {
    b.string = Math.floor(rng() * 3) // 0, 1 or 2 more hits
    b.finisher = b.string > 0 && rng() < 0.35
    ctl.lightPressed = true
  } else if (r < 0.65) {
    ctl.heavyPressed = true
  } else if (r < 0.85 && sc.guard > AI.guardKeep) {
    b.blockFor = 30 + Math.floor(rng() * 30)
    ctl.block = true
  } else {
    // Sidestep or back off.
    const side = rng() < 0.5 ? 1 : -1
    const back = rng() < 0.4
    ctl.mx = back ? -ux : -uz * side
    ctl.mz = back ? -uz : ux * side
    ctl.dashPressed = true
  }
  return ctl
}
