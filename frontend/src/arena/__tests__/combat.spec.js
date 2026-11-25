// @vitest-environment node
// The fight, headless: hits, ranges, hitstop, strings, block, dash, jump attacks,
// pushboxes, KO, the dummy's brain, and replaying a whole fight exactly.
import { describe, expect, it } from 'vitest'
import room from '@/arena/rooms/training-hall'
import { createSimulation } from '@/arena/sim'
import { FOOT_OFFSET, MOVE } from '@/arena/player'
import { COMBAT, MOVES } from '@/arena/moves'
import { stepsFor } from '@/arena/loop'

const STAND = FOOT_OFFSET + 0.03
const D = room.dummySpawn // dummy stands here, facing +z (towards the player)

// A sim with an idle dummy and the player `dist` metres in front of it, facing it.
// The dummy stays idle while you get into position, then switches to `mode`.
function face(dist = 1, mode = 'idle', seed = 1) {
  const sim = createSimulation(room, { dummy: 'idle', seed })
  sim.teleport({ x: D.x, y: STAND, z: D.z + dist })
  for (let i = 0; i < 20; i++) sim.step()
  if (mode !== 'idle') sim.setDummyMode(mode)
  return sim
}
function run(sim, ms) {
  const events = []
  for (let i = 0; i < stepsFor(ms); i++) {
    sim.step()
    events.push(...sim.state().events)
  }
  return events
}
// Step until cond(state) holds (max n steps); returns the events seen on the way.
function until(sim, cond, n = 600) {
  const events = []
  for (let i = 0; i < n; i++) {
    sim.step()
    events.push(...sim.state().events)
    if (cond(sim.state())) return events
  }
  throw new Error('condition never met')
}
const gap = (st) => Math.abs(st.player.pos.z - st.dummy.pos.z)

describe('hits', () => {
  it('a jab in range hits: damage, hitstun, an event', () => {
    const sim = face(1)
    sim.press('light')
    const ev = run(sim, 500)
    expect(ev).toHaveLength(1)
    expect(ev[0]).toMatchObject({
      type: 'hit',
      attacker: 'player',
      target: 'dummy',
      move: 'L1',
      damage: MOVES.L1.damage,
      combo: 1,
    })
    expect(sim.state().dummy.hp).toBe(COMBAT.maxHp - MOVES.L1.damage)
  })

  it('a jab out of range misses; the heavy reaches further', () => {
    let sim = face(2.3)
    sim.press('light')
    expect(run(sim, 600)).toHaveLength(0)
    expect(sim.state().dummy.hp).toBe(COMBAT.maxHp)

    sim = face(2.3)
    sim.press('heavy')
    const ev = run(sim, 800)
    expect(ev.map((e) => e.move)).toEqual(['H'])
    expect(sim.state().dummy.hp).toBe(COMBAT.maxHp - MOVES.H.damage)
  })

  it('lands on the first active frame, not before', () => {
    const sim = face(1)
    sim.press('light')
    const ev = until(sim, (s) => s.events.length > 0)
    // Pressed on step 1, moveFrame counts from the step after: startup + 1.
    expect(sim.state().player.moveFrame).toBe(MOVES.L1.startup + 1)
    expect(ev[0].type).toBe('hit')
  })

  it('hitstop: both fighters freeze for a few frames on impact', () => {
    const sim = face(1)
    sim.press('light')
    until(sim, (s) => s.events.length > 0)
    const at = sim.state()
    expect(at.player.hitstop).toBe(MOVES.L1.hitstop)
    expect(at.dummy.hitstop).toBe(MOVES.L1.hitstop)
    for (let i = 0; i < MOVES.L1.hitstop; i++) sim.step()
    const after = sim.state()
    expect(after.player.pos).toEqual(at.player.pos)
    expect(after.dummy.pos).toEqual(at.dummy.pos)
    expect(after.player.moveFrame).toBe(at.player.moveFrame)
    sim.step()
    expect(sim.state().dummy.pos).not.toEqual(at.dummy.pos) // pushed back once it thaws
  })

  it('one hit per move, however long the active window', () => {
    const sim = face(1)
    sim.press('heavy')
    expect(run(sim, 1000).filter((e) => e.type === 'hit')).toHaveLength(1)
  })
})

