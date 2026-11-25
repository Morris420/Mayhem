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
}

const step = (page, ms) => page.evaluate((ms) => window.__arena.step(ms), ms)
const input = (page, a) => page.evaluate((a) => window.__arena.input(a), a)

test('the arena loads and actually draws the neon room', async ({ page }) => {
  await openArena(page)
  await expect(page.locator('canvas[data-arena="canvas"]')).toBeVisible()

  const px = await page.evaluate(() => window.__arena.pixels())
  expect(px.width).toBeGreaterThan(300)
  expect(px.lit, 'share of non-black pixels').toBeGreaterThan(0.05)
  expect(px.cyan, 'share of neon-cyan pixels (trim, grid, ring, capsule edge)').toBeGreaterThan(
    0.002,
  )

  // Budget: a handful of scene draw calls plus the bloom passes (playbook §6).
  const dbg = await page.evaluate(() => window.__arena.debug())
  expect(dbg.drawCalls).toBeGreaterThan(5)
  expect(dbg.drawCalls).toBeLessThan(40)
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

  // Holds right for six seconds: stops at the wall (inner face x = 12, radius 0.4).
  await input(page, { x: 1, y: 0 })
  s = await step(page, 6000)
  expect(s.player.pos.x).toBeGreaterThan(11.5)
  expect(s.player.pos.x).toBeLessThan(11.6 + 0.001)

  // Teleport up high and drop again: falling works anywhere, not only at spawn.
  await input(page, 'stop')
  s = await page.evaluate(() => window.__arena.teleport({ x: -3, y: 6, z: 2 }))
  expect(s.player.grounded).toBe(false)
  s = await step(page, 1500)
  expect(s.player.grounded).toBe(true)

  // Combat inputs are recognised but not live yet; garbage is rejected loudly.
  expect(await input(page, 'attack')).toEqual({
    accepted: false,
    reason: 'combat actions arrive in M4',
  })
  await expect(page.evaluate(() => window.__arena.input('jump-to-moon'))).rejects.toThrow(
    /Unknown arena input/,
  )
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

  await page.keyboard.down('KeyW')
  await page.waitForTimeout(1200)
  await page.keyboard.up('KeyW')
  await page.waitForTimeout(400) // HUD refreshes 5x a second
  const [, , z1] = await hudPos()
  expect(z0 - z1).toBeGreaterThan(1) // moved forward (-z) in real time
})

test('screenshots: landed in the room, and mid-fall', async ({ page }) => {
  await openArena(page)
  // Land, then walk forward-left so the capsule turns and shows its visor.
  await step(page, 1000)
  await input(page, { x: -0.6, y: 1 })
  await step(page, 900)
  await input(page, { x: -1, y: 0.2 })
  await step(page, 250)
  await input(page, 'stop')
  await step(page, 300)
  await page.screenshot({ path: `${SHOTS}arena-m1.png` })

  await page.evaluate(() => window.__arena.teleport({ x: 2, y: 3.2, z: 3 }))
  await step(page, 150)
  const s = await page.evaluate(() => window.__arena.state())
  expect(s.player.grounded).toBe(false)
  await page.screenshot({ path: `${SHOTS}arena-m1-falling.png` })
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
      if (path.startsWith('/arena')) await page.screenshot({ path: `${SHOTS}arena-m1-phone.png` })
    })
  }
})
