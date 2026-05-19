import type { Page } from '@playwright/test'

/**
 * Navigates to a URL after setting the locale cookie to the given value.
 * The Ultranos PWA apps use next-intl with cookie-based locale detection,
 * so setting `NEXT_LOCALE` before navigation triggers the correct dir.
 */
export async function renderInRTL(page: Page, url: string, locale = 'ar'): Promise<void> {
  // All test servers run on localhost. Setting the cookie domain to localhost
  // ensures it is sent regardless of which port the project uses.
  await page.context().addCookies([
    {
      name: 'NEXT_LOCALE',
      value: locale,
      domain: 'localhost',
      path: '/',
    },
  ])

  await page.goto(url, { waitUntil: 'networkidle' })
}

/**
 * Navigates to a URL in LTR mode (English locale).
 */
export async function renderInLTR(page: Page, url: string): Promise<void> {
  await renderInRTL(page, url, 'en')
}
