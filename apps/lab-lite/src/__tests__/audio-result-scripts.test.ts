/**
 * Tests for Story 45.4 — Plain-Language Audio Result Summaries
 * Tasks 9.1, 9.3, 9.11
 */

import { describe, it, expect } from 'vitest'
import {
  AUDIO_SCRIPT_REGISTRY,
  resolveAudioScript,
  isScriptApproved,
  isAutomatedApprover,
  validateScriptRegistry,
  type AudioResultScript,
  type Interpretation,
} from '../lib/audio-result-scripts'

// ---------------------------------------------------------------------------
// 9.1 — Registry resolves correct audio file per category + interpretation + locale
// ---------------------------------------------------------------------------

describe('resolveAudioScript — correct file resolution', () => {
  it('resolves CBC normal entry for en locale', () => {
    const script = resolveAudioScript('58410-2', 'cbc', 'normal')
    expect(script).not.toBeNull()
    expect(script!.audioFiles['en']).toBe('/audio/results/cbc/cbc-normal-en.mp3')
  })

  it('resolves CBC low entry for prs locale', () => {
    const script = resolveAudioScript('58410-2', 'cbc', 'low')
    expect(script).not.toBeNull()
    expect(script!.audioFiles['prs']).toBe('/audio/results/cbc/cbc-low-prs.mp3')
  })

  it('resolves CBC critical-low entry for ar locale', () => {
    const script = resolveAudioScript('58410-2', 'cbc', 'critical-low')
    expect(script).not.toBeNull()
    expect(script!.audioFiles['ar']).toBe('/audio/results/cbc/cbc-critical-low-ar.mp3')
  })

  it('resolves CBC critical-high entry for ps locale', () => {
    const script = resolveAudioScript('58410-2', 'cbc', 'critical-high')
    expect(script).not.toBeNull()
    expect(script!.audioFiles['ps']).toBe('/audio/results/cbc/cbc-critical-high-ps.mp3')
  })

  it('resolves lipid panel entry', () => {
    const script = resolveAudioScript('57698-3', 'lipidPanel', 'high')
    expect(script).not.toBeNull()
    expect(script!.testCategory).toBe('57698-3')
  })

  it('resolves HbA1c entry', () => {
    const script = resolveAudioScript('4548-4', 'hba1c', 'normal')
    expect(script).not.toBeNull()
    expect(script!.testCategory).toBe('4548-4')
  })

  it('resolves all 8 LOINC categories at normal interpretation', () => {
    const categories = [
      { code: '58410-2', field: 'cbc' },
      { code: '57698-3', field: 'lipidPanel' },
      { code: '4548-4', field: 'hba1c' },
      { code: '51990-0', field: 'metabolicPanel' },
      { code: '24325-3', field: 'liverFunction' },
      { code: '3016-3', field: 'tsh' },
      { code: '24356-8', field: 'urinalysis' },
      { code: '1558-6', field: 'fastingGlucose' },
    ]
    for (const { code, field } of categories) {
      const script = resolveAudioScript(code, field, 'normal')
      expect(script, `Expected script for ${code} / ${field} / normal`).not.toBeNull()
    }
  })

  it('returns null for unknown test category', () => {
    const script = resolveAudioScript('UNKNOWN-CODE', 'something', 'normal')
    expect(script).toBeNull()
  })

  it('returns null for unknown interpretation', () => {
    const script = resolveAudioScript(
      '58410-2',
      'cbc',
      'unknown' as Interpretation,
    )
    expect(script).toBeNull()
  })

  it('registry has all 4 locales for every entry', () => {
    for (const script of AUDIO_SCRIPT_REGISTRY) {
      expect(
        script.audioFiles['en'],
        `Missing en audio for ${script.id}`,
      ).toBeTruthy()
      expect(
        script.audioFiles['ar'],
        `Missing ar audio for ${script.id}`,
      ).toBeTruthy()
      expect(
        script.audioFiles['prs'],
        `Missing prs audio for ${script.id}`,
      ).toBeTruthy()
      expect(
        script.audioFiles['ps'],
        `Missing ps audio for ${script.id}`,
      ).toBeTruthy()
    }
  })

  it('registry has 40 entries (8 categories × 5 interpretations)', () => {
    expect(AUDIO_SCRIPT_REGISTRY).toHaveLength(40)
  })

  it('each entry has a plain-text fallback in all 4 locales', () => {
    for (const script of AUDIO_SCRIPT_REGISTRY) {
      for (const locale of ['en', 'ar', 'prs', 'ps']) {
        expect(
          script.plainTextScripts[locale],
          `Missing plain-text fallback for ${script.id} / ${locale}`,
        ).toBeTruthy()
      }
    }
  })
})

