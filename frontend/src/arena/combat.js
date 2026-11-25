// Fighters and the fight: a body (player.js) plus a combat state machine, hit
// resolution, blocking, dashing and pushboxes. Deterministic like the rest of the
// simulation: plain numbers, only + - * / and sqrt, fighters processed in array
// order. Works for any number of fighters, so a free-for-all is not a rewrite.
//
// A fighter's combat state is one of:
//   free       walking, running, jumping; can start anything
//   attack     in a move from moves.js (startup -> active -> recovery)
//   block      holding block: no damage from the front
//   blockstun  just blocked a hit, can't act for a moment
//   guardbreak the guard meter ran out: stunned and wide open
//   hitstun    just got hit, can't act (this is what makes combos possible)
//   dash       a quick burst; the first frames dodge everything
//   down       knocked off their feet
//   getup      standing back up (can't be hit)
//   ko         out of health; back on their feet with full health after a while
import { createPlayer, MOVE, SHAPE } from './player.js'
import { moveBody } from './physics.js'
import { COMBAT, MOVES, moveFrames } from './moves.js'

const UNHITTABLE = new Set(['down', 'getup', 'ko'])

export function createFighter(world, { id, spawn, facing = { x: 0, z: -1 } }) {
  const body = createPlayer(world, spawn)
  body.state.facing = { x: facing.x, z: facing.z }
  const c = {
    hp: COMBAT.maxHp,
    maxHp: COMBAT.maxHp,
    state: 'free',
    timer: 0, // frames left in hitstun / blockstun / dash / down / getup / ko
    move: null, // id in MOVES while attacking
    moveFrame: 0, // frames into the current move
    moveCount: 0, // counts every move started, so the renderer can restart its animation
    queued: null, // the next move of a string, if its button was pressed in time
    hitDone: false, // the current move already connected (one hit per move)
    hitstop: 0, // frames frozen by an impact
    invuln: 0, // frames nothing can hit you
    dashCd: 0, // frames before you can dash again
    juggle: 0, // hits taken since you last recovered (the combo counter)
    guard: COMBAT.guardMax, // the guard meter: blocking drains it, it refills when you stop
    guardMax: COMBAT.guardMax,
    guardDelay: 0, // frames before the guard starts refilling
    buf: null, // a recent attack press not used yet: 'light' | 'heavy'
    bufFrames: 0, // ...and how many more frames it stays valid
  }
  return { id, body, c, spawn: { ...spawn }, spawnFacing: { ...facing } }
}

// The closest other fighter that is still standing, with direction and distance.
function nearestOpponent(f, fighters) {
  let best = null
  const p = f.body.state.pos
  for (const o of fighters) {
    if (o === f || o.c.state === 'ko') continue
    const q = o.body.state.pos
    const dx = q.x - p.x
    const dz = q.z - p.z
    const d2 = dx * dx + dz * dz
    if (!best || d2 < best.d2) best = { f: o, dx, dz, d2 }
  }
  if (!best) return null
  const d = Math.sqrt(best.d2)
  return { f: best.f, d, x: d > 1e-9 ? best.dx / d : 0, z: d > 1e-9 ? best.dz / d : 0 }
}

function startMove(f, id, opp) {
  const m = MOVES[id]
  const c = f.c
  const s = f.body.state
  c.state = 'attack'
  c.move = id
  c.moveFrame = 0
  c.moveCount++
  c.queued = null
  c.hitDone = false
  // Soft lock-on: starting an attack near an opponent turns you to face them.
  if (opp && opp.d < COMBAT.autoFaceRange && opp.d > 1e-6) {
    s.facing.x = opp.x
    s.facing.z = opp.z
  }
  if (m.lunge && s.grounded) {
    s.vel.x = s.facing.x * m.lunge
    s.vel.z = s.facing.z * m.lunge
  }
}

function startDash(f, ctl) {
  const c = f.c
  const s = f.body.state
  let dx = ctl.mx
  let dz = ctl.mz
  const len2 = dx * dx + dz * dz
  if (len2 < 0.04) {
    // No direction held: dash backwards, away from where you face (a backdash).
    dx = -s.facing.x
    dz = -s.facing.z
  } else {
    const len = Math.sqrt(len2)
    dx /= len
    dz /= len
  }
  s.vel.x = dx * COMBAT.dashSpeed
  s.vel.z = dz * COMBAT.dashSpeed
  s.lock = COMBAT.dashMoveFrames / 60
  c.state = 'dash'
  c.timer = COMBAT.dashFrames
  c.invuln = COMBAT.dashInvuln
  c.dashCd = COMBAT.dashFrames + COMBAT.dashCooldown
}

function respawn(f) {
  const c = f.c
  f.body.teleport(f.spawn)
  f.body.state.facing.x = f.spawnFacing.x
  f.body.state.facing.z = f.spawnFacing.z
  c.hp = c.maxHp
  c.guard = c.guardMax
  c.state = 'free'
  c.timer = 0
  c.move = null
  c.queued = null
  c.juggle = 0
  c.invuln = 30
}

