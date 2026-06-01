/**
 * Monitoring Reminder Tests — Story 52.1 Task 8 (AC 6, 9)
 *
 * Tests:
 *  - Reminder throttling: no re-send within 48 hours (AC 6)
 *  - Correct payload structure (AC 6)
 *  - Audit-log emission for every reminder (AC 9)
 *  - generatePendingReminders: batch operation (AC 6)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  generateReminder,
  generatePendingReminders,
  _isThrottled,
  REMINDER_THROTTLE_HOURS,
} from '../lib/monitoring/reminder-generator'
import type { MonitoringFlag } from '../lib/db'

// ---------------------------------------------------------------------------
// Mocks — use vi.hoisted so factory closures can reference module-level vars
// ---------------------------------------------------------------------------

const { mockEmitAudit } = vi.hoisted(() => ({
  mockEmitAudit: vi.fn(),
}))

vi.mock('../lib/monitoring/monitoring-audit', () => ({
  emitMonitoringAuditEvent: mockEmitAudit,
}))

const mockFlags: Map<number, MonitoringFlag> = new Map()

const mockDb = {
  monitoringFlags: {
    update: vi.fn().mockImplementation(async (id: number, updates: Partial<MonitoringFlag>) => {
      const existing = mockFlags.get(id)
      if (existing) mockFlags.set(id, { ...existing, ...updates })
      return 1
    }),
    where: vi.fn((field: string) => ({
      equals: vi.fn((value: string) => ({
        toArray: vi.fn().mockImplementation(async () =>
          Array.from(mockFlags.values()).filter(
            (f) => (f as unknown as Record<string, string>)[field] === value
          )
        ),
      })),
    })),
  },
  syncQueue: {
    add: vi.fn().mockResolvedValue(1),
  },
}

vi.mock('../lib/db', () => ({
  getDb: vi.fn(() => mockDb),
}))

vi.mock('@ultranos/audit-logger/client', () => ({
  emitClientAudit: vi.fn(),
}))

vi.mock('../lib/hlc', () => ({
  hlc: { now: vi.fn(() => ({ wallTime: 0, logicalTime: 0, nodeId: 'test' })) },
  serializeHlc: vi.fn(() => '2026-05-31T00:00:00Z:0:test'),
}))

vi.mock('../stores/auth-session-store', () => ({
  useAuthSessionStore: { getState: vi.fn(() => ({ session: null })) },
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let nextId = 100

function makeOverdueFlag(overrides: Partial<MonitoringFlag> = {}): MonitoringFlag {
  const id = nextId++
  const flag: MonitoringFlag = {
    id,
    patientRef: 'Patient/opaque-r1',
    patientFirstName: 'Khalid',
    patientAge: 58,
    medicationCode: 'RxNorm:11289',
    medicationDisplay: 'Warfarin',
    dispensedAt: '2026-04-01T00:00:00Z',
    dispensingEventId: `dispense-r-${id}`,
    testRequired: '6301-6',
    testDisplay: 'INR',
    frequencyDays: 14,
    dueDate: '2026-05-01',         // well overdue
    status: 'overdue',
    lastCompletedAt: null,
    reminderSentAt: null,
    orderingPractitionerRef: 'Practitioner/opaque-r1',
    hlcTimestamp: '2026-05-31T00:00:00Z:0:test',
    syncedFromHub: true,
    createdAt: '2026-04-01T00:00:00Z',
    updatedAt: '2026-05-31T00:00:00Z',
    ...overrides,
  }
  mockFlags.set(id, flag)
  return flag
}

beforeEach(() => {
  mockFlags.clear()
  nextId = 100
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// Throttling Tests
// ---------------------------------------------------------------------------

describe('reminder throttling', () => {
  it('REMINDER_THROTTLE_HOURS is 48 hours', () => {
    expect(REMINDER_THROTTLE_HOURS).toBe(48)
  })

  it('isThrottled returns false when reminderSentAt is null', () => {
    const flag = makeOverdueFlag({ reminderSentAt: null })
    expect(_isThrottled(flag)).toBe(false)
  })

  it('isThrottled returns true when reminderSentAt was 12 hours ago', () => {
    const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString()
    const flag = makeOverdueFlag({ reminderSentAt: twelveHoursAgo })
    expect(_isThrottled(flag)).toBe(true)
  })

  it('isThrottled returns true when reminderSentAt was 47 hours ago', () => {
    const fortySevenHoursAgo = new Date(Date.now() - 47 * 60 * 60 * 1000).toISOString()
    const flag = makeOverdueFlag({ reminderSentAt: fortySevenHoursAgo })
    expect(_isThrottled(flag)).toBe(true)
  })

  it('isThrottled returns false when reminderSentAt was 49 hours ago', () => {
    const fortyNineHoursAgo = new Date(Date.now() - 49 * 60 * 60 * 1000).toISOString()
    const flag = makeOverdueFlag({ reminderSentAt: fortyNineHoursAgo })
    expect(_isThrottled(flag)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// generateReminder Tests
// ---------------------------------------------------------------------------

describe('generateReminder', () => {
  it('sends reminder for overdue flag and returns true', async () => {
    const flag = makeOverdueFlag()
    const result = await generateReminder(flag)

    expect(result).toBe(true)
    expect(mockDb.syncQueue.add).toHaveBeenCalled()
  })

  it('updates reminderSentAt after sending', async () => {
    const flag = makeOverdueFlag()
    await generateReminder(flag)

    expect(mockDb.monitoringFlags.update).toHaveBeenCalledWith(
      flag.id,
      expect.objectContaining({
        reminderSentAt: expect.any(String),
      }),
    )
  })

  it('does NOT send reminder for non-overdue flag (due)', async () => {
    const flag = makeOverdueFlag({ status: 'due' })
    const result = await generateReminder(flag)

    expect(result).toBe(false)
    expect(mockDb.syncQueue.add).not.toHaveBeenCalled()
  })

  it('does NOT send reminder for upcoming flag', async () => {
    const flag = makeOverdueFlag({ status: 'upcoming' })
    const result = await generateReminder(flag)

    expect(result).toBe(false)
  })

  it('does NOT send reminder for completed flag', async () => {
    const flag = makeOverdueFlag({ status: 'completed' })
    const result = await generateReminder(flag)

    expect(result).toBe(false)
  })

  it('skips throttled flag and returns false', async () => {
    const recentlySent = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString()
    const flag = makeOverdueFlag({ reminderSentAt: recentlySent })

    const result = await generateReminder(flag)

    expect(result).toBe(false)
    expect(mockDb.syncQueue.add).not.toHaveBeenCalled()
  })

  it('sends again after 48-hour throttle window expires', async () => {
    const oldReminder = new Date(Date.now() - 50 * 60 * 60 * 1000).toISOString()
    const flag = makeOverdueFlag({ reminderSentAt: oldReminder })

    const result = await generateReminder(flag)

    expect(result).toBe(true)
    expect(mockDb.syncQueue.add).toHaveBeenCalled()
  })

  it('emits audit event when reminder is sent', async () => {
    const flag = makeOverdueFlag()
    await generateReminder(flag)

    expect(mockEmitAudit).toHaveBeenCalledWith(
      'MONITORING_REMINDER_SENT',
      expect.objectContaining({
        patientRef: flag.patientRef,
        destination: 'physician',
      }),
    )
  })

  it('includes correct payload structure for physician notification', async () => {
    const flag = makeOverdueFlag({ dueDate: '2026-05-01' })
    await generateReminder(flag)

    const syncCall = mockDb.syncQueue.add.mock.calls[0][0]
    const payload = JSON.parse(syncCall.payload)

    expect(payload.type).toBe('MONITORING_OVERDUE')
    expect(payload.patientRef).toBe(flag.patientRef)
    expect(payload.orderingPractitionerRef).toBe(flag.orderingPractitionerRef)
    expect(payload.medicationDisplay).toBe(flag.medicationDisplay)
    expect(payload.testDisplay).toBe(flag.testDisplay)
    expect(payload.dueDate).toBe(flag.dueDate)
    expect(typeof payload.daysOverdue).toBe('number')
    expect(payload.daysOverdue).toBeGreaterThan(0)
  })

  it('payload contains NO diagnosis, NO DOB, NO prescriber name', async () => {
    const flag = makeOverdueFlag()
    await generateReminder(flag)

    const syncCall = mockDb.syncQueue.add.mock.calls[0][0]
    const payload = JSON.parse(syncCall.payload)

    expect('diagnosis' in payload).toBe(false)
    expect('indication' in payload).toBe(false)
    expect('dateOfBirth' in payload).toBe(false)
    expect('dob' in payload).toBe(false)
    expect('presciberName' in payload).toBe(false)
    expect('patientLastName' in payload).toBe(false)
    expect('patientFirstName' in payload).toBe(false) // opaque ref only
  })

  it('also enqueues patient notification when requested', async () => {
    const flag = makeOverdueFlag()
    await generateReminder(flag, { includePatientNotification: true })

    // Two sync queue entries: one physician + one patient
    expect(mockDb.syncQueue.add).toHaveBeenCalledTimes(2)

    const calls = mockDb.syncQueue.add.mock.calls
    const types = calls.map((c: unknown[]) => JSON.parse((c[0] as { payload: string }).payload).type)
    expect(types).toContain('MONITORING_OVERDUE')
    expect(types).toContain('MONITORING_OVERDUE_PATIENT')
  })

  it('audit records correct destination when patient notification included', async () => {
    const flag = makeOverdueFlag()
    await generateReminder(flag, { includePatientNotification: true })

    expect(mockEmitAudit).toHaveBeenCalledWith(
      'MONITORING_REMINDER_SENT',
      expect.objectContaining({ destination: 'physician+patient' }),
    )
  })

  it('flag without id returns false (safety guard)', async () => {
    const flag = makeOverdueFlag({ id: undefined })
    const result = await generateReminder(flag)

    expect(result).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// generatePendingReminders batch
// ---------------------------------------------------------------------------

describe('generatePendingReminders', () => {
  it('sends reminders to all overdue flags', async () => {
    const flag1 = makeOverdueFlag()
    const flag2 = makeOverdueFlag({ dispensingEventId: 'disp-r-2', patientRef: 'Patient/opaque-r2' })

    // Mock the where().equals() to return our overdue flags
    mockDb.monitoringFlags.where = vi.fn().mockReturnValue({
      equals: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([flag1, flag2]),
      }),
    })

    const count = await generatePendingReminders()
    expect(count).toBe(2)
  })

  it('skips throttled flags', async () => {
    const recentlySent = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString()
    const flag1 = makeOverdueFlag({ reminderSentAt: recentlySent })
    const flag2 = makeOverdueFlag()  // not throttled

    mockDb.monitoringFlags.where = vi.fn().mockReturnValue({
      equals: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([flag1, flag2]),
      }),
    })

    const count = await generatePendingReminders()
    expect(count).toBe(1)  // only flag2 sends
  })
})
