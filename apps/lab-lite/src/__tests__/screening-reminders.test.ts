import { describe, it, expect } from 'vitest'
import {
  calculateRemindersFromRecord,
  getReminderState,
  DEFAULT_THRESHOLDS,
} from '../lib/safety/screening-reminders'
import type { EmployeeHealthRecord } from '../types/employee-health'
import {
  VaccinationStatus,
  TbScreeningResult,
  HepBImmunityStatus,
} from '../types/employee-health'

function makeRecord(overrides?: Partial<EmployeeHealthRecord>): EmployeeHealthRecord {
  return {
    id: 'rec-1',
    practitionerId: 'prac-1',
    hepBStatus: VaccinationStatus.COMPLETE,
    hepBDoses: 3,
    hepBTiterDate: null,
    hepBTiterResult: HepBImmunityStatus.UNKNOWN,
    tetanusDate: null,
    tetanusStatus: VaccinationStatus.UNKNOWN,
    covidDate: null,
    covidStatus: VaccinationStatus.UNKNOWN,
    covidDoses: 0,
    tbScreeningDate: null,
    tbScreeningResult: TbScreeningResult.NOT_DONE,
    tbScreeningHistory: [],
    exposureHistory: [],
    notes: '',
    lastUpdated: '2026-01-01T00:00:00Z',
    updatedBy: 'prac-1',
    hlcTimestamp: '2026-01-01T00:00:00Z:0:node-1',
    ...overrides,
  }
}

function daysFromNow(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().split('T')[0]
}

describe('getReminderState', () => {
  it('returns null when more than 30 days out', () => {
    expect(getReminderState(31)).toBeNull()
    expect(getReminderState(100)).toBeNull()
  })

  it('returns UPCOMING when 1-30 days until due', () => {
    expect(getReminderState(30)).toBe('UPCOMING')
    expect(getReminderState(15)).toBe('UPCOMING')
    expect(getReminderState(1)).toBe('UPCOMING')
  })

  it('returns DUE when due today or up to 30 days past', () => {
    expect(getReminderState(0)).toBe('DUE')
    expect(getReminderState(-1)).toBe('DUE')
    expect(getReminderState(-30)).toBe('DUE')
  })

  it('returns OVERDUE when more than 30 days past due', () => {
    expect(getReminderState(-31)).toBe('OVERDUE')
    expect(getReminderState(-100)).toBe('OVERDUE')
  })
})

describe('Screening Reminders (Story 47.3, Task 5)', () => {
  it('returns reminder when TB screening has never been done', () => {
    const record = makeRecord({ tbScreeningDate: null })
    const reminders = calculateRemindersFromRecord(record, 'prac-1')

    const tbReminder = reminders.find((r) => r.screeningType === 'TB Screening')
    expect(tbReminder).toBeDefined()
    expect(tbReminder!.message).toContain('never been recorded')
  })

  it('returns no reminder when TB screening is recent (within threshold)', () => {
    // Screening done 30 days ago — with 365 day threshold, 335 days remain (> 30)
    const record = makeRecord({ tbScreeningDate: daysFromNow(30) })
    const reminders = calculateRemindersFromRecord(record, 'prac-1')

    const tbReminder = reminders.find((r) => r.screeningType === 'TB Screening')
    expect(tbReminder).toBeUndefined()
  })

  it('returns UPCOMING reminder when TB screening is due within 30 days', () => {
    // Screening done 345 days ago — 20 days remain
    const record = makeRecord({ tbScreeningDate: daysFromNow(345) })
    const reminders = calculateRemindersFromRecord(record, 'prac-1')

    const tbReminder = reminders.find((r) => r.screeningType === 'TB Screening')
    expect(tbReminder).toBeDefined()
    expect(tbReminder!.daysUntilDue).toBeGreaterThan(0)
    expect(tbReminder!.daysUntilDue).toBeLessThanOrEqual(30)
  })

  it('returns OVERDUE reminder when TB screening is very overdue', () => {
    // Screening done 500 days ago — 135 days overdue
    const record = makeRecord({ tbScreeningDate: daysFromNow(500) })
    const reminders = calculateRemindersFromRecord(record, 'prac-1')

    const tbReminder = reminders.find((r) => r.screeningType === 'TB Screening')
    expect(tbReminder).toBeDefined()
    expect(tbReminder!.daysUntilDue).toBeLessThan(-30)
  })

  it('uses configurable thresholds', () => {
    // TB done 100 days ago, threshold 120 days → 20 days remain → UPCOMING
    const record = makeRecord({ tbScreeningDate: daysFromNow(100) })
    const reminders = calculateRemindersFromRecord(record, 'prac-1', {
      ...DEFAULT_THRESHOLDS,
      tbScreeningDays: 120,
    })

    const tbReminder = reminders.find((r) => r.screeningType === 'TB Screening')
    expect(tbReminder).toBeDefined()
    expect(tbReminder!.daysUntilDue).toBeGreaterThan(0)
    expect(tbReminder!.daysUntilDue).toBeLessThanOrEqual(30)
  })

  it('returns Hep B titer reminder when titer has never been checked', () => {
    const record = makeRecord({
      hepBStatus: VaccinationStatus.COMPLETE,
      hepBTiterDate: null,
    })
    const reminders = calculateRemindersFromRecord(record, 'prac-1')

    const hepBReminder = reminders.find((r) => r.screeningType === 'Hepatitis B Titer')
    expect(hepBReminder).toBeDefined()
    expect(hepBReminder!.message).toContain('never been checked')
  })

  it('does not return Hep B titer reminder when vaccination not started', () => {
    const record = makeRecord({
      hepBStatus: VaccinationStatus.NOT_STARTED,
      hepBTiterDate: null,
    })
    const reminders = calculateRemindersFromRecord(record, 'prac-1')

    const hepBReminder = reminders.find((r) => r.screeningType === 'Hepatitis B Titer')
    expect(hepBReminder).toBeUndefined()
  })

  it('returns tetanus booster reminder when overdue (>10 years)', () => {
    // 3700 days ago (slightly over 10 years)
    const record = makeRecord({ tetanusDate: daysFromNow(3700) })
    const reminders = calculateRemindersFromRecord(record, 'prac-1')

    const tetReminder = reminders.find((r) => r.screeningType === 'Tetanus Booster')
    expect(tetReminder).toBeDefined()
    expect(tetReminder!.daysUntilDue).toBeLessThan(0)
  })

  it('returns no tetanus reminder when recent (within 10 years)', () => {
    // 100 days ago — nowhere near 10 year threshold
    const record = makeRecord({ tetanusDate: daysFromNow(100) })
    const reminders = calculateRemindersFromRecord(record, 'prac-1')

    const tetReminder = reminders.find((r) => r.screeningType === 'Tetanus Booster')
    expect(tetReminder).toBeUndefined()
  })

  it('returns COVID booster reminder when overdue', () => {
    // 400 days ago with 365-day default threshold
    const record = makeRecord({ covidDate: daysFromNow(400) })
    const reminders = calculateRemindersFromRecord(record, 'prac-1')

    const covidReminder = reminders.find((r) => r.screeningType === 'COVID Booster')
    expect(covidReminder).toBeDefined()
    expect(covidReminder!.daysUntilDue).toBeLessThan(0)
  })

  it('assigns correct practitionerId to reminders', () => {
    const record = makeRecord({ tbScreeningDate: null })
    const reminders = calculateRemindersFromRecord(record, 'specific-prac')

    for (const r of reminders) {
      expect(r.practitionerId).toBe('specific-prac')
    }
  })
})
