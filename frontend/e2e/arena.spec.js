// M1 in a real browser: the page loads, WebGL draws the neon room, the capsule
// falls, walks and collides, the loop is deterministic, leaving the page frees the
// WebGL context, and adding "Arena" to the nav does not break the phone layout.
//
// Everything is driven through window.__arena (?test=1), which only advances the
// game when told to, so none of these assertions depend on timing.
import { mkdirSync } from 'node:fs'
import { expect, test } from '@playwright/test'

const SHOTS = new URL('./screenshots/', import.meta.url).pathname
mkdirSync(SHOTS, { recursive: true })

// Fail any test that logs a console error, throws, or gets a failed / 5xx request.
test.beforeEach(async ({ page }, info) => {
  const problems = []
  page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text()}`))
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))
  page.on('requestfailed', (r) =>
    problems.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`),
  )
  page.on('response', (r) => r.status() >= 500 && problems.push(`HTTP ${r.status()}: ${r.url()}`))
  info.problems = problems
})
test.afterEach(async ({ page }, info) => {
  void page
  expect(info.problems, 'console errors / failed requests').toEqual([])
})

async function openArena(page) {
  await page.goto('/arena?test=1')
  await page.waitForFunction(() => window.__arena?.ready === true, null, { timeout: 60_000 })
  // The dummy wanders by default; most tests want it standing still.
  await page.evaluate(() => window.__arena.dummy('idle'))
}

const step = (page, ms) => page.evaluate((ms) => window.__arena.step(ms), ms)
const input = (page, a) => page.evaluate((a) => window.__arena.input(a), a)

test('the arena loads and actually draws the neon room', async ({ page }) => {
  await openArena(page)
  await expect(page.locator('canvas[data-arena="canvas"]')).toBeVisible()

  const px = await page.evaluate(() => window.__arena.pixels())
  expect(px.width).toBeGreaterThan(300)
  // The room is meant to be dark: only a few percent of pixels are lit at all.
  expect(px.lit, 'share of non-black pixels').toBeGreaterThan(0.02)
  expect(px.cyan, 'share of neon-cyan pixels (trim, grid, ring, hunter outline)').toBeGreaterThan(
    0.002,
  )

  // The hunter model loaded (not the capsule fallback).
  const dbg = await page.evaluate(() => window.__arena.debug())
  expect(dbg.figure).toBe('hunter')
  // Budget (playbook §6): room ~8 calls, the hunter's parts + their outlines ~22,
  // the bloom passes ~12.
  expect(dbg.drawCalls).toBeGreaterThan(5)
  expect(dbg.drawCalls).toBeLessThan(70)
})

test('the capsule falls, walks and collides — through the test hook', async ({ page }) => {
  await openArena(page)

  let s = await page.evaluate(() => window.__arena.state())
  expect(s.tick).toBe(0) // nothing moves until a test says so
  expect(s.player.grounded).toBe(false)
  const spawnY = s.player.pos.y

  // Falls and lands.
  s = await step(page, 1000)
  expect(s.tick).toBe(60)
  expect(s.player.grounded).toBe(true)
  expect(s.player.pos.y).toBeLessThan(spawnY - 1)
  expect(s.player.pos.y).toBeGreaterThan(0.85) // capsule centre, feet on the floor

  // Walks forward (-z) about 4.7 m in a second.
  const z0 = s.player.pos.z
  await input(page, { x: 0, y: 1 })
  s = await step(page, 1000)
  expect(z0 - s.player.pos.z).toBeGreaterThan(4.4)
  expect(z0 - s.player.pos.z).toBeLessThan(5.01)

  // Holds left for six seconds: stops at the wall (inner face x = -22, radius 0.4).
  await input(page, { x: -1, y: 0 })
  s = await step(page, 6000)
  expect(s.player.pos.x).toBeGreaterThan(-21.6 - 0.001)
  expect(s.player.pos.x).toBeLessThan(-21.5)

  // Teleport up high and drop again: falling works anywhere, not only at spawn.
  await input(page, 'stop')
  s = await page.evaluate(() => window.__arena.teleport({ x: -3, y: 6, z: 2 }))
  expect(s.player.grounded).toBe(false)
  s = await step(page, 1500)
  expect(s.player.grounded).toBe(true)

  // Combat inputs are recognised but not live yet; garbage is rejected loudly.
  expect(await input(page, 'ability:fire')).toEqual({
    accepted: false,
    reason: 'abilities arrive with the stats',
  })
  await expect(page.evaluate(() => window.__arena.input('jump-to-moon'))).rejects.toThrow(
    /Unknown arena input/,
  )
})

