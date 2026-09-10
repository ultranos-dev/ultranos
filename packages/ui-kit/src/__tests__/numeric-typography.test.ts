/**
 * numeric-typography.test.ts
 *
 * Guards the "digits render in Google Space Mono" mechanism on the web PWAs.
 *
 * The trick: a self-hosted @font-face named 'Space Mono Numeric' whose
 * unicode-range is restricted to number glyphs (digits + currency + %) is
 * declared FIRST in the shared font stacks. Per-glyph fallback then renders
 * only numbers in Space Mono while letters fall through to Manrope / Noto.
 * These tests assert every link in that chain: the Tailwind preset ordering,
 * the tokens.css stack ordering (LTR + RTL), and each app's fonts-numeric.css
 * + <head> link + self-hosted woff2 files.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import preset from '../tailwind.preset'

const APPS = ['admin-portal', 'opd-lite', 'pharmacy-lite', 'lab-lite'] as const
const appsDir = resolve(__dirname, '../../../../apps')
const NUMERIC_FAMILY = 'Space Mono Numeric'

describe('tailwind.preset numeric font ordering', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fam = (preset as any).theme.extend.fontFamily

  it('lists Space Mono Numeric first in the sans stack', () => {
    expect(fam.sans[0]).toBe(NUMERIC_FAMILY)
  })

  it('lists Space Mono Numeric first in the heading stack', () => {
    expect(fam.heading[0]).toBe(NUMERIC_FAMILY)
  })

  it('exposes a font-numeric utility mapped to the FULL Space Mono face (whole-value)', () => {
    // Distinct from the digit-only 'Space Mono Numeric' used in sans/heading:
    // font-numeric renders letters + separators too (full dates, times, AFN/USD).
    expect(fam.numeric[0]).toBe('Space Mono')
  })
})

describe('tokens.css numeric font stacks', () => {
  const css = readFileSync(resolve(__dirname, '../tokens.css'), 'utf-8')

  it('prepends Space Mono Numeric to --font-sans', () => {
    expect(css).toMatch(/--font-sans:\s*'Space Mono Numeric'/)
  })

  it('prepends Space Mono Numeric to --font-heading', () => {
    expect(css).toMatch(/--font-heading:\s*'Space Mono Numeric'/)
  })

  it('keeps numbers mono in RTL via the Arabic serif stack', () => {
    // [dir="rtl"] switches --font-sans/--font-heading to --font-family-serif-ar,
    // which must itself lead with the numeric family.
    expect(css).toMatch(/--font-family-serif-ar:\s*'Space Mono Numeric'/)
    expect(css).toMatch(/--font-family-sans-ar:\s*'Space Mono Numeric'/)
  })
})

describe.each(APPS)('%s numeric font wiring', (app) => {
  const cssPath = resolve(appsDir, app, 'public/fonts-numeric.css')
  const css = existsSync(cssPath) ? readFileSync(cssPath, 'utf-8') : ''

  it('ships a public/fonts-numeric.css', () => {
    expect(existsSync(cssPath)).toBe(true)
  })

  it('declares the Space Mono Numeric @font-face', () => {
    expect(css).toContain("font-family: 'Space Mono Numeric'")
  })

  it('covers digits + currency + percent + date/time separators', () => {
    expect(css).toContain('U+0030-0039') // 0-9
    expect(css).toContain('U+0024') // $
    expect(css).toContain('U+0025') // %
    expect(css).toContain('U+002D') // -  (date ranges, negatives)
    expect(css).toContain('U+002F') // /  (dates: 20/06/2026)
    expect(css).toContain('U+003A') // :  (times: 14:30)
  })

  it('still excludes comma and period so prose punctuation is NOT mono', () => {
    // ',' and '.' appear pervasively in prose — monoing them would flip all
    // sentence punctuation. Whole currency values use the font-numeric opt-in instead.
    expect(css).not.toContain('U+002C') // ,
    expect(css).not.toContain('U+002E') // .
  })

  it('renders numbers at REGULAR weight only (no bold face → no heavy digits)', () => {
    // Single regular face declared across the full weight range so digits stay
    // regular even inside headings/semibold text. A 700 face would make them heavy.
    expect(css).toContain('font-weight: 100 900')
    expect(css).not.toContain('font-weight: 700')
    expect(css).not.toContain('font-weight: 400')
    expect(css).toContain('font-display: swap')
  })

  it('provides a full Space Mono face (no unicode-range) for whole-value opt-in', () => {
    // The full face has no unicode-range restriction; the numeric face does.
    expect(css).toContain("font-family: 'Space Mono'")
    const fullFaceBlock = css.split('@font-face').find((b) => b.includes("'Space Mono'") && !b.includes("'Space Mono Numeric'"))
    expect(fullFaceBlock).toBeDefined()
    expect(fullFaceBlock).not.toContain('unicode-range')
  })

  it('references self-hosted woff2 (offline-first, not a CDN)', () => {
    expect(css).not.toContain('fonts.gstatic.com')
    expect(css).not.toContain('fonts.googleapis.com')
    expect(css).toContain("url('/fonts/space-mono/")
  })

  it('has the self-hosted regular woff2 on disk', () => {
    const fontsDir = resolve(appsDir, app, 'public/fonts/space-mono')
    expect(existsSync(resolve(fontsDir, 'SpaceMono-Regular.woff2'))).toBe(true)
  })

  it('links fonts-numeric.css from the root layout <head>', () => {
    const layout = readFileSync(resolve(appsDir, app, 'src/app/layout.tsx'), 'utf-8')
    expect(layout).toContain('/fonts-numeric.css')
  })
})
