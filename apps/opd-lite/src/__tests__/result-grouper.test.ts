/**
 * Tests for result-grouper.ts — structured analyte value preference (Task 7)
 *
 * The existing groupReportsByLoinc tests live in lab-result-timeline.test.ts.
 * This file extends coverage with the structured-analyte path added in Task 7.
 */

import { describe, it, expect } from 'vitest'
import {
  groupReportsByLoinc,
} from '@/lib/lab-results/result-grouper'
import type { LocalReportObservation } from '@/lib/db'

describe('groupReportsByLoinc — structured analyte values', () => {
  it('prefers a structured analyte value over regex-from-conclusion', () => {
    const report = { id: 'r1', resourceType: 'DiagnosticReport', status: 'preliminary',
      code: { coding: [{ code: '718-7', display: 'Hemoglobin' }] }, subject: {}, issued: '2026-09-14',
      conclusion: 'see attached', _ultranos: { flagLevel: 'normal' } } as any
    const analytes = new Map<string, LocalReportObservation[]>([['r1', [
      { id: 'a1', diagnosticReportId: 'r1', loincCode: '718-7', loincDisplay: 'Hemoglobin', valueQuantity: { value: 12.5, unit: 'g/dL' }, valueString: null, interpretation: null, referenceRange: null, note: null, effectiveDateTime: '2026-09-14' },
    ]]])
    const report2 = { ...report, id: 'r2', issued: '2026-09-15' } as any
    analytes.set('r2', [{ ...analytes.get('r1')![0]!, id: 'a2', diagnosticReportId: 'r2', valueQuantity: { value: 13.1, unit: 'g/dL' } }])
    const groups = groupReportsByLoinc([report2, report], analytes)
    const g = groups.find((x) => x.loincCode === '718-7')!
    expect(g.trendData).not.toBeNull()
    expect(g.trendData!.map((p) => p.value)).toEqual([13.1, 12.5]) // structured values, not regex
  })
})