// The guard ran out: stunned, open to anything, guard refills from empty.
function breakGuard(f) {
  const c = f.c
  c.guard = 0
  c.state = 'guardbreak'
  c.timer = COMBAT.guardBreakFrames
  c.guardDelay = COMBAT.guardBreakFrames
}

// One fixed step of one fighter. ctl = its controls this step, in world space:
//   { mx, mz, sprint, jump, jumpPressed, lightPressed, heavyPressed, block, dashPressed }
export function stepFighter(f, ctl, fighters, dt) {
  const c = f.c
  const s = f.body.state

  // Input buffer: an attack press is remembered for a few frames, so pressing
  // during the hitstop freeze or the last frames of a move still counts. Without
  // it, presses made exactly on impact (when players make them) were lost.
  if (ctl.lightPressed || ctl.heavyPressed) {
    c.buf = ctl.lightPressed ? 'light' : 'heavy'
    c.bufFrames = COMBAT.inputBuffer
  }

  // Frozen by an impact: nothing moves, no timer runs. Both fighters freeze the
  // same number of frames, so the frame advantage is untouched.
  if (c.hitstop > 0) {
    c.hitstop--
    return
  }
  const pressedBtn = c.bufFrames > 0 ? c.buf : null
  if (c.bufFrames > 0 && --c.bufFrames === 0) c.buf = null
  const useBuffer = () => {
    c.buf = null
    c.bufFrames = 0
  }
  ctl = {
    ...ctl,
    lightPressed: pressedBtn === 'light',
    heavyPressed: pressedBtn === 'heavy',
  }
  if (c.invuln > 0) c.invuln--
  if (c.dashCd > 0) c.dashCd--

  // The guard meter: holding block costs a little, then it refills after a pause.
  if (c.state === 'block') {
    c.guard = Math.max(0, c.guard - COMBAT.guardHoldDrain / 60)
    c.guardDelay = COMBAT.guardRegenDelay
  } else if (c.guardDelay > 0) {
    c.guardDelay--
  } else if (c.state !== 'guardbreak') {
    c.guard = Math.min(c.guardMax, c.guard + COMBAT.guardRegen / 60)
  }
  const canGuard = c.guard >= COMBAT.guardMinToBlock

  const opp = nearestOpponent(f, fighters)
  const keepFacing = { x: s.facing.x, z: s.facing.z }

  // --- timers and transitions ---
  switch (c.state) {
    case 'ko':
      if (--c.timer <= 0) respawn(f)
      break
    case 'down':
      if (--c.timer <= 0) {
        c.state = 'getup'
        c.timer = COMBAT.getupFrames
        c.invuln = COMBAT.getupFrames
      }
      break
    case 'dash':
      // The burst is over: brake hard instead of sliding on for metres.
      if (c.timer === COMBAT.dashFrames - COMBAT.dashMoveFrames) {
        s.vel.x *= COMBAT.dashBrake
        s.vel.z *= COMBAT.dashBrake
      }
      if (--c.timer <= 0) c.state = 'free'
      break
    case 'getup':
    case 'hitstun':
    case 'blockstun':
    case 'guardbreak':
      if (--c.timer <= 0) {
        c.state = 'free'
        c.juggle = 0
      }
      break
    case 'block':
      if (c.guard <= 0) breakGuard(f)
      else if (!ctl.block) c.state = 'free'
      else if (ctl.dashPressed && c.dashCd === 0) startDash(f, ctl)
      else if (ctl.lightPressed) {
        useBuffer()
        startMove(f, 'L1', opp)
      } else if (ctl.heavyPressed) {
        useBuffer()
        startMove(f, 'H', opp)
      }
      break
    case 'attack': {
      const m = MOVES[c.move]
      c.moveFrame++
      const btn = ctl.lightPressed ? 'light' : ctl.heavyPressed ? 'heavy' : null
      if (btn && m.next?.[btn] && !c.queued) {
        c.queued = m.next[btn]
        useBuffer()
      }
      if (m.air && s.grounded && c.moveFrame > 1) {
        c.state = 'free' // a jump attack ends when you land
      } else if (c.queued && c.moveFrame >= m.startup + m.active) {
        startMove(f, c.queued, opp) // the string continues
      } else if (c.moveFrame >= moveFrames(m)) {
        c.state = 'free'
      }
      break
    }
  }

  if (c.state === 'free') {
    if (ctl.dashPressed && s.grounded && c.dashCd === 0) startDash(f, ctl)
    else if (ctl.lightPressed) {
      useBuffer()
      startMove(f, s.grounded ? 'L1' : 'AIR', opp)
    } else if (ctl.heavyPressed && s.grounded) {
      useBuffer()
      startMove(f, 'H', opp)
    } else if (ctl.block && s.grounded && canGuard) c.state = 'block'
  }

  // --- what the body may do in this state ---
  const still = { x: 0, z: 0 }
  let move = still
  let face = keepFacing
  let jump = false
  let jumpPressed = false
  let sprint = false
  if (c.state === 'free') {
    move = { x: ctl.mx, z: ctl.mz }
    face = null
    jump = ctl.jump
    jumpPressed = ctl.jumpPressed
    sprint = ctl.sprint
  } else if (c.state === 'block') {
    if (opp && opp.d < COMBAT.blockFaceRange && opp.d > 1e-6) face = { x: opp.x, z: opp.z }
  } else if (c.state === 'attack' && MOVES[c.move].air) {
    move = { x: ctl.mx, z: ctl.mz } // keep steering a jump attack
  }
  f.body.update(dt, { move, sprint, jumpHeld: jump, jumpPressed, face })
}

