import { describe, it, expect, beforeEach, vi } from 'vitest'
import { db } from '@/lib/db'
import { encryptionKeyStore } from '@/lib/encryption-key-store'
import { AuditAction, AuditResourceType, UserRole } from '@ultranos/shared-types'
import { emitClientAudit } from '@ultranos/audit-logger/client'
import { auditProcurementEvent, getProcurementAuditEvents } from '@/lib/procurement/audit'

vi.mock('@ultranos/audit-logger/client', async (orig) => ({
  ...(await orig<typeof import('@ultranos/audit-logger/client')>()),
  emitClientAudit: vi.fn(async () => {}),
}))
const emitMock = vi.mocked(emitClientAudit)

beforeEach(async () => {
  await db.delete(); await db.open()
  if (!encryptionKeyStore.isReady()) {
    encryptionKeyStore.setKey(await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']))
  }
  emitMock.mockClear()
})

describe('auditProcurementEvent', () => {
  it('emits a client audit event with the given fields + procurement domain', () => {
    auditProcurementEvent('u1', AuditAction.PO_CREATED, AuditResourceType.PURCHASE_ORDER, 'po1', { poNumber: 'PO-2026-0001' })
    expect(emitMock).toHaveBeenCalledTimes(1)
    const input = emitMock.mock.calls[0]![0]
    expect(input).toMatchObject({
      actorId: 'u1', actorRole: UserRole.PHARMACIST,
      action: AuditAction.PO_CREATED, resourceType: AuditResourceType.PURCHASE_ORDER, resourceId: 'po1',
    })
    expect(input.metadata).toMatchObject({ poNumber: 'PO-2026-0001', source: 'pharmacy-lite', domain: 'procurement' })
    expect(input.patientId).toBeUndefined()
    expect(typeof input.hlcTimestamp).toBe('string')
  })
  it('falls back to "unknown" actor and never throws', () => {
    expect(() => auditProcurementEvent('', AuditAction.PO_SENT, AuditResourceType.PURCHASE_ORDER, 'po1')).not.toThrow()
    expect(emitMock.mock.calls[0]![0].actorId).toBe('unknown')
  })
})

describe('getProcurementAuditEvents', () => {
  async function seed() {
    const base = { actorId: 'u1', actorRole: UserRole.PHARMACIST, patientId: undefined, metadata: {}, queuedAt: '', status: 'synced' as const }
    await db.clientAuditLog.bulkAdd([
      { ...base, id: '1', action: AuditAction.PO_CREATED, resourceType: AuditResourceType.PURCHASE_ORDER, resourceId: 'po1', hlcTimestamp: '2026-01-01T00:00:00.000Z', metadata: { poNumber: 'PO-1' } },
      { ...base, id: '2', action: AuditAction.SUPPLIER_PAYMENT_RECORDED, resourceType: AuditResourceType.SUPPLIER_PAYMENT, resourceId: 'pay1', hlcTimestamp: '2026-01-03T00:00:00.000Z', metadata: {} },
      { ...base, id: '3', action: AuditAction.PHI_READ ?? AuditAction.READ, resourceType: AuditResourceType.PRESCRIPTION, resourceId: 'rx1', hlcTimestamp: '2026-01-02T00:00:00.000Z', metadata: {} },
      { ...base, id: '4', action: AuditAction.BATCH_QC_HELD, resourceType: AuditResourceType.STOCK_BATCH, resourceId: 'batch1', hlcTimestamp: '2026-01-04T00:00:00.000Z', metadata: { batchNumber: 'B-2026-777' } },
    ] as never)
  }
  it('returns only procurement resource types (incl. STOCK_BATCH QC), newest first', async () => {
    await seed()
    const rows = await getProcurementAuditEvents()
    expect(rows.map((r) => r.id)).toEqual(['4', '2', '1']) // rx1 excluded; QC batch1 included; newest hlcTimestamp first
  })
  it('filters by resourceType', async () => {
    await seed()
    const rows = await getProcurementAuditEvents({ resourceType: AuditResourceType.PURCHASE_ORDER })
    expect(rows.map((r) => r.id)).toEqual(['1'])
  })
  it('filters by the STOCK_BATCH resource type (QC events)', async () => {
    await seed()
    const rows = await getProcurementAuditEvents({ resourceType: AuditResourceType.STOCK_BATCH })
    expect(rows.map((r) => r.id)).toEqual(['4'])
  })
  it('filters by a QC action', async () => {
    await seed()
    const rows = await getProcurementAuditEvents({ action: AuditAction.BATCH_QC_HELD })
    expect(rows.map((r) => r.id)).toEqual(['4'])
  })
  it('search matches resourceId, a reference, or a batchNumber in metadata', async () => {
    await seed()
    expect((await getProcurementAuditEvents({ search: 'PO-1' })).map((r) => r.id)).toEqual(['1'])
    expect((await getProcurementAuditEvents({ search: 'pay1' })).map((r) => r.id)).toEqual(['2'])
    expect((await getProcurementAuditEvents({ search: 'B-2026-777' })).map((r) => r.id)).toEqual(['4'])
  })
})