test('sprint, jump and wall hug — and the hunter animates to match', async ({ page }) => {
  await openArena(page)
  const clip = () => page.evaluate(() => window.__arena.debug().clip)
  await step(page, 1000)
  expect(await clip()).toBe('Unarmed_Idle')

  // Sprint forward: faster than walking, and the sprint animation.
  let s = await page.evaluate(() => window.__arena.state())
  const z0 = s.player.pos.z
  await input(page, { y: 1, sprint: true })
  s = await step(page, 1000)
  expect(z0 - s.player.pos.z).toBeGreaterThan(7)
  expect(s.player.sprinting).toBe(true)
  expect(await clip()).toBe('Running_B')

  // Jump: airborne, rising, jump animation; then lands again.
  await input(page, 'jump')
  s = await step(page, 200)
  expect(s.player.grounded).toBe(false)
  expect(s.player.jumps).toBe(1)
  expect(await clip()).toBe('Jump_Idle')
  await input(page, 'stop')
  s = await step(page, 1200)
  expect(s.player.grounded).toBe(true)

  // Wall hug: next to the left wall, jump while pushing into it.
  await page.evaluate(() => window.__arena.teleport({ x: -20.5, y: 0.95, z: 6 }))
  await step(page, 300)
  await input(page, { x: -1 })
  await input(page, 'jump')
  s = await step(page, 600)
  expect(s.player.wall).toEqual({ x: 1, z: 0 })
  expect(s.player.vel.y).toBeCloseTo(-2.2, 3)

  // ...and kick off it.
  await input(page, 'jump')
  s = await step(page, 50)
  expect(s.player.lastJump).toBe('wall')
  expect(s.player.vel.x).toBeGreaterThan(4)
})

test('rewind: snapshot, play on, restore, replay = identical', async ({ page }) => {
  await openArena(page)
  await step(page, 800)
  const snap = await page.evaluate(() => window.__arena.snapshot())
  const play = async () => {
    await input(page, { x: 0.6, y: 1, sprint: true })
    await input(page, 'jump')
    return step(page, 1500)
  }
  const first = await play()
  await page.evaluate((s) => window.__arena.restore(s), snap)
  await input(page, 'stop')
  const second = await play()
  expect(second).toEqual(first)
})

test('the loop is deterministic: same inputs, same state, after a full reload', async ({
  page,
}) => {
  const script = async () => {
    await openArena(page)
    await page.evaluate(() => window.__arena.seed(42))
    const plan = [
      [{ x: 0, y: 0 }, 700],
      [{ x: 0.3, y: 1 }, 1800],
      [{ x: 1, y: -0.2 }, 2400],
      [{ x: -1, y: -1 }, 3100],
      [{ x: 0, y: 0 }, 400],
    ]
    for (const [move, ms] of plan) {
      await input(page, move)
      await step(page, ms)
    }
    return page.evaluate(() => window.__arena.state())
  }
  const first = await script()
  // openArena() does a full page load: a fresh JS context, fresh Rapier world.
  const second = await script()
  expect(second).toEqual(first)
  expect(first.seed).toBe(42)
  expect(first.tick).toBe(42 + 108 + 144 + 186 + 24)
})

test('leaving the page frees the WebGL context, every visit', async ({ page }) => {
  // Count WebGL contexts from outside the app: created, and still alive.
  await page.addInitScript(() => {
    const orig = HTMLCanvasElement.prototype.getContext
    const gl = (window.__gl = { created: 0, live: 0, maxLive: 0 })
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
      const ctx = orig.call(this, type, ...rest)
      if (ctx && /webgl/i.test(type) && !this.__glCounted) {
        this.__glCounted = true
        gl.created++
        gl.live++
        gl.maxLive = Math.max(gl.maxLive, gl.live)
        this.addEventListener('webglcontextlost', () => gl.live--, { once: true })
      }
      return ctx
    }
  })

  await page.goto('/dashboard')
  for (let visit = 1; visit <= 2; visit++) {
    // In-app navigation (router), the way you actually move around the app.
    await page.getByRole('link', { name: /arena/i }).click()
    await page.waitForFunction(
      () => window.__arena?.ready === true || document.querySelector('canvas[data-arena]'),
    )
    await expect(page.locator('canvas[data-arena="canvas"]')).toHaveCount(1)
    await page.getByRole('link', { name: /dashboard/i }).click()
    await expect(page.locator('canvas[data-arena="canvas"]')).toHaveCount(0)
    await page.waitForFunction((n) => window.__gl.live === 0 && window.__gl.created === n, visit)
  }
  const gl = await page.evaluate(() => window.__gl)
  expect(gl).toEqual({ created: 2, live: 0, maxLive: 1 })
})