describe('strings (combos)', () => {
  it('the combo is left jab, right cross, uppercut; the uppercut deals 1.5x the jab', () => {
    expect([MOVES.L1.name, MOVES.L2.name, MOVES.L3.name]).toEqual([
      'Left jab',
      'Right cross',
      'Uppercut',
    ])
    expect(MOVES.L3.damage).toBe(MOVES.L1.damage * 1.5)
    expect(MOVES.L3.knockdown).toBe(true)
  })

  it('Light, Light, Light: three hits that combo and end in a knockdown', () => {
    const sim = face(1)
    sim.press('light')
    const ev = until(sim, (s) => s.player.move === 'L1' && s.player.moveFrame === 3)
    sim.press('light')
    ev.push(...until(sim, (s) => s.player.move === 'L2' && s.player.moveFrame === 3))
    sim.press('light')
    ev.push(...run(sim, 1200))
    const hits = ev.filter((e) => e.type === 'hit')
    expect(hits.map((e) => e.move)).toEqual(['L1', 'L2', 'L3'])
    expect(hits.map((e) => e.combo)).toEqual([1, 2, 3]) // the dummy never recovered in between
    expect(sim.state().dummy.hp).toBe(100 - 6 - 7 - 9)
  })

  it('the spin kick knocks down; the dummy gets up again and is hittable', () => {
    const sim = face(1)
    sim.press('light')
    until(sim, (s) => s.player.move === 'L1' && s.player.moveFrame === 3)
    sim.press('light')
    until(sim, (s) => s.player.move === 'L2' && s.player.moveFrame === 3)
    sim.press('light')
    until(sim, (s) => s.dummy.combat === 'down')
    until(sim, (s) => s.dummy.combat === 'getup')
    until(sim, (s) => s.dummy.combat === 'free')
    expect(sim.state().dummy.hp).toBe(100 - 6 - 7 - 9)
  })

  it('Light into Heavy: the rising strike finisher', () => {
    const sim = face(1)
    sim.press('light')
    until(sim, (s) => s.player.moveFrame === 3)
    sim.press('heavy')
    const ev = run(sim, 1200).filter((e) => e.type === 'hit')
    expect(ev.map((e) => e.move)).toEqual(['L1', 'LH'])
    expect(ev[1].combo).toBe(2)
  })

  it('every string link is a true combo: the next hit lands before hitstun ends', () => {
    for (const [id, m] of Object.entries(MOVES)) {
      for (const nextId of Object.values(m.next ?? {})) {
        const n = MOVES[nextId]
        const hitstunEnds = m.startup + 1 + m.hitstun
        const nextLands = m.startup + m.active + n.startup + 1
        expect(nextLands, `${id} -> ${nextId}`).toBeLessThanOrEqual(hitstunEnds)
      }
    }
  })

  it('a press during the hitstop freeze is buffered and continues the string', () => {
    const sim = face(1)
    sim.press('light')
    until(sim, (s) => s.events.length > 0) // the jab lands: hitstop begins
    sim.press('light') // pressed on impact, while frozen
    const ev = run(sim, 800).filter((e) => e.type === 'hit')
    expect(ev.map((e) => e.move)).toEqual(['L2'])
  })

  it('a press in the last frames of a move starts the next move (buffer)', () => {
    const sim = face(3) // out of range: the jab whiffs, so no hitstop
    sim.press('heavy')
    until(sim, (s) => s.player.move === 'H' && s.player.moveFrame === 40) // 4 frames before the end
    sim.press('light') // too early for a fresh move, buffered
    until(sim, (s) => s.player.move === 'L1', 20)
    expect(sim.state().player.combat).toBe('attack')
  })

  it('a late press does not continue the string', () => {
    const sim = face(1)
    sim.press('light')
    until(sim, (s) => s.player.combat === 'free')
    sim.press('light') // a fresh jab, not L2
    run(sim, 500)
    expect(sim.state().player.move).toBe('L1')
  })
})

