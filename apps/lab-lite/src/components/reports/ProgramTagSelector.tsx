'use client'

// ---------------------------------------------------------------------------
// Story 50.2 — Program Tag Selector
// Multi-select dropdown of active donor programs. Used in the result entry
// flow (Story 42.4 integration) to tag a test result to one or more programs.
//
// Auto-tagging: if the test's LOINC code matches a program's loincCodes list,
// the program is auto-suggested (pre-selected, user can deselect).
//
// PHI safety: program tags are donor program codes — no PHI.
// ---------------------------------------------------------------------------

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { getActiveDonorPrograms } from '@/lib/db'
import type { DonorProgram } from '@/lib/donor-types'

interface Props {
  testLoincCode: string
  value: string[]                      // currently selected program codes
  onChange: (codes: string[]) => void
}

export function ProgramTagSelector({ testLoincCode, value, onChange }: Props) {
  const t = useTranslations('donorReport')
  const [programs, setPrograms] = useState<DonorProgram[]>([])
  const [autoTagged, setAutoTagged] = useState<string[]>([])

  useEffect(() => {
    let mounted = true
    getActiveDonorPrograms().then((active) => {
      if (!mounted) return
      setPrograms(active)

      // Auto-tagging: find programs whose LOINC codes include this test
      const suggested = active
        .filter((p) => p.loincCodes.includes(testLoincCode))
        .map((p) => p.programCode)
      setAutoTagged(suggested)
    })
    return () => { mounted = false }
  }, [testLoincCode])

  // Apply auto-tag when value is empty and suggestions are available
  useEffect(() => {
    if (value.length === 0 && autoTagged.length > 0) {
      onChange(autoTagged)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoTagged])

  if (programs.length === 0) return null

  function toggle(code: string) {
    const next = value.includes(code)
      ? value.filter((c) => c !== code)
      : [...value, code]
    onChange(next)
  }

  return (
    <div className="space-y-1" data-testid="program-tag-selector">
      <label className="block text-xs font-medium text-muted-foreground">
        {t('tagTests')}
      </label>
      <div className="flex flex-wrap gap-2">
        {programs.map((p) => {
          const selected = value.includes(p.programCode)
          const isAuto = autoTagged.includes(p.programCode)
          return (
            <button
              key={p.programCode}
              type="button"
              onClick={() => toggle(p.programCode)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                selected
                  ? 'bg-primary text-white'
                  : 'bg-muted text-muted-foreground hover:bg-muted'
              }`}
              aria-pressed={selected}
              data-testid={`program-tag-${p.programCode}`}
            >
              {p.programName}
              {isAuto && selected && (
                <span className="ms-1 text-blue-200" title={t('autoTagged')}>✦</span>
              )}
            </button>
          )
        })}
      </div>
      {autoTagged.length > 0 && (
        <p className="text-xs text-muted-foreground">{t('autoTagged')}</p>
      )}
    </div>
  )
}