test('real-time mode: no test hook, the clock runs, and the keyboard walks', async ({ page }) => {
  await page.goto('/arena')
  await expect(page.locator('canvas[data-arena="canvas"]')).toBeVisible()
  expect(await page.evaluate(() => window.__arena)).toBeUndefined()

  // The HUD line reads "pos x y z". Wait for the fall to finish on its own.
  const hudPos = async () => {
    const text = await page.getByTestId('arena-pos').textContent()
    return text.replace('pos', '').trim().split(/\s+/).map(Number)
  }
  await expect(page.getByText('grounded')).toBeVisible()
  const [, , z0] = await hudPos()

  await page.keyboard.down('KeyS') // backwards, away from the dummy
  await page.waitForTimeout(1200)
  await page.keyboard.up('KeyS')
  await page.waitForTimeout(400) // HUD refreshes 5x a second
  const [, , z1] = await hudPos()
  expect(z1 - z0).toBeGreaterThan(1) // moved back (+z) in real time

  // Space jumps: the HUD reads "airborne" for a moment.
  await page.keyboard.down('Space')
  await expect(page.getByTestId('arena-motion')).toHaveText(/airborne/, { timeout: 2000 })
  await page.keyboard.up('Space')
})

test('the fight: J J J combos the dummy, the HUD shows it, the dummy fights back', async ({
  page,
}) => {
  await openArena(page)
  await page.evaluate(() => window.__arena.teleport({ x: 0, y: 0.95, z: 3 }))
  await step(page, 300)
  const events = []
  const tap = async (b, ms) => {
    await input(page, b)
    const s = await step(page, ms)
    events.push(...s.events)
    return s
  }
  // Light, Light, Light, each pressed while the previous hit is under way.
  for (let i = 0; i < 3; i++) {
    await input(page, 'light')
    for (let k = 0; k < 10; k++) events.push(...(await step(page, 17)).events)
  }
  await tap('stop', 1)
  // The combo counter is on screen while the string lands.
  await expect(page.getByTestId('combo')).toHaveText(/[23] HITS/)
  for (let k = 0; k < 40; k++) events.push(...(await step(page, 17)).events)
  const hits = events.filter((e) => e.type === 'hit').map((e) => e.move)
  expect(hits).toEqual(['L1', 'L2', 'L3'])
  let s = await page.evaluate(() => window.__arena.state())
  expect(s.dummy.hp).toBe(79)
  await expect(page.getByTestId('hp-dummy')).toHaveAttribute('style', /width: 79%/)

  // Let the dummy fight: within ten seconds of standing next to it, it hits you.
  await page.evaluate(() => window.__arena.dummy('auto'))
  s = await step(page, 10000)
  expect(s.player.hp).toBeLessThan(100)
})

test('screenshots: a hit landing, running, a ledge jump, a wall cling', async ({ page }) => {
  await openArena(page)
  // A heavy blow landing on the dummy, frozen in the hitstop.
  await page.evaluate(() => window.__arena.teleport({ x: 0.4, y: 0.95, z: 3.4 }))
  await step(page, 300)
  await input(page, 'heavy')
  let s
  for (let i = 0; i < 40; i++) {
    s = await step(page, 17)
    if (s.events.length) break
  }
  expect(s.events[0]?.type).toBe('hit')
  await page.screenshot({ path: `${SHOTS}arena-m3-hit.png` })

  // The dummy blocking a jab.
  await step(page, 1200)
  await page.evaluate(() => window.__arena.dummy('block'))
  await step(page, 400)
  await input(page, 'light')
  await step(page, 150)
  await page.screenshot({ path: `${SHOTS}arena-m3-block.png` })

  // Running across the hall.
  await page.evaluate(() => window.__arena.dummy('idle'))
  await page.evaluate(() => window.__arena.teleport({ x: 6, y: 0.95, z: 12 }))
  await input(page, { x: -0.5, y: 1, sprint: true })
  await step(page, 900)
  await page.screenshot({ path: `${SHOTS}arena-m3-run.png` })

  // Jump onto the low ledge (back-left).
  await page.evaluate(() => window.__arena.teleport({ x: -14, y: 0.95, z: -8 }))
  await input(page, { x: -1, y: 0, sprint: false })
  await step(page, 200)
  await input(page, 'jump')
  await step(page, 330)
  await page.screenshot({ path: `${SHOTS}arena-m3-jump.png` })

  // Cling to the right-hand wall.
  await page.evaluate(() => window.__arena.teleport({ x: 20.5, y: 0.95, z: -6 }))
  await input(page, { x: 1, y: 0 })
  await step(page, 300)
  await input(page, 'jump')
  await step(page, 700)
  expect((await page.evaluate(() => window.__arena.state())).player.wall).not.toBeNull()
  await page.screenshot({ path: `${SHOTS}arena-m3-wall.png` })
})

test.describe('phone (390 px)', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  for (const path of ['/dashboard', '/arena?test=1']) {
    test(`no horizontal overflow on ${path} with Arena in the nav`, async ({ page }) => {
      await page.goto(path)
      await expect(page.getByRole('link', { name: /arena/i })).toBeVisible()
      if (path.startsWith('/arena'))
        await page.waitForFunction(() => window.__arena?.ready === true)
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow).toBeLessThanOrEqual(0)
      if (path.startsWith('/arena')) await page.screenshot({ path: `${SHOTS}arena-m3-phone.png` })
    })
  }
})
