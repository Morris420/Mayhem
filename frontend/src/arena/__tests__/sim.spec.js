// @vitest-environment node
// The arena's simulation, run headless: no browser, no WebGL. These pin down what
// the body can do (walk, sprint, fall, jump, hop, climb ledges, hug and kick off
// walls, collide) and the one thing everything later depends on: the same inputs
// always give exactly the same result.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import room from '@/arena/rooms/training-hall'
import { createSimulation, stickToWorld } from '@/arena/sim'
import { FOOT_OFFSET, MOVE, TURN_COS, TURN_RATE, TURN_SIN } from '@/arena/player'
import { roomBoxes } from '@/arena/physics'
import { createFixedStep, stepsFor, STEP_MS, STEP_S } from '@/arena/loop'

function run(sim, ms) {
  for (let i = 0; i < stepsFor(ms); i++) sim.step()
}
function steps(sim, n) {
  for (let i = 0; i < n; i++) sim.step()
}
// Runs `ms` and returns the highest the capsule centre got.
function peak(sim, ms) {
  let top = -Infinity
  for (let i = 0; i < stepsFor(ms); i++) {
    sim.step()
    top = Math.max(top, sim.state().player.pos.y)
  }
  return top
}
const STAND_Y = FOOT_OFFSET + 0.03 // capsule centre when standing on y = 0
const onFloor = (x, z) => ({ x, y: STAND_Y, z })

// A scripted run used by the determinism tests: wander, sprint, jump, hug a wall.
function script(sim) {
  run(sim, 800)
  sim.setInput({ x: 0, y: 1 })
  run(sim, 900)
  sim.setInput({ x: 1, y: 0.4, sprint: true })
  run(sim, 1500)
  sim.press('jump')
  run(sim, 900)
  sim.setInput({ x: -0.7, y: -1, sprint: false, jump: true })
  run(sim, 400)
  sim.setInput({ jump: false })
  run(sim, 2600)
  sim.setInput({ x: 0, y: 0 })
  run(sim, 500)
  return sim.state()
}

describe('walking and falling', () => {
  it('falls from the spawn point and lands on the floor', () => {
    const sim = createSimulation(room)
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
    const sim = createSimulation(room)
    run(sim, 1000)
    const start = sim.state().player.pos
    sim.setStick(0, 1) // forward = -z
    run(sim, 1000)
    const end = sim.state().player.pos
    const travelled = start.z - end.z
    // One second at 5 m/s, minus the short ramp-up from standing.
    expect(travelled).toBeGreaterThan(MOVE.walkSpeed * 0.9)
    expect(travelled).toBeLessThanOrEqual(MOVE.walkSpeed)
    // Straight line: the controller's nudge off the floor may drift it by a hair.
    expect(Math.abs(end.x - start.x)).toBeLessThan(0.01)
    // It turned to face where it went.
    expect(Math.abs(Math.cos(sim.state().player.yaw) + 1)).toBeLessThan(1e-3)
    sim.dispose()
  })

  it('sprints noticeably faster than it walks', () => {
    const sim = createSimulation(room)
    run(sim, 1000)
    const z0 = sim.state().player.pos.z
    sim.setInput({ y: 1, sprint: true })
    run(sim, 1000)
    const s = sim.state()
    expect(z0 - s.player.pos.z).toBeGreaterThan(MOVE.sprintSpeed * 0.85)
    expect(s.player.sprinting).toBe(true)
    sim.setInput({ sprint: false })
    run(sim, 500)
    expect(sim.state().player.sprinting).toBe(false)
    sim.dispose()
  })

  it('stops at the wall instead of walking through it', () => {
    const sim = createSimulation(room)
    run(sim, 500)
    sim.setStick(-1, 0) // straight at the left-hand wall (nothing in the way at z = 6)
    run(sim, 5000)
    const x = sim.state().player.pos.x
    const wallInner = -room.width / 2
    expect(x).toBeGreaterThan(wallInner + MOVE.radius - 0.001)
    expect(x).toBeLessThan(wallInner + MOVE.radius + 0.1)
    expect(sim.state().player.grounded).toBe(true)
    sim.dispose()
  })

  it('collides with a pillar', () => {
    const sim = createSimulation(room)
    const pillar = room.pillars[1] // x 8, z -8
    sim.teleport(onFloor(pillar.x, 0))
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
    const sim = createSimulation(room)
    for (const [x, y] of [
      [1, 1],
      [-1, 1],
      [-1, -1],
      [1, -1],
    ]) {
      sim.setInput({ x, y, sprint: true, jump: true })
      run(sim, 4000)
      const p = sim.state().player.pos
      expect(Math.abs(p.x)).toBeLessThan(room.width / 2)
      expect(Math.abs(p.z)).toBeLessThan(room.depth / 2)
      expect(p.y).toBeGreaterThan(0)
      expect(p.y).toBeLessThan(room.wallHeight)
    }
    sim.dispose()
  })

  it('clamps the stick and normalises diagonals', () => {
    const sim = createSimulation(room)
    sim.setStick(5, -9)
    expect(sim.state().input).toMatchObject({ x: 1, y: -1 })
    run(sim, 500)
    sim.setStick(1, 1)
    run(sim, 1000)
    const v = sim.state().player.vel
    expect(Math.hypot(v.x, v.z)).toBeCloseTo(MOVE.walkSpeed, 5)
    sim.dispose()
  })
})

