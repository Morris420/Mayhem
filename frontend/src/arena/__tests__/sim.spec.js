// @vitest-environment node
// The arena's simulation, run headless: no browser, no WebGL. These pin down the
// three things M1 promises (it walks, it falls, it collides) and the one thing the
// whole game depends on later: the same inputs always give the same result.
import { beforeAll, describe, expect, it } from 'vitest'
import RAPIER from '@dimforge/rapier3d-compat'
import room from '@/arena/rooms/training-hall'
import { createSimulation } from '@/arena/sim'
import { FOOT_OFFSET, MOVE } from '@/arena/player'
import { roomBoxes } from '@/arena/world'
import { createFixedStep, stepsFor, STEP_MS } from '@/arena/loop'

beforeAll(async () => {
  await RAPIER.init()
})

function run(sim, ms) {
  for (let i = 0; i < stepsFor(ms); i++) sim.step()
}

// A scripted run used by the determinism tests: wander about, hit a wall and a pillar.
function script(sim) {
  run(sim, 800)
  sim.setStick(0, 1)
  run(sim, 900)
  sim.setStick(1, 0.4)
  run(sim, 2500)
  sim.setStick(-0.7, -1)
  run(sim, 3000)
  sim.setStick(0, 0)
  run(sim, 500)
  return sim.state()
}

describe('arena simulation', () => {
  it('falls from the spawn point and lands on the floor', () => {
    const sim = createSimulation(RAPIER, room)
    expect(sim.state().player.pos.y).toBe(room.spawn.y)
    expect(sim.state().player.grounded).toBe(false)

    run(sim, 1000)
    const p = sim.state().player
    expect(p.grounded).toBe(true)
    // Feet on the floor (y = 0), give or take the controller's skin gap.
    expect(p.pos.y - FOOT_OFFSET).toBeGreaterThanOrEqual(-0.01)
    expect(p.pos.y - FOOT_OFFSET).toBeLessThan(0.06)
    sim.dispose()
  })

  it('walks forward at walking speed', () => {
    const sim = createSimulation(RAPIER, room)
    run(sim, 1000)
    const start = sim.state().player.pos
    sim.setStick(0, 1) // forward = -z
    run(sim, 1000)
    const end = sim.state().player.pos
    const travelled = start.z - end.z
    // One second at 5 m/s, minus the short ramp-up from standing.
    expect(travelled).toBeGreaterThan(MOVE.walkSpeed * 0.85)
    expect(travelled).toBeLessThanOrEqual(MOVE.walkSpeed)
    // Straight line: the controller's nudge off the floor may drift it by a hair.
    expect(Math.abs(end.x - start.x)).toBeLessThan(0.01)
    // It turned to face where it went.
    expect(Math.abs(Math.cos(sim.state().player.yaw) + 1)).toBeLessThan(1e-3)
    sim.dispose()
  })

  it('stops at the wall instead of walking through it', () => {
    const sim = createSimulation(RAPIER, room)
    run(sim, 500)
    sim.setStick(1, 0) // straight at the right-hand wall
    run(sim, 6000) // far longer than it takes to reach it
    const x = sim.state().player.pos.x
    const wallInner = room.width / 2
    expect(x).toBeLessThan(wallInner - MOVE.radius + 0.001)
    expect(x).toBeGreaterThan(wallInner - MOVE.radius - 0.1)
    expect(sim.state().player.grounded).toBe(true)
    sim.dispose()
  })

  it('collides with a pillar', () => {
    const sim = createSimulation(RAPIER, room)
    const pillar = room.pillars[1] // x 6, z -6
    sim.teleport({ x: pillar.x, y: FOOT_OFFSET + 0.05, z: 0 })
    run(sim, 300)
    sim.setStick(0, 1) // walk -z straight into it
    run(sim, 3000)
    const z = sim.state().player.pos.z
    const face = pillar.z + pillar.size / 2
    expect(z).toBeGreaterThan(face + MOVE.radius - 0.001)
    expect(z).toBeLessThan(face + MOVE.radius + 0.1)
    sim.dispose()
  })

  it('never leaves the room whatever the input', () => {
    const sim = createSimulation(RAPIER, room)
    for (const [x, y] of [
      [1, 1],
      [-1, 1],
      [-1, -1],
      [1, -1],
    ]) {
      sim.setStick(x, y)
      run(sim, 4000)
      const p = sim.state().player.pos
      expect(Math.abs(p.x)).toBeLessThan(room.width / 2)
      expect(Math.abs(p.z)).toBeLessThan(room.depth / 2)
      expect(p.y).toBeGreaterThan(0)
    }
    sim.dispose()
  })

  it('is deterministic: the same inputs give exactly the same state', () => {
    const a = createSimulation(RAPIER, room, { seed: 7 })
    const b = createSimulation(RAPIER, room, { seed: 7 })
    const sa = script(a)
    const sb = script(b)
    expect(sa).toEqual(sb)
    expect(sa.tick).toBe(
      stepsFor(800) + stepsFor(900) + stepsFor(2500) + stepsFor(3000) + stepsFor(500),
    )
    expect(a.random()).toBe(b.random())
    a.dispose()
    b.dispose()
  })

  it('clamps the stick and normalises diagonals', () => {
    const sim = createSimulation(RAPIER, room)
    sim.setStick(5, -9)
    expect(sim.state().input).toEqual({ x: 1, y: -1 })
    run(sim, 500)
    sim.setStick(1, 1)
    run(sim, 1000)
    const v = sim.state().player.vel
    expect(Math.hypot(v.x, v.z)).toBeCloseTo(MOVE.walkSpeed, 5)
    sim.dispose()
  })
})

describe('room geometry', () => {
  it('encloses the floor on all four sides', () => {
    const walls = roomBoxes(room).filter((b) => b.kind === 'wall')
    expect(walls).toHaveLength(4)
    const inner = (b, axis) => [b.center[axis] - b.half[axis], b.center[axis] + b.half[axis]]
    const xs = walls.flatMap((w) => inner(w, 0))
    const zs = walls.flatMap((w) => inner(w, 2))
    expect(Math.min(...xs)).toBeLessThanOrEqual(-room.width / 2)
    expect(Math.max(...xs)).toBeGreaterThanOrEqual(room.width / 2)
    expect(Math.min(...zs)).toBeLessThanOrEqual(-room.depth / 2)
    expect(Math.max(...zs)).toBeGreaterThanOrEqual(room.depth / 2)
  })

  it('puts the floor top at exactly y = 0', () => {
    const floor = roomBoxes(room).find((b) => b.kind === 'floor')
    expect(floor.center[1] + floor.half[1]).toBe(0)
  })
})

describe('fixed-step clock', () => {
  it('turns real time into whole steps and carries the remainder', () => {
    const clock = createFixedStep()
    expect(clock.advance(STEP_MS * 2.5)).toBe(2)
    expect(clock.alpha()).toBeCloseTo(0.5)
    expect(clock.advance(STEP_MS * 0.5)).toBe(1)
  })

  it('clamps a huge frame so a backgrounded tab does not explode', () => {
    const clock = createFixedStep()
    expect(clock.advance(10_000)).toBe(6) // 100 ms max = 6 steps
  })

  it('stepsFor is exact for whole seconds', () => {
    expect(stepsFor(1000)).toBe(60)
    expect(stepsFor(2000)).toBe(120)
    expect(stepsFor(8)).toBe(0)
    expect(stepsFor(9)).toBe(1)
  })
})
