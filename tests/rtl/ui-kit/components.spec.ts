import { test, expect } from '@playwright/test'

/**
 * UI Kit component RTL snapshot tests.
 *
 * Captures screenshots of each patient-facing component in both LTR and RTL
 * modes via the test harness at localhost:3010. The Playwright projects
 * (ui-kit-ltr / ui-kit-rtl) run these tests in their respective directions.
 */

test.describe('UI Kit Components — RTL Snapshots', () => {
  test('AppShell renders correctly', async ({ page }) => {
    const isRTL = test.info().project.name.includes('rtl')
    const direction = isRTL ? 'rtl' : 'ltr'

    await page.goto(`/?dir=${direction}`)
    await page.waitForLoadState('networkidle')

    const section = page.locator('[data-testid="appshell"]')
    await expect(section).toBeVisible()
    await expect(section).toHaveScreenshot(`appshell-${direction}.png`)
  })

  test('DirectionalIcon navigation renders correctly', async ({ page }) => {
    const isRTL = test.info().project.name.includes('rtl')
    const direction = isRTL ? 'rtl' : 'ltr'

    await page.goto(`/?dir=${direction}`)
    await page.waitForLoadState('networkidle')

    const section = page.locator('[data-testid="directional-icon-nav"]')
    await expect(section).toBeVisible()
    await expect(section).toHaveScreenshot(`directional-icon-nav-${direction}.png`)
  })

  test('DirectionalIcon medical renders correctly', async ({ page }) => {
    const isRTL = test.info().project.name.includes('rtl')
    const direction = isRTL ? 'rtl' : 'ltr'

    await page.goto(`/?dir=${direction}`)
    await page.waitForLoadState('networkidle')

    const section = page.locator('[data-testid="directional-icon-medical"]')
    await expect(section).toBeVisible()
    await expect(section).toHaveScreenshot(`directional-icon-medical-${direction}.png`)
  })

  test('LanguageSelector renders correctly', async ({ page }) => {
    const isRTL = test.info().project.name.includes('rtl')
    const direction = isRTL ? 'rtl' : 'ltr'

    await page.goto(`/?dir=${direction}`)
    await page.waitForLoadState('networkidle')

    const section = page.locator('[data-testid="language-selector"]')
    await expect(section).toBeVisible()
    await expect(section).toHaveScreenshot(`language-selector-${direction}.png`)
  })

  test('ClinicalTerm renders correctly', async ({ page }) => {
    const isRTL = test.info().project.name.includes('rtl')
    const direction = isRTL ? 'rtl' : 'ltr'

    await page.goto(`/?dir=${direction}`)
    await page.waitForLoadState('networkidle')

    const section = page.locator('[data-testid="clinical-term"]')
    await expect(section).toBeVisible()
    await expect(section).toHaveScreenshot(`clinical-term-${direction}.png`)
  })

  test('SessionWarningToast renders correctly', async ({ page }) => {
    const isRTL = test.info().project.name.includes('rtl')
    const direction = isRTL ? 'rtl' : 'ltr'

    await page.goto(`/?dir=${direction}`)
    await page.waitForLoadState('networkidle')

    const section = page.locator('[data-testid="session-warning"]')
    await expect(section).toBeVisible()
    await expect(section).toHaveScreenshot(`session-warning-${direction}.png`)
  })

  test('StaleDataBanner renders correctly', async ({ page }) => {
    const isRTL = test.info().project.name.includes('rtl')
    const direction = isRTL ? 'rtl' : 'ltr'

    await page.goto(`/?dir=${direction}`)
    await page.waitForLoadState('networkidle')

    const section = page.locator('[data-testid="stale-data-banner"]')
    await expect(section).toBeVisible()
    await expect(section).toHaveScreenshot(`stale-data-banner-${direction}.png`)
  })

  test('ReAuthModal renders correctly', async ({ page }) => {
    const isRTL = test.info().project.name.includes('rtl')
    const direction = isRTL ? 'rtl' : 'ltr'

    await page.goto(`/?dir=${direction}&modal=reauth`)
    await page.waitForLoadState('networkidle')

    const section = page.locator('[data-testid="reauth-modal"]')
    await expect(section).toBeVisible()
    await expect(section).toHaveScreenshot(`reauth-modal-${direction}.png`)
  })
})
