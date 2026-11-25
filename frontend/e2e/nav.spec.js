// The top nav must never run under the username / log-out button, at any width.
// Before the arena it already overlapped between 640 and 1024 px; the eighth link
// (Arena) pushed 1280 px over too. Labels now show only from 1280 px (xl) up.
import { expect, test } from '@playwright/test'

for (const width of [390, 640, 768, 1024, 1280, 1440]) {
  test(`nav fits at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 })
    await page.goto('/dashboard')
    await expect(page.getByRole('link', { name: 'Arena' })).toBeVisible()
    const fit = await page.evaluate(() => {
      const [left, right] = document.querySelector('header nav').children
      const lastLink = [...left.querySelectorAll('a')].pop().getBoundingClientRect()
      return {
        clipped: left.scrollWidth - left.clientWidth, // links squeezed out of their box
        gap: right.getBoundingClientRect().left - lastLink.right, // space before log-out
        logoutHeight: right.querySelector('button').getBoundingClientRect().height, // wrapped = taller
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      }
    })
    expect(fit.clipped).toBeLessThanOrEqual(0)
    expect(fit.gap).toBeGreaterThanOrEqual(0)
    expect(fit.logoutHeight).toBeLessThan(40)
    expect(fit.overflow).toBeLessThanOrEqual(0)
  })
}