describe('block', () => {
  it('blocks from the front: no damage, blockstun, pushback', () => {
    const sim = face(1, 'block')
    run(sim, 200)
    sim.press('heavy')
    const ev = run(sim, 800)
    expect(ev.map((e) => e.type)).toEqual(['block'])
    expect(sim.state().dummy.hp).toBe(COMBAT.maxHp)
  })

  it('blocked hits leave a gap: the dummy is pushed out of reach of a follow-up', () => {
    const sim = face(1, 'block')
    run(sim, 200)
    const before = gap(sim.state())
    sim.press('heavy')
    run(sim, 800)
    expect(gap(sim.state())).toBeGreaterThan(before + 0.1)
  })

  it('is open from behind: hitting a blocker in the back still lands', () => {
    // The dummy faces +z; stand behind it (at smaller z) and attack immediately,
    // before it can turn round.
    const sim = createSimulation(room, { dummy: 'idle' })
    sim.teleport({ x: D.x, y: STAND, z: D.z - 1 })
    for (let i = 0; i < 20; i++) sim.step()
    sim.setDummyMode('block')
    sim.press('light')
    const ev = run(sim, 500)
    expect(ev[0].type).toBe('hit')
  })

  it('you can block: hold block and the dummy’s attacks do nothing', () => {
    const sim = face(1.2)
    sim.setInput({ block: true })
    sim.step()
    sim.setDummyMode('attack')
    const ev = run(sim, 1200) // one string; hold longer and the guard meter runs out
    expect(ev.length).toBeGreaterThan(0)
    expect(ev.every((e) => e.type === 'block' && e.target === 'player')).toBe(true)
    expect(sim.state().player.hp).toBe(COMBAT.maxHp)
  })
})

describe('guard meter', () => {
  it('blocking costs guard; it refills after you stop', () => {
    const sim = face(1, 'block')
    run(sim, 200)
    const g0 = sim.state().dummy.guard
    sim.press('heavy')
    run(sim, 800)
    const g1 = sim.state().dummy.guard
    expect(g1).toBeLessThan(g0 - MOVES.H.guard + 1)
    sim.setDummyMode('idle')
    run(sim, 4000)
    expect(sim.state().dummy.guard).toBeGreaterThan(g1 + 20)
  })

  it('holding block slowly drains it, even without being hit', () => {
    const sim = face(6, 'block')
    run(sim, 3000)
    const g = sim.state().dummy.guard
    expect(g).toBeLessThan(COMBAT.guardMax - COMBAT.guardHoldDrain * 2.5)
    expect(g).toBeGreaterThan(COMBAT.guardMax - COMBAT.guardHoldDrain * 3.5)
  })

  it('at zero: guard break, stunned and open, then hits land', () => {
    const sim = face(1, 'block')
    run(sim, 200)
    const ev = []
    for (let i = 0; i < 8 && !ev.some((e) => e.type === 'guardbreak'); i++) {
      sim.press('heavy')
      ev.push(...run(sim, 900))
    }
    expect(ev.some((e) => e.type === 'guardbreak')).toBe(true)
    expect(sim.state().dummy.combat).toBe('guardbreak')
    expect(sim.state().dummy.guard).toBe(0)
    sim.press('light')
    const after = run(sim, 400)
    expect(after.some((e) => e.type === 'hit' && e.target === 'dummy')).toBe(true)
  })

  it('cannot raise a guard with an empty meter', () => {
    const sim = face(1)
    sim.fighters[1].c.guard = 0
    sim.fighters[1].c.guardDelay = 600 // and it is not refilling yet
    sim.setDummyMode('block')
    run(sim, 200)
    expect(sim.state().dummy.combat).toBe('free')
  })
})

