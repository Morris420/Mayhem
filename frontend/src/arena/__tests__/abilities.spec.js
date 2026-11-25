// @vitest-environment node
// Milestone C, headless: the server's loadout as fighter options, and the fire
// bolt — hit, block, dodge, sidestep, cooldown, mana, interrupt, walls, rewind.
import { describe, expect, it } from 'vitest'
import room from '@/arena/rooms/training-hall'
import { createSimulation } from '@/arena/sim'
import { FOOT_OFFSET } from '@/arena/player'
import { MOVES } from '@/arena/moves'
import { ABILITIES, BASE_LOADOUT, fighterLoadout, scaled } from '@/arena/abilities'
import { stepsFor } from '@/arena/loop'

const STAND = FOOT_OFFSET + 0.03
const D = room.dummySpawn
const BOLT = ABILITIES.fire_bolt

// The shape GET /api/arena/loadout returns.
function loadout(stats = {}, { bolt = true } = {}) {
  return {
    stats: { health: 100, guard: 100, damage: 100, ability_power: 100, mana: 100, ...stats },
    abilities: [
      { slug: 'fire_bolt', slot: 1, key: 'Q', unlocked: bolt, built: true },
      { slug: 'second_wind', slot: 2, key: 'E', unlocked: false, built: false },
    ],
  }
}

