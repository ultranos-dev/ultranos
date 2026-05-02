import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  emitClientAudit,
  setAuditStoreAdapter,
  type AuditStoreAdapter,
  type ClientAuditEvent,
  type ClientAuditEventInput,
} from '@ultranos/audit-logger/client'
import { AuditAction, AuditResourceType, UserRole } from '@ultranos/shared-types'

function makeInput(overrides?: Partial<ClientAuditEventInput>): ClientAuditEventInput {
  return {
    actorId: 'user-001',
    actorRole: UserRole.DOCTOR,
    action: AuditAction.READ,
    resourceType: AuditResourceType.PATIENT,
    resourceId: 'patient-001',
    hlcTimestamp: '000001234567890:00000:node1',
    ...overrides,
  }
}

describe('emitClientAudit', () => {
  let captured: ClientAuditEvent[]
  let mockAdapter: AuditStoreAdapter

  beforeEach(() => {
    captured = []
    mockAdapter = {
      append: vi.fn(async (event: ClientAuditEvent) => {
        captured.push(event)
      }),
    }
    setAuditStoreAdapter(mockAdapter)
  })

  it('queues an event with generated id and queuedAt', async () => {
    await emitClientAudit(makeInput())

    expect(captured).toHaveLength(1)
    expect(captured[0].id).toBeTruthy()
    expect(captured[0].queuedAt).toBeTruthy()
    expect(captured[0].status).toBe('pending')
    expect(captured[0].actorId).toBe('user-001')
    expect(captured[0].action).toBe('READ')
    expect(captured[0].resourceType).toBe('PATIENT')
  })

  it('preserves all input fields', async () => {
    const input = makeInput({
      patientId: 'pat-123',
      metadata: { source: 'test' },
    })
    await emitClientAudit(input)

    expect(captured[0].patientId).toBe('pat-123')
    expect(captured[0].metadata).toEqual({ source: 'test' })
    expect(captured[0].hlcTimestamp).toBe('000001234567890:00000:node1')
  })

  it('strips PHI field names from metadata at runtime', async () => {
    const input = makeInput({
      metadata: {
        source: 'test',
        name: 'John Doe',          // PHI — should be stripped
        diagnosis: 'Flu',          // PHI — should be stripped
        phiAccess: 'patient_view', // safe — should be kept
      },
    })

    await emitClientAudit(input)

    expect(captured[0].metadata).toEqual({
      source: 'test',
      phiAccess: 'patient_view',
    })
    expect(captured[0].metadata).not.toHaveProperty('name')
    expect(captured[0].metadata).not.toHaveProperty('diagnosis')
  })

  it('never throws even if adapter fails', async () => {
    const failingAdapter: AuditStoreAdapter = {
      append: vi.fn(async () => {
        throw new Error('DB write failed')
      }),
    }
    setAuditStoreAdapter(failingAdapter)

    // Should not throw
    await expect(emitClientAudit(makeInput())).resolves.toBeUndefined()
  })

  it('warns and drops event when no adapter is registered', async () => {
    setAuditStoreAdapter(null as unknown as AuditStoreAdapter)
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await emitClientAudit(makeInput())

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('No store adapter'),
    )
    consoleSpy.mockRestore()
  })

  it('generates unique IDs for each event', async () => {
    await emitClientAudit(makeInput())
    await emitClientAudit(makeInput())

    expect(captured).toHaveLength(2)
    expect(captured[0].id).not.toBe(captured[1].id)
  })
})
