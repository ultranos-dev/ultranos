import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { generatePoNumber } from '@/lib/procurement/purchase-order-service'
import { DEFAULT_PHARMACY_SETTINGS } from '@/lib/inventory/types'

beforeEach(async () => { await db.pharmacySettings.clear() })

describe('generatePoNumber', () => {
  it('seeds defaults when no settings row exists and returns PO-<year>-0001', async () => {
    const n = await generatePoNumber(2026)
    expect(n).toBe('PO-2026-0001')
    const s = await db.pharmacySettings.toCollection().first()
    expect(s!.poSequenceNext).toBe(2)
  })
  it('includes the pharmacy code segment when set', async () => {
    await db.pharmacySettings.put({ ...DEFAULT_PHARMACY_SETTINGS, pharmacyCode: 'KBL01' })
    const n = await generatePoNumber(2026)
    expect(n).toBe('PO-KBL01-2026-0001')
  })
  it('is monotonic across sequential calls', async () => {
    await db.pharmacySettings.put({ ...DEFAULT_PHARMACY_SETTINGS })
    const a = await generatePoNumber(2026)
    const b = await generatePoNumber(2026)
    expect(a).toBe('PO-2026-0001')
    expect(b).toBe('PO-2026-0002')
  })
})
