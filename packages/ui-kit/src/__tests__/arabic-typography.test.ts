import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { typography, rtlTypography, arabicFontFiles } from '../tokens.js'

describe('Arabic font family tokens', () => {
  it('defines sans-ar font stack with Noto Sans Arabic', () => {
    expect(typography.fontFamily['sans-ar']).toContain('Noto Sans Arabic')
  })

  it('defines serif-ar font stack with Noto Naskh Arabic', () => {
    expect(typography.fontFamily['serif-ar']).toContain('Noto Naskh Arabic')
  })

  it('sans-ar has proper fallback chain: Arabic → system Arabic → sans-serif', () => {
    const stack = typography.fontFamily['sans-ar']
    expect(stack).toContain('Tahoma')
    expect(stack).toContain('sans-serif')
  })

  it('serif-ar has proper fallback chain: Arabic → system Arabic → serif', () => {
    const stack = typography.fontFamily['serif-ar']
    expect(stack).toContain('Traditional Arabic')
    expect(stack).toContain('serif')
  })
})

describe('RTL typography adjustments', () => {
  it('applies 1.15x text size multiplier for Arabic', () => {
    expect(rtlTypography.textSizeMultiplier).toBe(1.15)
  })

  it('uses 1.8 line height for Arabic diacritical marks', () => {
    expect(rtlTypography.lineHeightBody).toBe(1.8)
  })

  it('LTR defaults are 1x multiplier and 1.5 line height', () => {
    expect(rtlTypography.ltr.textSizeMultiplier).toBe(1)
    expect(rtlTypography.ltr.lineHeightBody).toBe(1.5)
  })

  it('Arabic multiplier is greater than LTR default', () => {
    expect(rtlTypography.textSizeMultiplier).toBeGreaterThan(rtlTypography.ltr.textSizeMultiplier)
  })
})

describe('Arabic font files', () => {
  it('lists all 5 required font files', () => {
    expect(arabicFontFiles).toHaveLength(5)
  })

  it('includes Noto Sans Arabic in 3 weights (400, 500, 700)', () => {
    expect(arabicFontFiles).toContain('NotoSansArabic-Regular.woff2')
    expect(arabicFontFiles).toContain('NotoSansArabic-Medium.woff2')
    expect(arabicFontFiles).toContain('NotoSansArabic-Bold.woff2')
  })

  it('includes Noto Naskh Arabic in 2 weights (400, 700)', () => {
    expect(arabicFontFiles).toContain('NotoNaskhArabic-Regular.woff2')
    expect(arabicFontFiles).toContain('NotoNaskhArabic-Bold.woff2')
  })

  it('all font files use WOFF2 format', () => {
    for (const file of arabicFontFiles) {
      expect(file).toMatch(/\.woff2$/)
    }
  })

  it('font files exist in packages/ui-kit/public/fonts/', () => {
    const fontsDir = resolve(__dirname, '../../public/fonts')
    for (const file of arabicFontFiles) {
      expect(existsSync(resolve(fontsDir, file))).toBe(true)
    }
  })
})

describe('fonts-arabic.css declarations', () => {
  const cssPath = resolve(__dirname, '../styles/fonts-arabic.css')
  const css = readFileSync(cssPath, 'utf-8')

  it('declares Noto Sans Arabic @font-face rules', () => {
    expect(css).toContain("font-family: 'Noto Sans Arabic'")
  })

  it('declares Noto Naskh Arabic @font-face rules', () => {
    expect(css).toContain("font-family: 'Noto Naskh Arabic'")
  })

  it('uses font-display: swap for all declarations', () => {
    const fontFaceBlocks = css.split('@font-face')
    // 5 @font-face blocks + 1 preamble = 6 parts
    for (const block of fontFaceBlocks.slice(1)) {
      expect(block).toContain('font-display: swap')
    }
  })

  it('defines unicode-range for Arabic code points', () => {
    expect(css).toContain('U+0600-06FF')
    expect(css).toContain('U+FB50-FDFF')
    expect(css).toContain('U+FE70-FEFF')
  })

  it('includes basic Latin range for mixed content', () => {
    expect(css).toContain('U+0000-007F')
  })

  it('references self-hosted font paths (not CDN)', () => {
    expect(css).not.toContain('fonts.googleapis.com')
    expect(css).not.toContain('fonts.gstatic.com')
    expect(css).toContain("url('/fonts/")
  })

  it('declares correct weights for Noto Sans Arabic (400, 500, 700)', () => {
    expect(css).toContain('font-weight: 400')
    expect(css).toContain('font-weight: 500')
    expect(css).toContain('font-weight: 700')
  })
})

describe('tokens.css RTL overrides', () => {
  const cssPath = resolve(__dirname, '../tokens.css')
  const css = readFileSync(cssPath, 'utf-8')

  it('defines --text-size-multiplier custom property', () => {
    expect(css).toContain('--text-size-multiplier')
  })

  it('defines --line-height-body custom property', () => {
    expect(css).toContain('--line-height-body')
  })

  it('sets RTL multiplier to 1.15', () => {
    expect(css).toContain('--text-size-multiplier: 1.15')
  })

  it('sets RTL line height to 1.8', () => {
    expect(css).toContain('--line-height-body: 1.8')
  })

  it('defines Arabic font family CSS custom properties', () => {
    expect(css).toContain('--font-family-sans-ar')
    expect(css).toContain('--font-family-serif-ar')
  })

  it('overrides --font-family-sans in RTL context', () => {
    // [dir="rtl"] should switch the sans font to Arabic
    expect(css).toContain('[dir="rtl"]')
    expect(css).toContain('--font-family-sans: var(--font-family-sans-ar)')
  })
})
