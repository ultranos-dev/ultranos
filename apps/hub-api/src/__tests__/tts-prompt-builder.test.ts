import { describe, it, expect } from 'vitest'
import { buildTTSPrompt, getDisclaimer } from '../lib/tts-prompt-builder'
import type { MedicationTTSInput, TTSDialect } from '../lib/tts-prompt-builder'

const sampleInput: MedicationTTSInput = {
  medicationName: 'Amoxicillin 500mg',
  dosageInstruction: 'Take one capsule',
  frequency: 'three times daily',
  duration: '7 days',
  timeOfDay: 'morning, afternoon, and evening',
  caution: 'Take with food',
}

const minimalInput: MedicationTTSInput = {
  medicationName: 'Ibuprofen 200mg',
  dosageInstruction: 'Take one tablet',
  frequency: 'twice daily',
  duration: '',
}

describe('buildTTSPrompt', () => {
  it('generates correct English structured text', () => {
    const result = buildTTSPrompt(sampleInput, 'EN')

    expect(result).toContain('Amoxicillin 500mg')
    expect(result).toContain('Take one capsule')
    expect(result).toContain('three times daily')
    expect(result).toContain('7 days')
    expect(result).toContain('morning, afternoon, and evening')
    expect(result).toContain('Take with food')
  })

  it('generates correct Levantine Arabic text', () => {
    const result = buildTTSPrompt(sampleInput, 'AR_LEVANTINE')

    expect(result).toContain('Amoxicillin 500mg')
    expect(result).toContain('الدوا تبعك')
  })

  it('generates correct Gulf Arabic text', () => {
    const result = buildTTSPrompt(sampleInput, 'AR_GULF')

    expect(result).toContain('Amoxicillin 500mg')
    expect(result).toContain('دواك هو')
  })

  it('generates correct Dari text', () => {
    const result = buildTTSPrompt(sampleInput, 'DARI')

    expect(result).toContain('Amoxicillin 500mg')
    expect(result).toContain('دوای شما')
  })

  it('includes disclaimer in all dialects', () => {
    const dialects: TTSDialect[] = ['EN', 'AR_LEVANTINE', 'AR_GULF', 'DARI']

    for (const dialect of dialects) {
      const result = buildTTSPrompt(sampleInput, dialect)
      const disclaimer = getDisclaimer(dialect)
      expect(result).toContain(disclaimer)
    }
  })

  it('handles minimal input without optional fields', () => {
    const result = buildTTSPrompt(minimalInput, 'EN')

    expect(result).toContain('Ibuprofen 200mg')
    expect(result).toContain('Take one tablet')
    expect(result).toContain('twice daily')
    // Should not contain optional field markers when not provided
    expect(result).not.toContain('Important:')
    expect(result).not.toContain('Best time:')
  })
})

describe('getDisclaimer', () => {
  it('returns English disclaimer for EN', () => {
    expect(getDisclaimer('EN')).toBe(
      "This is a simplified explanation. Always follow your doctor's direct instructions.",
    )
  })

  it('returns Arabic disclaimer for AR_LEVANTINE', () => {
    const disclaimer = getDisclaimer('AR_LEVANTINE')
    expect(disclaimer).toContain('شرح مبسّط')
  })

  it('returns Dari disclaimer for DARI', () => {
    const disclaimer = getDisclaimer('DARI')
    expect(disclaimer).toContain('توضیح ساده')
  })
})
