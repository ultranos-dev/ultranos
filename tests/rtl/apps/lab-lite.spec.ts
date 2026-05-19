import { test, expect } from '@playwright/test'
import { renderInRTL, renderInLTR } from '../helpers/rtl-helpers'

/**
 * Lab Lite page-level RTL snapshot tests.
 *
 * Captures screenshots of key pages in both LTR and RTL modes.
 * Pages: /login, / (upload dashboard), /upload
 */

test.describe('Lab Lite — RTL Page Snapshots', () => {
  const isRTL = () => test.info().project.name.includes('rtl')
  const direction = () => (isRTL() ? 'rtl' : 'ltr')

  test('Login page renders correctly', async ({ page }) => {
    const dir = direction()
    if (dir === 'rtl') {
      await renderInRTL(page, '/login')
    } else {
      await renderInLTR(page, '/login')
    }

    await expect(page).toHaveScreenshot(`lab-login-${dir}.png`, {
      fullPage: true,
    })
  })

  test('Dashboard page renders correctly', async ({ page }) => {
    const dir = direction()
    if (dir === 'rtl') {
      await renderInRTL(page, '/')
    } else {
      await renderInLTR(page, '/')
    }

    await expect(page).toHaveScreenshot(`lab-dashboard-${dir}.png`, {
      fullPage: true,
    })
  })

  test('Upload page renders correctly', async ({ page }) => {
    const dir = direction()
    if (dir === 'rtl') {
      await renderInRTL(page, '/upload')
    } else {
      await renderInLTR(page, '/upload')
    }

    await expect(page).toHaveScreenshot(`lab-upload-${dir}.png`, {
      fullPage: true,
    })
  })
})