describe('dash', () => {
  it('dashes about two metres in the stick direction', () => {
    const sim = face(6)
    const x0 = sim.state().player.pos.x
    sim.setInput({ x: 1 })
    sim.press('dash')
    sim.step()
    sim.setInput({ x: 0 })
    run(sim, 400)
    const moved = sim.state().player.pos.x - x0
    expect(moved).toBeGreaterThan(3) // a full roll
    expect(moved).toBeLessThan(4.5)
  })

  it('no direction = a backdash, away from where you face, still facing forward', () => {
    const sim = face(1.5)
    const z0 = sim.state().player.pos.z
    const facing = sim.state().player.facing
    sim.press('dash')
    run(sim, 400)
    expect(sim.state().player.pos.z - z0).toBeGreaterThan(2.5) // facing -z, so back is +z
    expect(sim.state().player.facing).toEqual(facing)
  })

  it('the first frames of a dash dodge an attack', () => {
    const sim = face(1.1, 'attack')
    // Wait for the dummy's jab to be 2 frames from landing, then dash into it.
    until(sim, (s) => s.dummy.move === 'L1' && s.dummy.moveFrame === MOVES.L1.startup - 1)
    sim.setInput({ y: 1 })
    sim.press('dash')
    until(
      sim,
      (s) => s.dummy.moveFrame > MOVES.L1.startup + MOVES.L1.active || s.dummy.move !== 'L1',
    )
    expect(sim.state().player.hp).toBe(COMBAT.maxHp)
  })

  const steps = (sim, n) => {
    for (let i = 0; i < n; i++) sim.step()
  }

  it('is a committed roll: a hop, and no other input until it is over', () => {
    const sim = face(6)
    sim.setInput({ x: 1 })
    sim.press('dash')
    sim.step()
    expect(sim.state().player.vel.y).toBeGreaterThan(0) // the hop
    sim.press('light') // ignored mid-roll
    sim.press('jump')
    steps(sim, 4)
    expect(sim.state().player.combat).toBe('dash')
    steps(sim, COMBAT.dashFrames - 12)
    expect(sim.state().player.combat).toBe('dash')
    expect(sim.state().player.move).toBeFalsy()
    steps(sim, 12)
    expect(sim.state().player.combat).toBe('free')
  })

  it('has a cooldown', () => {
    const sim = face(6)
    sim.press('dash')
    run(sim, (COMBAT.dashFrames * 1000) / 60 + 20) // the roll is over...
    const z = sim.state().player.pos.z
    sim.press('dash') // ...but the cooldown is not
    run(sim, 300)
    expect(Math.abs(sim.state().player.pos.z - z)).toBeLessThan(0.3)
  })
})

describe('air and bodies', () => {
  it('a jump kick hits from the air', () => {
    const sim = face(2.2)
    sim.setInput({ y: 1 })
    sim.press('jump')
    run(sim, 150)
    sim.press('light')
    const ev = run(sim, 800)
    expect(ev.map((e) => e.move)).toContain('AIR')
  })

  it('fighters cannot walk through each other', () => {
    const sim = face(2)
    sim.setInput({ y: 1 }) // walk into the dummy
    run(sim, 2000)
    expect(gap(sim.state())).toBeGreaterThanOrEqual(2 * MOVE.radius - 0.01)
  })
})

describe('emote', () => {
  it('T starts the emote when standing still; moving ends it', () => {
    const sim = face(4)
    sim.press('emote')
    run(sim, 300)
    expect(sim.state().player.combat).toBe('emote')
    sim.setInput({ y: 1 })
    sim.step()
    expect(sim.state().player.combat).toBe('free')
  })

  it('an attack ends the emote and comes out straight away', () => {
    const sim = face(1)
    sim.press('emote')
    run(sim, 300)
    sim.press('light')
    sim.step()
    sim.step()
    expect(sim.state().player.combat).toBe('attack')
  })

  it('no emote while moving', () => {
    const sim = face(6)
    sim.setInput({ x: 1 })
    run(sim, 300)
    sim.press('emote')
    run(sim, 100)
    expect(sim.state().player.combat).toBe('free')
  })
})

