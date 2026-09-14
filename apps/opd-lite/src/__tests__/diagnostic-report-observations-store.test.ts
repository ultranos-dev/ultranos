import { describe, it, expect } from 'vitest'
import { db } from '@/lib/db'

describe('diagnosticReportObservations store', () => {
  it('stores and queries analytes by diagnosticReportId', async () => {
    await db.diagnosticReportObservations.bulkPut([
      {
        id: 'a1',
        diagnosticReportId: 'r1',
        loincCode: '718-7',
        loincDisplay: 'Hemoglobin',
        valueQuantity: { value: 12.5, unit: 'g/dL' },
        valueString: null,
        interpretation: null,
        referenceRange: { low: 13, high: 17 },
        note: null,
        effectiveDateTime: '2026-09-14',
      },
    ])
    const rows = await db.diagnosticReportObservations
      .where('diagnosticReportId')
      .equals('r1')
      .toArray()
    expect(rows).toHaveLength(1)
    expect(rows[0]!.valueQuantity).toEqual({ value: 12.5, unit: 'g/dL' })
  })
})