// Fighters can't stand inside each other: push overlapping pairs apart, half
// each, without pushing anyone through a wall.
export function separate(world, fighters) {
  const min = 2 * MOVE.radius
  for (let i = 0; i < fighters.length; i++) {
    for (let j = i + 1; j < fighters.length; j++) {
      const a = fighters[i].body.state.pos
      const b = fighters[j].body.state.pos
      if (Math.abs(a.y - b.y) >= 1.8) continue
      const dx = b.x - a.x
      const dz = b.z - a.z
      const d2 = dx * dx + dz * dz
      if (d2 >= min * min) continue
      const d = Math.sqrt(d2)
      const nx = d > 1e-9 ? dx / d : 1
      const nz = d > 1e-9 ? dz / d : 0
      const push = (min - d) / 2 + 1e-4
      moveBody(world, a, -nx * push, 0, -nz * push, SHAPE, {})
      moveBody(world, b, nx * push, 0, nz * push, SHAPE, {})
    }
  }
}

// Every attack in its active frames checks every other fighter. Returns the
// step's events (hits and blocks) for the renderer and the HUD.
export function resolveHits(fighters) {
  const events = []
  for (const a of fighters) {
    const c = a.c
    if (c.state !== 'attack' || c.hitDone || c.hitstop > 0) continue
    const m = MOVES[c.move]
    if (c.moveFrame <= m.startup || c.moveFrame > m.startup + m.active) continue

    const s = a.body.state
    const hx = s.pos.x + s.facing.x * m.range
    const hz = s.pos.z + s.facing.z * m.range
    const hy = s.pos.y + (m.yOffset ?? 0)
    const reach = m.radius + MOVE.radius

    for (const t of fighters) {
      if (t === a || t.c.invuln > 0 || UNHITTABLE.has(t.c.state) || c.hitDone) continue
      const ts = t.body.state
      const dx = ts.pos.x - hx
      const dz = ts.pos.z - hz
      if (dx * dx + dz * dz > reach * reach) continue
      if (Math.abs(ts.pos.y - hy) > COMBAT.hitHeight) continue
      c.hitDone = true

      // Blocked = holding block, on the ground, and facing the attacker.
      // From behind or the side you are open: that is what sidestepping is for.
      const bx = s.pos.x - ts.pos.x
      const bz = s.pos.z - ts.pos.z
      const bl = Math.sqrt(bx * bx + bz * bz) || 1
      const facingAttacker = (ts.facing.x * bx + ts.facing.z * bz) / bl
      const blocked =
        (t.c.state === 'block' || t.c.state === 'blockstun') &&
        ts.grounded &&
        facingAttacker >= COMBAT.blockArc

      const tc = t.c
      let stop
      let type
      if (blocked) {
        tc.guard = Math.max(0, tc.guard - (m.guard ?? m.damage * 2))
        tc.guardDelay = COMBAT.guardRegenDelay
        ts.vel.x = s.facing.x * m.push
        ts.vel.z = s.facing.z * m.push
        stop = COMBAT.blockHitstop
        if (tc.guard <= 0) {
          breakGuard(t)
          type = 'guardbreak'
        } else {
          tc.state = 'blockstun'
          tc.timer = m.blockstun
          type = 'block'
        }
      } else {
        tc.hp = Math.max(0, tc.hp - m.damage)
        tc.juggle =
          tc.state === 'hitstun' || tc.state === 'down' || tc.state === 'guardbreak'
            ? tc.juggle + 1
            : 1
        tc.move = null
        tc.queued = null
        ts.vel.x = s.facing.x * m.push
        ts.vel.z = s.facing.z * m.push
        if (tc.hp === 0 || m.knockdown) {
          tc.state = tc.hp === 0 ? 'ko' : 'down'
          tc.timer = tc.hp === 0 ? COMBAT.koFrames : COMBAT.knockdownFrames
          ts.vel.y = m.launch ?? COMBAT.knockUp
          ts.grounded = false
        } else {
          tc.state = 'hitstun'
          tc.timer = m.hitstun
        }
        stop = m.hitstop
        type = tc.hp === 0 ? 'ko' : 'hit'
      }
      c.hitstop = stop
      tc.hitstop = stop
      events.push({
        type,
        attacker: a.id,
        target: t.id,
        move: c.move,
        damage: blocked ? 0 : m.damage,
        combo: blocked ? 0 : tc.juggle,
        guard: tc.guard,
        heavy: m.hitstop >= 9,
        x: (hx + ts.pos.x) / 2,
        y: ts.pos.y + 0.3,
        z: (hz + ts.pos.z) / 2,
      })
    }
  }
  return events
}