describe('KO', () => {
  it('at zero health: KO, then back on its feet with full health', () => {
    const sim = face(1)
    sim.fighters[1].c.hp = 4
    sim.press('light')
    const ev = run(sim, 500)
    expect(ev[0].type).toBe('ko')
    expect(sim.state().dummy.combat).toBe('ko')
    expect(sim.state().dummy.hp).toBe(0)
    run(sim, (COMBAT.koFrames / 60) * 1000 + 200)
    expect(sim.state().dummy.combat).toBe('free')
    expect(sim.state().dummy.hp).toBe(COMBAT.maxHp)
  })
})

describe('the dummy (AI)', () => {
  it('fights back: attacks you and blocks some of your attacks', () => {
    const sim = face(1.3, 'auto', 11)
    const ev = []
    for (let i = 0; i < 30; i++) {
      sim.press('light')
      ev.push(...run(sim, 700))
    }
    expect(ev.some((e) => e.attacker === 'dummy' && e.type === 'hit')).toBe(true)
    expect(ev.some((e) => e.target === 'dummy' && e.type === 'block')).toBe(true)
    expect(ev.some((e) => e.target === 'dummy' && e.type === 'hit')).toBe(true)
  })

  it('wanders when you are far away, and stays inside the arena', () => {
    const sim = createSimulation(room, { dummy: 'auto', seed: 4 })
    sim.teleport({ x: 18, y: STAND, z: 18 })
    const start = sim.state().dummy.pos
    let farthest = 0
    for (let i = 0; i < stepsFor(12000); i++) {
      sim.step()
      const p = sim.state().dummy.pos
      farthest = Math.max(farthest, Math.hypot(p.x - start.x, p.z - start.z))
      expect(Math.abs(p.x)).toBeLessThan(room.width / 2)
      expect(Math.abs(p.z)).toBeLessThan(room.depth / 2)
    }
    expect(farthest).toBeGreaterThan(3)
  })

  it('closes in when you come near', () => {
    const sim = createSimulation(room, { dummy: 'auto', seed: 2 })
    sim.teleport({ x: 0, y: STAND, z: D.z + 7 })
    run(sim, 3000)
    expect(gap(sim.state())).toBeLessThan(3)
  })
})

describe('determinism with a fight going on', () => {
  function fight(sim) {
    const script = [
      [{ y: 1 }, 600],
      ['light', 300],
      ['light', 300],
      [{ x: 1, y: 0.5, sprint: true }, 900],
      ['dash', 400],
      [{ x: 0, y: 1, sprint: false, block: true }, 1200],
      [{ block: false }, 100],
      ['heavy', 800],
      ['jump', 200],
      ['light', 1500],
    ]
    for (const [act, ms] of script) {
      if (typeof act === 'string') sim.press(act)
      else sim.setInput(act)
      run(sim, ms)
    }
    return sim.state()
  }

  it('same seed, same inputs: identical fight', () => {
    const a = fight(createSimulation(room, { dummy: 'auto', seed: 5 }))
    const b = fight(createSimulation(room, { dummy: 'auto', seed: 5 }))
    expect(a).toEqual(b)
    expect(a.dummy.moveCount + a.player.moveCount).toBeGreaterThan(3)
  })

  it('rewind mid-fight and replay: identical', () => {
    const sim = createSimulation(room, { dummy: 'auto', seed: 9 })
    sim.setInput({ y: 1 })
    run(sim, 1500)
    const snap = sim.snapshot()
    const go = () => {
      sim.press('light')
      run(sim, 400)
      sim.press('heavy')
      run(sim, 1600)
      return sim.state()
    }
    const first = go()
    sim.restore(snap)
    expect(go()).toEqual(first)
  })
})