describe('the stick follows the camera', () => {
  it('default camera (looking -z): forward is -z, right is +x', () => {
    expect(stickToWorld({ x: 0, y: 1 })).toEqual({ x: 0, z: -1 })
    expect(stickToWorld({ x: 1, y: 0 })).toEqual({ x: 1, z: 0 })
  })

  it('camera looking +x: forward is +x, right is +z', () => {
    expect(stickToWorld({ x: 0, y: 1 }, { x: 1, z: 0 })).toEqual({ x: 1, z: 0 })
    const right = stickToWorld({ x: 1, y: 0 }, { x: 1, z: 0 })
    expect(right.x).toBeCloseTo(0, 12)
    expect(right.z).toBe(1)
  })

  it('walking forward goes where the camera looks', () => {
    const sim = createSimulation(room)
    run(sim, 1000)
    const p0 = sim.state().player.pos
    sim.setInput({ y: 1, view: { x: 1, z: 0 } })
    run(sim, 1000)
    const p1 = sim.state().player.pos
    expect(p1.x - p0.x).toBeGreaterThan(4)
    expect(Math.abs(p1.z - p0.z)).toBeLessThan(0.05)
  })
})

describe('jumping', () => {
  it('a full jump lifts the feet about 1.6 m and lands again', () => {
    const sim = createSimulation(room)
    run(sim, 1000)
    const y0 = sim.state().player.pos.y
    sim.press('jump')
    const top = peak(sim, 1200)
    const expected = MOVE.jumpSpeed ** 2 / (2 * MOVE.gravity)
    expect(top - y0).toBeGreaterThan(expected * 0.9)
    expect(top - y0).toBeLessThan(expected * 1.02)
    const s = sim.state().player
    expect(s.grounded).toBe(true)
    expect(s.jumps).toBe(1)
    expect(s.lastJump).toBe('ground')
    sim.dispose()
  })

  it('letting go early gives a short hop', () => {
    const sim = createSimulation(room)
    run(sim, 1000)
    const y0 = sim.state().player.pos.y
    sim.setInput({ jump: true })
    steps(sim, 4) // ~70 ms tap
    sim.setInput({ jump: false })
    const top = peak(sim, 800)
    const full = MOVE.jumpSpeed ** 2 / (2 * MOVE.gravity)
    expect(top - y0).toBeGreaterThan(0.3)
    expect(top - y0).toBeLessThan(full * 0.6)
    sim.dispose()
  })

  it('holding jump does not bunny-hop: one press, one jump', () => {
    const sim = createSimulation(room)
    run(sim, 1000)
    sim.setInput({ jump: true })
    run(sim, 3000)
    expect(sim.state().player.jumps).toBe(1)
    sim.dispose()
  })

  it('cannot jump in mid-air (no double jump)', () => {
    const sim = createSimulation(room)
    run(sim, 1000)
    sim.press('jump')
    steps(sim, 20)
    sim.press('jump')
    steps(sim, 3)
    expect(sim.state().player.jumps).toBe(1)
    sim.dispose()
  })

  it('coyote time: a jump just after walking off a ledge still works', () => {
    const sim = createSimulation(room)
    const ledge = room.blocks[0] // h 1.0, spans x -16..-11
    sim.teleport({ x: ledge.x + ledge.w / 2 - 0.6, y: ledge.h + STAND_Y, z: ledge.z })
    run(sim, 300)
    sim.setInput({ x: 1 }) // walk east, off the edge
    let n = 0
    while (sim.state().player.grounded && n++ < 120) sim.step()
    expect(sim.state().player.grounded).toBe(false)
    steps(sim, 3) // 50 ms after leaving the edge: inside the 100 ms window
    sim.press('jump')
    sim.step()
    expect(sim.state().player.lastJump).toBe('ground')
    expect(sim.state().player.vel.y).toBeGreaterThan(MOVE.jumpSpeed * 0.9)
    sim.dispose()
  })

  it('jump buffer: pressing just before landing jumps on landing', () => {
    const sim = createSimulation(room)
    sim.teleport(onFloor(0, 0))
    run(sim, 500)
    sim.press('jump')
    steps(sim, 2) // take off
    // Fall until a few steps before touching down, then press again.
    let n = 0
    while ((sim.state().player.vel.y > 0 || sim.state().player.pos.y > STAND_Y + 0.25) && n++ < 200)
      sim.step()
    sim.setInput({ jump: true }) // press ~0.1 s before landing, keep holding
    steps(sim, 30)
    expect(sim.state().player.jumps).toBe(2)
    sim.dispose()
  })

  it('climbs the staircase: floor -> 1.0 m -> 2.0 m -> 3.4 m', () => {
    const sim = createSimulation(room)
    const [low, mid, high] = room.blocks
    // Start on the floor just east of the low step and jump west onto it.
    sim.teleport(onFloor(low.x + low.w / 2 + 1, low.z))
    run(sim, 300)
    const standOn = (b) => b.h + FOOT_OFFSET
    const hop = (input) => {
      sim.setInput(input)
      sim.press('jump')
      run(sim, 900)
      sim.setInput({ x: 0, y: 0 })
      run(sim, 300)
      return sim.state().player
    }
    let p = hop({ x: -1, y: 0 })
    expect(p.grounded).toBe(true)
    expect(p.pos.y).toBeCloseTo(standOn(low), 1)
    p = hop({ x: 0, y: 1 }) // north (-z) onto the middle step
    expect(p.pos.y).toBeCloseTo(standOn(mid), 1)
    // Walk up to the perch's face first, as a player would, then jump onto it.
    sim.setInput({ x: 0, y: 1 })
    run(sim, 1200)
    p = hop({ x: 0, y: 1 })
    expect(p.pos.y).toBeCloseTo(standOn(high), 1)
    sim.dispose()
  })
})

