import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// Mock i18n
vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => {
    const messages: Record<string, string> = {
      title: 'Power Schedule',
      startTime: 'Generator Start Time',
      duration: 'Duration (hours)',
      dayOfWeek: 'Day of Week',
      defaultSchedule: 'Default (all days)',
      sunday: 'Sunday',
      monday: 'Monday',
      tuesday: 'Tuesday',
      wednesday: 'Wednesday',
      thursday: 'Thursday',
      friday: 'Friday',
      saturday: 'Saturday',
      active: 'Active',
      save: 'Save Schedule',
      saving: 'Saving...',
      delete: 'Delete',
      saved: 'Power schedule saved',
      deleted: 'Schedule removed',
      validationDuration: 'Duration must be greater than 0.',
      validationStartTime: 'Start time is required.',
      validationOverlap: 'A schedule already exists for this day.',
    }
    return (key: string) => messages[key] ?? `${namespace}.${key}`
  },
  useLocale: () => 'en',
}))

// Mock db functions
const mockGetPowerSchedules = vi.fn().mockResolvedValue([])
const mockPutPowerSchedule = vi.fn().mockResolvedValue(1)
const mockDeletePowerSchedule = vi.fn().mockResolvedValue(undefined)

vi.mock('@/lib/db', () => ({
  getPowerSchedules: (...args: unknown[]) => mockGetPowerSchedules(...args),
  putPowerSchedule: (...args: unknown[]) => mockPutPowerSchedule(...args),
  deletePowerSchedule: (...args: unknown[]) => mockDeletePowerSchedule(...args),
}))

import { PowerScheduleForm } from '@/components/scheduler/PowerScheduleForm'

beforeEach(() => {
  vi.clearAllMocks()
  mockGetPowerSchedules.mockResolvedValue([])
})

describe('PowerScheduleForm', () => {
  it('renders the form with all inputs', async () => {
    render(<PowerScheduleForm />)

    await waitFor(() => {
      expect(screen.getByText('Power Schedule')).toBeTruthy()
    })

    expect(screen.getByText('Generator Start Time')).toBeTruthy()
    expect(screen.getByText('Duration (hours)')).toBeTruthy()
    expect(screen.getByText('Day of Week')).toBeTruthy()
    expect(screen.getByText('Save Schedule')).toBeTruthy()
  })

  it('validates that duration must be > 0', async () => {
    render(<PowerScheduleForm />)

    await waitFor(() => {
      expect(screen.getByText('Save Schedule')).toBeTruthy()
    })

    // Set duration to 0
    const durationInput = screen.getByDisplayValue('4')
    fireEvent.change(durationInput, { target: { value: '0' } })

    // Click save
    fireEvent.click(screen.getByText('Save Schedule'))

    await waitFor(() => {
      expect(screen.getByText('Duration must be greater than 0.')).toBeTruthy()
    })

    expect(mockPutPowerSchedule).not.toHaveBeenCalled()
  })

  it('saves a schedule to Dexie on valid submission', async () => {
    render(<PowerScheduleForm />)

    await waitFor(() => {
      expect(screen.getByText('Save Schedule')).toBeTruthy()
    })

    // Click save with default values (start=09:00, duration=4h, day=default)
    fireEvent.click(screen.getByText('Save Schedule'))

    await waitFor(() => {
      expect(mockPutPowerSchedule).toHaveBeenCalledOnce()
    })

    const savedEntry = mockPutPowerSchedule.mock.calls[0][0]
    expect(savedEntry.dayOfWeek).toBe(null) // default
    expect(savedEntry.startTime).toBe('09:00')
    expect(savedEntry.durationMinutes).toBe(240) // 4h * 60
    expect(savedEntry.isActive).toBe(true)
  })

  it('shows existing schedules and allows deletion', async () => {
    mockGetPowerSchedules.mockResolvedValue([
      { id: 1, dayOfWeek: null, startTime: '08:00', durationMinutes: 300, isActive: true, updatedAt: '2026-01-01T00:00:00Z' },
    ])

    // F21: confirm dialog must be accepted for delete to proceed
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(<PowerScheduleForm />)

    await waitFor(() => {
      expect(screen.getByText('Default (all days)')).toBeTruthy()
    })

    // There should be a delete button
    const deleteBtn = screen.getByText('Delete')
    fireEvent.click(deleteBtn)

    await waitFor(() => {
      expect(mockDeletePowerSchedule).toHaveBeenCalledWith(1)
    })

    vi.restoreAllMocks()
  })

  it('cancels deletion when user dismisses confirm dialog', async () => {
    mockGetPowerSchedules.mockResolvedValue([
      { id: 1, dayOfWeek: null, startTime: '08:00', durationMinutes: 300, isActive: true, updatedAt: '2026-01-01T00:00:00Z' },
    ])

    vi.spyOn(window, 'confirm').mockReturnValue(false)

    render(<PowerScheduleForm />)

    await waitFor(() => {
      expect(screen.getByText('Default (all days)')).toBeTruthy()
    })

    fireEvent.click(screen.getByText('Delete'))

    expect(mockDeletePowerSchedule).not.toHaveBeenCalled()

    vi.restoreAllMocks()
  })

  it('rejects overlapping schedules for the same day', async () => {
    mockGetPowerSchedules.mockResolvedValue([
      { id: 1, dayOfWeek: null, startTime: '08:00', durationMinutes: 300, isActive: true, updatedAt: '2026-01-01T00:00:00Z' },
    ])

    render(<PowerScheduleForm />)

    await waitFor(() => {
      expect(screen.getByText('Default (all days)')).toBeTruthy()
    })

    // Try to save another default schedule
    fireEvent.click(screen.getByText('Save Schedule'))

    await waitFor(() => {
      expect(screen.getByText('A schedule already exists for this day.')).toBeTruthy()
    })

    expect(mockPutPowerSchedule).not.toHaveBeenCalled()
  })
})
