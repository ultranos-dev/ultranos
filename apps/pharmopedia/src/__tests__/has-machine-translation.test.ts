import { describe, it, expect } from 'vitest'
import { hasMachineTranslatedContent } from '@/lib/localized-text'

describe('hasMachineTranslatedContent', () => {
  it('true when a field is machine-translated for the language', () => {
    expect(hasMachineTranslatedContent({ summaryPlain: { prs: 'machine' } }, 'prs')).toBe(true)
  })
  it('false for English, missing status, or confirmed-only', () => {
    expect(hasMachineTranslatedContent({ summaryPlain: { prs: 'machine' } }, 'en')).toBe(false)
    expect(hasMachineTranslatedContent(undefined, 'prs')).toBe(false)
    expect(hasMachineTranslatedContent({}, 'prs')).toBe(false)
    expect(hasMachineTranslatedContent({ summaryPlain: { prs: 'confirmed' } }, 'prs')).toBe(false)
    expect(hasMachineTranslatedContent({ summaryPlain: { ar: 'machine' } }, 'prs')).toBe(false)
  })
})