describe('wall hug and wall jump', () => {
  // Next to the left wall, jump while pushing into it.
  function hugLeftWall() {
    const sim = createSimulation(room)
    sim.teleport(onFloor(-room.width / 2 + 1.5, 6))
    run(sim, 300)
    sim.setInput({ x: -1 })
    sim.press('jump')
    run(sim, 600) // rise, reach the wall, start sliding
    return sim
  }

  it('pushing into a wall in mid-air clings and slides down slowly', () => {
    const sim = hugLeftWall()
    const p = sim.state().player
    expect(p.grounded).toBe(false)
    expect(p.wall).not.toBeNull()
    expect(p.wall.x).toBeCloseTo(1, 3) // the left wall's normal points +x
    expect(p.vel.y).toBeCloseTo(-MOVE.wallSlideSpeed, 3)
    // It faces the wall it is hugging.
    expect(Math.sin(p.yaw)).toBeLessThan(-0.95)
    sim.dispose()
  })

  it('letting go of the wall falls at normal speed again', () => {
    const sim = hugLeftWall()
    sim.setInput({ x: 0 })
    steps(sim, 6) // 100 ms: still in the air, no longer clinging
    const p = sim.state().player
    expect(p.wall).toBeNull()
    expect(p.grounded).toBe(false)
    expect(p.vel.y).toBeLessThan(-MOVE.wallSlideSpeed)
    sim.dispose()
  })

  it('jumping off a wall kicks you up and away from it', () => {
    const sim = hugLeftWall()
    const y = sim.state().player.pos.y
    sim.press('jump')
    sim.step()
    let p = sim.state().player
    expect(p.lastJump).toBe('wall')
    expect(p.jumps).toBe(2)
    expect(p.vel.y).toBeGreaterThan(MOVE.wallJumpUp * 0.9)
    expect(p.vel.x).toBeGreaterThan(MOVE.wallJumpPush * 0.9) // away = +x
    run(sim, 400)
    p = sim.state().player
    expect(p.pos.y).toBeGreaterThan(y + 0.5)
    expect(p.pos.x).toBeGreaterThan(-room.width / 2 + 2) // clearly off the wall
    sim.dispose()
  })

  it('no wall jump without a wall', () => {
    const sim = createSimulation(room)
    sim.teleport(onFloor(0, 0))
    run(sim, 300)
    sim.press('jump')
    steps(sim, 25)
    sim.press('jump')
    sim.step()
    expect(sim.state().player.jumps).toBe(1)
    sim.dispose()
  })
})