// Player `dist` metres in front of an idle dummy, both settled on the floor.
function face(dist, { lo = loadout(), mode = 'idle', seed = 1 } = {}) {
  const sim = createSimulation(room, { dummy: 'idle', seed, loadout: lo })
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
const fire = (ev) => ev.filter((e) => e.move === 'fire_bolt')

describe('loadout from the server', () => {
  it('slots only unlocked abilities this client knows; junk falls back to the base', () => {
    const lo = fighterLoadout({
      stats: { health: 118, guard: '91', damage: 112, ability_power: 'x', mana: 100 },
      abilities: [
        { slug: 'fire_bolt', slot: 1, unlocked: true },
        { slug: 'second_wind', slot: 2, unlocked: false },
        { slug: 'meteor', slot: 3, unlocked: true }, // not a thing (yet)
      ],
    })
    expect(lo).toEqual({
      hp: 118,
      guard: 91,
      damage: 112,
      power: BASE_LOADOUT.stats.ability_power,
      mana: 100,
      slots: ['fire_bolt', null, null],
    })
    expect(fighterLoadout(null).slots).toEqual([null, null, null])
    expect(fighterLoadout({ stats: { health: -5 } }).hp).toBe(1)
  })

  it('health, guard and mana pools come from the loadout', () => {
    const st = face(3, { lo: loadout({ health: 83, guard: 117, mana: 90 }) }).state().player
    expect([st.hp, st.maxHp, st.guardMax, st.manaMax]).toEqual([83, 83, 117, 90])
    expect(st.slots).toEqual(['fire_bolt', null, null])
  })

  it('damage % scales melee hits, rounded to whole points', () => {
    for (const [pct, jab] of [
      [85, 5],
      [100, 6],
      [115, 7],
    ]) {
      const sim = face(1, { lo: loadout({ damage: pct }) })
      sim.press('light')
      const ev = run(sim, 500)
      expect(ev[0].damage).toBe(jab)
      expect(scaled(MOVES.L1.damage, pct)).toBe(jab)
    }
  })

  it('the dummy without a loadout keeps the tuned numbers', () => {
    const st = face(3).state().dummy
    expect(st.maxHp).toBe(100)
    expect(st.slots).toEqual([null, null, null])
  })
})

describe('fire bolt', () => {
  it('flies and hits at range: damage x ability power, mana spent, cooldown running', () => {
    const sim = face(6, { lo: loadout({ ability_power: 115 }) })
    sim.press('ability1')
    sim.step()
    let st = sim.state()
    expect(st.player.combat).toBe('cast')
    expect(st.player.mana).toBe(100 - BOLT.cost) // full (regen capped), then the cost
    expect(st.player.cooldowns[0]).toBe(BOLT.cooldown)
    expect(st.projectiles).toHaveLength(0) // still winding up

    const ev = run(sim, 1000)
    const hits = fire(ev)
    expect(hits).toHaveLength(1)
    expect(hits[0]).toMatchObject({ type: 'hit', attacker: 'player', target: 'dummy', fire: true })
    expect(hits[0].damage).toBe(scaled(BOLT.damage, 115)) // 12
    st = sim.state()
    expect(st.dummy.hp).toBe(100 - 12)
    expect(st.projectiles).toHaveLength(0)
    expect(st.player.combat).toBe('free')
  })

  it('leaves the hand on the last startup frame and takes time to arrive', () => {
    const sim = face(8)
    sim.press('ability1')
    let released = -1
    let landed = -1
    for (let i = 1; i < 120; i++) {
      sim.step()
      const st = sim.state()
      if (released < 0 && st.projectiles.length) released = i
      if (landed < 0 && fire(st.events).length) landed = i
    }
    expect(released).toBe(BOLT.startup + 1) // spawned on frame `startup`, seen after one flight step
    // ~7.6 m between the bolt's start and the dummy's edge at 16 m/s ≈ 28 frames.
    expect(landed - released).toBeGreaterThan(20)
    expect(landed - released).toBeLessThan(36)
  })

  it('is blocked from the front: no damage, costs guard', () => {
    const sim = face(6, { mode: 'block' })
    run(sim, 200)
    sim.press('ability1')
    const ev = fire(run(sim, 1000))
    expect(ev).toHaveLength(1)
    expect(ev[0]).toMatchObject({ type: 'block', damage: 0 })
    const st = sim.state().dummy
    expect(st.hp).toBe(100)
    // The bolt's guard cost, plus a little for holding the guard up meanwhile.
    expect(ev[0].guard).toBeLessThanOrEqual(100 - BOLT.guard)
    expect(ev[0].guard).toBeGreaterThan(100 - BOLT.guard - 3)
  })

  it('flies through a dash (i-frames) and fizzles further on', () => {
    const sim = face(5)
    sim.press('ability1')
    // Let it fly until it is just short of the dummy, then the dummy is "dashing".
    for (let i = 0; i < 200; i++) {
      sim.step()
      const p = sim.state().projectiles[0]
      if (p && p.z - D.z < 1.4) break
    }
    sim.fighters[1].c.invuln = 30
    const ev = run(sim, 1500)
    expect(fire(ev).filter((e) => e.type !== 'fizzle')).toHaveLength(0)
    expect(ev.some((e) => e.type === 'fizzle')).toBe(true)
    expect(sim.state().dummy.hp).toBe(100)
  })

  it('a sidestep out of its line makes it miss', () => {
    const sim = face(9)
    sim.press('ability1')
    run(sim, 300) // released and flying straight down the line
    expect(sim.state().projectiles).toHaveLength(1)
    sim.teleportDummy({ x: D.x + 1.6, y: STAND, z: D.z })
    const ev = run(sim, 1500)
    expect(fire(ev).filter((e) => e.type === 'hit')).toHaveLength(0)
  })

  it('has a cooldown, and needs the mana', () => {
    const sim = face(6)
    sim.press('ability1')
    run(sim, 700) // cast over, cooldown (1.5 s) still running
    sim.press('ability1')
    sim.step()
    expect(sim.state().player.combat).toBe('free')
    run(sim, 1000)
    sim.press('ability1')
    sim.step()
    expect(sim.state().player.combat).toBe('cast')

    const poor = face(6, { lo: loadout({ mana: BOLT.cost - 1 }) })
    poor.press('ability1')
    poor.step()
    expect(poor.state().player.combat).toBe('free')
  })

  it('does nothing when the ability is not unlocked', () => {
    const sim = face(6, { lo: loadout({}, { bolt: false }) })
    sim.press('ability1')
    const ev = run(sim, 1000)
    expect(sim.state().player.combat).toBe('free')
    expect(sim.state().player.mana).toBe(100)
    expect(fire(ev)).toHaveLength(0)
  })

  it('a hit during the wind-up interrupts the cast: no bolt, mana gone', () => {
    const sim = face(1.2, { mode: 'attack' })
    sim.press('ability1')
    const ev = run(sim, 600)
    expect(ev.some((e) => e.attacker === 'dummy' && e.target === 'player')).toBe(true)
    expect(fire(ev)).toHaveLength(0)
    expect(sim.state().projectiles).toHaveLength(0)
  })

  it('a wall stops it', () => {
    // 8 m from the east wall (x = 22), in the open (z = 0), the dummy far out of aim range.
    const sim = face(6)
    sim.teleportDummy({ x: -15, y: STAND, z: -2 })
    sim.teleport({ x: 14, y: STAND, z: 0 })
    sim.setInput({ view: { x: 1, z: 0 }, x: 0, y: 1 }) // walk east a moment to face east
    run(sim, 150)
    sim.setInput({ x: 0, y: 0 })
    run(sim, 300)
    expect(sim.state().player.facing.x).toBeGreaterThan(0.99)
    sim.press('ability1')
    const ev = run(sim, 1500)
    const fz = ev.filter((e) => e.type === 'fizzle')
    expect(fz).toHaveLength(1)
    // It stopped at the wall, not at the end of its range in mid-air.
    expect(fz[0].x).toBeGreaterThan(room.width / 2 - 0.5)
  })

  it('rewind with a bolt in flight and replay: identical', () => {
    const sim = face(9, { mode: 'auto', seed: 4 })
    sim.press('ability1')
    run(sim, 350)
    expect(sim.state().projectiles).toHaveLength(1)
    const snap = sim.snapshot()
    const go = () => {
      const ev = run(sim, 900)
      sim.press('ability1')
      sim.press('light')
      ev.push(...run(sim, 1500))
      return { st: sim.state(), ev }
    }
    const first = go()
    sim.restore(snap)
    expect(go()).toEqual(first)
    expect(fire(first.ev).length).toBeGreaterThan(0)
  })

  it('the snapshot stays small with bolts in it', () => {
    const sim = face(9)
    sim.press('ability1')
    run(sim, 350)
    expect(JSON.stringify(sim.snapshot()).length).toBeLessThan(2600)
  })
})
