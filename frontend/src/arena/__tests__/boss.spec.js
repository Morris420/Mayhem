// @vitest-environment node
// The Shadow Knight, headless: he waits, walks over slowly, swings, charges his
// rush (turning to aim, then committed), can be rolled through, falls for good,
// and resets if you go down.
import { describe, expect, it } from 'vitest'
import room from '@/arena/rooms/training-room'
import { createSimulation } from '@/arena/sim'
import { FOOT_OFFSET, MOVE } from '@/arena/player'
import { MOVES } from '@/arena/moves'
import { BOSSES } from '@/arena/boss'
import { stepsFor } from '@/arena/loop'

const STAND = FOOT_OFFSET + 0.03
const B = room.bossSpawn
const knight = (opts = {}) => createSimulation(room, { boss: 'shadow_knight', ...opts })
function run(sim, ms) {
  const ev = []
  for (let i = 0; i < stepsFor(ms); i++) {
    sim.step()
    ev.push(...sim.state().events)
  }
  return ev
}

describe('the Shadow Knight', () => {
  it('waits until you come close, then walks over slowly', () => {
    const sim = knight()
    sim.teleport({ x: 0, y: STAND, z: 13 }) // ~21 m away
    run(sim, 1000)
    expect(sim.state().boss.awake).toBe(false)
    sim.teleport({ x: 0, y: STAND, z: 3 }) // 11 m
    run(sim, 300)
    const st = sim.state().boss
    expect(st.awake).toBe(true)
    const v = Math.sqrt(st.vel.x ** 2 + st.vel.z ** 2)
    expect(v).toBeGreaterThan(0.5)
    expect(v).toBeLessThanOrEqual(MOVE.walkSpeed * BOSSES.shadow_knight.walk + 1e-9)
  })

  it('swings his katana when you are close', () => {
    const sim = knight()
    sim.teleport({ x: B.x, y: STAND, z: B.z + 2 })
    const ev = run(sim, 1500)
    expect(ev.some((e) => e.attacker === 'boss' && e.move === 'KNIGHT_SLASH')).toBe(true)
    expect(sim.state().player.hp).toBeLessThan(100)
  })

  it('charges the rush while aiming at you, then dashes forward', () => {
    const sim = knight()
    sim.teleport({ x: B.x, y: STAND, z: B.z + 9 })
    let charging = -1
    for (let i = 0; i < 600 && charging < 0; i++) {
      sim.step()
      if (sim.state().boss.move === 'KNIGHT_RUSH') charging = i
    }
    expect(charging).toBeGreaterThan(-1)
    const z0 = sim.state().boss.pos.z
    run(sim, ((MOVES.KNIGHT_RUSH.startup + MOVES.KNIGHT_RUSH.active) * 1000) / 60)
    expect(sim.state().boss.pos.z - z0).toBeGreaterThan(3) // a huge dash towards you
  })

  it('a roll through the rush (i-frames) takes no damage', () => {
    const sim = knight()
    sim.teleport({ x: B.x, y: STAND, z: B.z + 6 })
    for (let i = 0; i < 900; i++) {
      sim.step()
      const b = sim.state().boss
      if (b.move === 'KNIGHT_RUSH' && b.moveFrame === MOVES.KNIGHT_RUSH.startup - 2) break
    }
    const hp = sim.state().player.hp
    sim.setInput({ y: -1 }) // roll straight at him
    sim.press('dash')
    const ev = run(sim, 500)
    expect(ev.filter((e) => e.move === 'KNIGHT_RUSH' && e.target === 'player')).toHaveLength(0)
    expect(sim.state().player.hp).toBe(hp)
  })

  it('falls for good: the fight is won, with its time', () => {
    const sim = knight()
    sim.teleport({ x: B.x, y: STAND, z: B.z + 3 })
    run(sim, 500)
    sim.fighters.find((f) => f.id === 'boss').c.hp = 1
    sim.fighters.find((f) => f.id === 'player').c.invuln = 600
    let ev = []
    for (let i = 0; i < 40 && !ev.some((e) => e.type === 'boss-defeated'); i++) {
      sim.press('light')
      ev = ev.concat(run(sim, 200))
    }
    const won = ev.find((e) => e.type === 'boss-defeated')
    expect(won).toBeTruthy()
    expect(won.ms).toBeGreaterThan(400)
    run(sim, 5000)
    expect(sim.state().boss.combat).toBe('ko') // no respawn
    expect(sim.state().boss.result).toBe('won')
  })

  it('if you go down, he heals and goes back to wait', () => {
    const sim = knight()
    sim.teleport({ x: B.x, y: STAND, z: B.z + 3 })
    run(sim, 300)
    sim.fighters.find((f) => f.id === 'boss').c.hp = 150
    sim.fighters.find((f) => f.id === 'player').c.hp = 1
    const ev = run(sim, 4000)
    expect(ev.some((e) => e.type === 'boss-reset')).toBe(true)
    expect(sim.state().boss.hp).toBe(400)
  })

  it('rewinds exactly, mid-fight (rollback)', () => {
    const a = knight({ seed: 3 })
    a.teleport({ x: B.x, y: STAND, z: B.z + 7 })
    run(a, 2000)
    const snap = a.snapshot()
    run(a, 3000)
    const later = JSON.stringify(a.state().boss)
    a.restore(snap)
    run(a, 3000)
    expect(JSON.stringify(a.state().boss)).toBe(later)
  })

  it('the shadow slash: a technique that rushes in and knocks down', () => {
    const lo = {
      stats: { health: 100, guard: 100, damage: 100, ability_power: 100 },
      abilities: [{ slug: 'shadow_slash', slot: 2, unlocked: true }],
    }
    const sim = createSimulation(room, { dummy: 'idle', loadout: lo })
    const D = room.dummySpawn
    sim.teleport({ x: D.x, y: STAND, z: D.z + 4 })
    run(sim, 300)
    sim.press('ability2')
    const ev = run(sim, 1200)
    const hit = ev.find((e) => e.move === 'SHADOW_SLASH')
    expect(hit?.type).toBe('hit')
    expect(sim.state().player.cooldowns[1]).toBeGreaterThan(0)
  })
})