// ---------------------------------------------------------------------------
// 9.3 — validateScriptRegistry rejects entries without approvedBy
// ---------------------------------------------------------------------------

describe('validateScriptRegistry — physician approval enforcement', () => {
  it('throws when any entry has empty approvedBy', () => {
    const unapprovedEntry: AudioResultScript = {
      id: 'test-unapproved',
      testCategory: '58410-2',
      resultField: 'cbc',
      interpretation: 'normal',
      version: '1.0.0',
      approvedBy: '',
      approvedAt: '',
      audioFiles: { en: '/test.mp3', ar: '/test.mp3', prs: '/test.mp3', ps: '/test.mp3' },
      plainTextScripts: { en: 'text', ar: 'text', prs: 'text', ps: 'text' },
    }
    expect(() => validateScriptRegistry([unapprovedEntry])).toThrow(
      /without physician approval/,
    )
  })

  it('throws when any entry has approvedBy but empty approvedAt', () => {
    const partial: AudioResultScript = {
      id: 'test-partial',
      testCategory: '58410-2',
      resultField: 'cbc',
      interpretation: 'normal',
      version: '1.0.0',
      approvedBy: 'Dr. Smith',
      approvedAt: '',
      audioFiles: { en: '/test.mp3', ar: '/test.mp3', prs: '/test.mp3', ps: '/test.mp3' },
      plainTextScripts: { en: 'text', ar: 'text', prs: 'text', ps: 'text' },
    }
    expect(() => validateScriptRegistry([partial])).toThrow(
      /without physician approval/,
    )
  })

  it('passes when all entries have approvedBy and approvedAt set', () => {
    const approved: AudioResultScript = {
      id: 'test-approved',
      testCategory: '58410-2',
      resultField: 'cbc',
      interpretation: 'normal',
      version: '1.0.0',
      approvedBy: 'Dr. Jane Smith',
      approvedAt: '2026-01-01T00:00:00.000Z',
      audioFiles: { en: '/test.mp3', ar: '/test.mp3', prs: '/test.mp3', ps: '/test.mp3' },
      plainTextScripts: { en: 'text', ar: 'text', prs: 'text', ps: 'text' },
    }
    expect(() => validateScriptRegistry([approved])).not.toThrow()
  })

  it('passes for an empty registry', () => {
    expect(() => validateScriptRegistry([])).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// 9.11 — AI prohibition: no script entry has an AI/automated approver
// ---------------------------------------------------------------------------

describe('isAutomatedApprover — detects AI/automated values', () => {
  it.each([
    'AI Assistant',
    'GPT-4',
    'claude',
    'OpenAI',
    'Anthropic',
    'automated',
    'SYSTEM',
    'auto-approval',
    'bot',
    'LLM Service',
    'ML Pipeline',
    'machine learning',
  ])('detects "%s" as an automated approver', approver => {
    expect(isAutomatedApprover(approver)).toBe(true)
  })

  it.each([
    'Dr. Jane Smith',
    'Dr. Mohammad Hassan',
    'Dr. Fatima Rahimi',
    'Prof. Ahmed Al-Rashid',
  ])('does NOT flag "%s" as automated', approver => {
    expect(isAutomatedApprover(approver)).toBe(false)
  })
})

describe('AI prohibition — no registry entry has an automated approver', () => {
  it('all registry entries with a non-empty approvedBy use a non-automated approver', () => {
    const aiApproved = AUDIO_SCRIPT_REGISTRY.filter(
      s => s.approvedBy !== '' && isAutomatedApprover(s.approvedBy),
    )
    expect(aiApproved).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// isScriptApproved
// ---------------------------------------------------------------------------

describe('isScriptApproved', () => {
  function makeScript(approvedBy: string, approvedAt: string): AudioResultScript {
    return {
      id: 'test',
      testCategory: '58410-2',
      resultField: 'cbc',
      interpretation: 'normal',
      version: '1.0.0',
      approvedBy,
      approvedAt,
      audioFiles: { en: '', ar: '', prs: '', ps: '' },
      plainTextScripts: { en: '', ar: '', prs: '', ps: '' },
    }
  }

  it('returns false when approvedBy is empty', () => {
    expect(isScriptApproved(makeScript('', ''))).toBe(false)
  })

  it('returns false when approvedAt is empty', () => {
    expect(isScriptApproved(makeScript('Dr. Smith', ''))).toBe(false)
  })

  it('returns false when approvedBy is an AI value', () => {
    expect(isScriptApproved(makeScript('AI Assistant', '2026-01-01T00:00:00.000Z'))).toBe(false)
  })

  it('returns true when both fields are set and approver is a human', () => {
    expect(isScriptApproved(makeScript('Dr. Jane Smith', '2026-01-01T00:00:00.000Z'))).toBe(true)
  })
})