describe('determinism', () => {
  it('the same inputs give exactly the same state', () => {
    const a = createSimulation(room, { seed: 7 })
    const b = createSimulation(room, { seed: 7 })
    const sa = script(a)
    const sb = script(b)
    expect(sa).toEqual(sb)
    expect(sa.player.jumps).toBeGreaterThan(0)
    expect(a.random()).toBe(b.random())
    a.dispose()
    b.dispose()
  })
})

describe('determinism, the parts online play needs', () => {
  it('snapshot + restore rewinds exactly (what rollback does every frame)', () => {
    const sim = createSimulation(room, { seed: 3 })
    run(sim, 1000)
    sim.setInput({ x: 0.5, y: 1, sprint: true })
    run(sim, 500)
    const snap = sim.snapshot()
    // Go on, with a jump, and record where we end up.
    sim.press('jump')
    run(sim, 1200)
    const ahead = sim.state()
    const r1 = sim.random()
    // Rewind and replay the same inputs: identical result.
    sim.restore(snap)
    expect(sim.state().tick).toBe(stepsFor(1000) + stepsFor(500))
    sim.press('jump')
    run(sim, 1200)
    expect(sim.state()).toEqual(ahead)
    expect(sim.random()).toBe(r1)
  })

  it('a snapshot is small plain data', () => {
    const sim = createSimulation(room)
    run(sim, 500)
    const bytes = JSON.stringify(sim.snapshot()).length
    expect(bytes).toBeLessThan(2000)
  })

  it('the turn constants are cos/sin of one step of turning', () => {
    expect(TURN_COS).toBeCloseTo(Math.cos(TURN_RATE * STEP_S), 14)
    expect(TURN_SIN).toBeCloseTo(Math.sin(TURN_RATE * STEP_S), 14)
  })

  it('the simulation uses no maths whose last digit can differ between browsers', () => {
    // + - * / and sqrt are exactly rounded everywhere; these are not.
    const risky =
      /Math\.(sin|cos|tan|asin|acos|atan|atan2|hypot|pow|exp|log|cbrt|sinh|cosh|tanh)\b|\*\*/
    for (const file of ['physics.js', 'player.js']) {
      const src = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
      const code = src
        .split('\n')
        .filter((l) => !l.trim().startsWith('//'))
        .join('\n')
      expect({ file, risky: code.match(risky)?.[0] ?? null }).toEqual({ file, risky: null })
    }
  })
})

describe('room geometry', () => {
  it('encloses the floor on all four sides, with a lid', () => {
    const boxes = roomBoxes(room)
    const walls = boxes.filter((b) => b.kind === 'wall')
    expect(walls).toHaveLength(4)
    const span = (b, axis) => [b.center[axis] - b.half[axis], b.center[axis] + b.half[axis]]
    const xs = walls.flatMap((w) => span(w, 0))
    const zs = walls.flatMap((w) => span(w, 2))
    expect(Math.min(...xs)).toBeLessThanOrEqual(-room.width / 2)
    expect(Math.max(...xs)).toBeGreaterThanOrEqual(room.width / 2)
    expect(Math.min(...zs)).toBeLessThanOrEqual(-room.depth / 2)
    expect(Math.max(...zs)).toBeGreaterThanOrEqual(room.depth / 2)
    const lid = boxes.find((b) => b.kind === 'ceiling')
    expect(lid.center[1] - lid.half[1]).toBe(room.wallHeight)
  })

  it('puts the floor top at exactly y = 0', () => {
    const floor = roomBoxes(room).find((b) => b.kind === 'floor')
    expect(floor.center[1] + floor.half[1]).toBe(0)
  })

  it('every block sits on the floor and fits inside the room', () => {
    for (const b of room.blocks) {
      expect(b.x - b.w / 2).toBeGreaterThanOrEqual(-room.width / 2)
      expect(b.x + b.w / 2).toBeLessThanOrEqual(room.width / 2)
      expect(b.z - b.d / 2).toBeGreaterThanOrEqual(-room.depth / 2)
      expect(b.z + b.d / 2).toBeLessThanOrEqual(room.depth / 2)
    }
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
