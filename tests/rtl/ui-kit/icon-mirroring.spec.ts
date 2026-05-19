import { test, expect } from '@playwright/test'

/**
 * Icon mirroring validation tests (AC #9).
 *
 * Verifies that:
 * - Navigation icons (ChevronRight, arrows) mirror in RTL via scaleX(-1)
 * - Medical icons (pill, stethoscope) do NOT mirror in RTL
 *
 * These tests use the ui-kit test harness and inspect computed styles
 * to validate the CSS custom property mechanism.
 */

test.describe('Icon Mirroring Validation', () => {
  const isRTL = () => test.info().project.name.includes('rtl')
  const direction = () => (isRTL() ? 'rtl' : 'ltr')

  test('navigation icon computed transform matches direction', async ({ page }) => {
    const dir = direction()
    await page.goto(`/?dir=${dir}`)
    await page.waitForLoadState('networkidle')

    const navIconSpan = page.locator('[data-testid="directional-icon-nav"] span[aria-hidden="true"]')
    await expect(navIconSpan).toBeVisible()

    const transform = await navIconSpan.evaluate((el) => {
      return window.getComputedStyle(el).transform
    })

    // Navigation icons: scaleX(-1) → matrix(-1, 0, 0, 1, 0, 0) in RTL, 'none' in LTR
    const expected = dir === 'rtl' ? 'matrix(-1, 0, 0, 1, 0, 0)' : 'none'
    expect(transform).toBe(expected)
  })

  test('medical icon never mirrors regardless of direction', async ({ page }) => {
    const dir = direction()
    await page.goto(`/?dir=${dir}`)
    await page.waitForLoadState('networkidle')

    const medicalIconSpan = page.locator('[data-testid="directional-icon-medical"] span[aria-hidden="true"]')
    await expect(medicalIconSpan).toBeVisible()

    const transform = await medicalIconSpan.evaluate((el) => {
      return window.getComputedStyle(el).transform
    })

    // Medical icons must NEVER mirror — transform should be 'none' in both directions
    expect(transform).toBe('none')
  })

  test('visual comparison: navigation icon', async ({ page }) => {
    const dir = direction()
    await page.goto(`/?dir=${dir}`)
    await page.waitForLoadState('networkidle')

    const section = page.locator('[data-testid="directional-icon-nav"]')
    await expect(section).toHaveScreenshot(`icon-nav-${dir}.png`)
  })

  test('visual comparison: medical icon', async ({ page }) => {
    const dir = direction()
    await page.goto(`/?dir=${dir}`)
    await page.waitForLoadState('networkidle')

    const section = page.locator('[data-testid="directional-icon-medical"]')
    await expect(section).toHaveScreenshot(`icon-medical-${dir}.png`)
  })
})
