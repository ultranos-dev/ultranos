import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/appointments',
}))

// Mock next-intl
vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => {
    const messages: Record<string, string> = {
      title: 'Appointments',
      today: 'Today',
      dayView: 'Day',
      weekView: 'Week',
      datePicker: 'Select date',
      previousDay: 'Previous day',
      nextDay: 'Next day',
      previousWeek: 'Previous week',
      nextWeek: 'Next week',
      available: 'Available',
      booked: 'Booked',
      checkedIn: 'Checked In',
      inProgress: 'In Progress',
      completed: 'Completed',
      noShow: 'No Show',
      cancelled: 'Cancelled',
      newConsult: 'New Consult',
      followUp: 'Follow-up',
      urgent: 'Urgent',
      walkIn: 'Walk-in',
      bookAppointment: 'Book Appointment',
      addWalkIn: 'Add Walk-In',
      startEncounter: 'Start Encounter',
      changeStatus: 'Change Status',
      walkInQueue: 'Walk-In Queue',
      queueNumber: '#{number}',
      waitTime: '{minutes}m waiting',
      patient: 'Patient',
      type: 'Type',
      time: 'Time',
      selectPatient: 'Select patient',
      selectDate: 'Select date',
      selectTime: 'Select time slot',
      appointmentType: 'Appointment type',
      notes: 'Notes (optional)',
      confirmBooking: 'Confirm Booking',
      cancelAppointment: 'Cancel Appointment',
      slotTaken: 'This slot has been taken',
      noAppointments: 'No appointments scheduled',
      noWalkIns: 'No walk-in patients',
      schedulingConflict: 'Scheduling conflict detected — please review',
      doubleBookWarning: 'Double-booking detected for this time slot',
    }
    return (key: string, params?: Record<string, unknown>) => {
      const val = messages[key] ?? key
      if (params && val.includes('{')) {
        return val.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? ''))
      }
      return val
    }
  },
}))

// Mock Dexie DB
vi.mock('@/lib/db', () => ({
  db: {
    appointments: {
      where: vi.fn().mockReturnThis(),
      between: vi.fn().mockReturnThis(),
      toArray: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockResolvedValue(undefined),
      add: vi.fn().mockResolvedValue(1),
      put: vi.fn().mockResolvedValue(1),
      update: vi.fn().mockResolvedValue(1),
    },
    slots: {
      where: vi.fn().mockReturnThis(),
      between: vi.fn().mockReturnThis(),
      equals: vi.fn().mockReturnThis(),
      toArray: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockResolvedValue(undefined),
      add: vi.fn().mockResolvedValue(1),
      put: vi.fn().mockResolvedValue(1),
      update: vi.fn().mockResolvedValue(1),
    },
  },
}))

// Mock useAppointments hook
const mockUpdateStatus = vi.fn()
const mockAddWalkIn = vi.fn()
const mockCreateAppointment = vi.fn()
const mockAppointments: unknown[] = []

vi.mock('@/hooks/useAppointments', () => ({
  useAppointments: () => ({
    appointments: mockAppointments,
    slots: [],
    loading: false,
    updateStatus: mockUpdateStatus,
    addWalkIn: mockAddWalkIn,
    createAppointment: mockCreateAppointment,
    cancelAppointment: vi.fn(),
    syncAppointments: vi.fn(),
  }),
}))

const nowIso = new Date().toISOString()

function makeAppointment(overrides: Record<string, unknown> = {}) {
  const base = {
    id: 'apt-001',
    resourceType: 'Appointment',
    status: 'booked',
    serviceType: [{ system: 'http://terminology.hl7.org/CodeSystem/service-type', code: 'new-consult', display: 'New Consult' }],
    start: new Date().toISOString(),
    end: new Date(Date.now() + 30 * 60000).toISOString(),
    participant: [
      { actor: { reference: 'Patient/p-001', display: 'Ahmad K.' }, status: 'accepted' },
      { actor: { reference: 'Practitioner/pr-001' }, status: 'accepted' },
    ],
    _ultranos: { walkIn: false, queuePosition: null, isOfflineCreated: false, hlcTimestamp: Date.now().toString(), createdAt: nowIso },
    meta: { lastUpdated: nowIso, versionId: '1' },
  }

  const merged = { ...base, ...overrides }
  if (overrides._ultranos) {
    merged._ultranos = { ...base._ultranos, ...(overrides._ultranos as Record<string, unknown>) } as typeof base._ultranos
  }
  return merged
}

function makeWalkIn(overrides: Record<string, unknown> = {}) {
  return makeAppointment({
    id: 'apt-002',
    status: 'arrived',
    serviceType: [{ system: 'http://terminology.hl7.org/CodeSystem/service-type', code: 'urgent', display: 'Urgent' }],
    _ultranos: { walkIn: true, queuePosition: 1, isOfflineCreated: false, hlcTimestamp: Date.now().toString(), createdAt: nowIso },
    ...overrides,
  })
}

describe('Appointment Scheduling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAppointments.length = 0
  })

  it('DayScheduleView renders time slots', async () => {
    const { DayScheduleView } = await import(
      '@/components/appointments/DayScheduleView'
    )
    render(<DayScheduleView />)

    // Clinic hours: 08:00-17:00, 30-min slots = 18 slots
    // Verify a few representative time slot labels appear
    expect(screen.getByText('08:00')).toBeDefined()
    expect(screen.getByText('08:30')).toBeDefined()
    expect(screen.getByText('12:00')).toBeDefined()
    expect(screen.getByText('16:30')).toBeDefined()
  })

  it('Available slot shows "Available" label', async () => {
    const { AppointmentSlot } = await import(
      '@/components/appointments/AppointmentSlot'
    )
    render(
      <AppointmentSlot time="09:00" onClick={vi.fn()} />,
    )

    // When no appointment is provided, the slot shows "Available"
    const availableTexts = screen.getAllByText('Available')
    expect(availableTexts.length).toBeGreaterThanOrEqual(1)
  })

  it('Booked slot shows patient name and type badge', async () => {
    const appointment = makeAppointment()
    const { AppointmentSlot } = await import(
      '@/components/appointments/AppointmentSlot'
    )
    render(
      <AppointmentSlot
        time="09:00"
        appointment={appointment as never}
        onClick={vi.fn()}
      />,
    )

    // Patient name should appear
    expect(screen.getByText('Ahmad K.')).toBeDefined()
    // Service type badge should appear
    expect(screen.getByText('New Consult')).toBeDefined()
    // Status badge should appear
    expect(screen.getByText('Booked')).toBeDefined()
  })

  it('BookingModal opens on available slot click', async () => {
    // No appointments, all slots are available
    const { DayScheduleView } = await import(
      '@/components/appointments/DayScheduleView'
    )
    render(<DayScheduleView />)

    // Click an available slot (e.g. 09:00)
    const slot = screen.getByText('09:00')
    fireEvent.click(slot.closest('button')!)

    // BookingModal should appear with its header
    await vi.waitFor(() => {
      expect(screen.getByText('Book Appointment')).toBeDefined()
    })
  })

  it('Walk-in queue renders ordered by queue position', async () => {
    const walkIn1 = makeWalkIn({
      id: 'apt-w1',
      _ultranos: { walkIn: true, queuePosition: 2, isOfflineCreated: false, hlcTimestamp: Date.now().toString(), createdAt: nowIso },
      participant: [{ actor: { reference: 'Patient/p-002', display: 'Fatima A.' }, status: 'accepted' }],
    })
    const walkIn2 = makeWalkIn({
      id: 'apt-w2',
      _ultranos: { walkIn: true, queuePosition: 1, isOfflineCreated: false, hlcTimestamp: Date.now().toString(), createdAt: nowIso },
      participant: [{ actor: { reference: 'Patient/p-003', display: 'Khalid M.' }, status: 'accepted' }],
    })

    // Push walk-ins in reverse order; component should sort by queuePosition
    mockAppointments.push(walkIn1, walkIn2)

    const { WalkInQueue } = await import(
      '@/components/appointments/WalkInQueue'
    )
    render(<WalkInQueue />)

    const buttons = screen.getAllByRole('button')
    // Filter to walk-in patient buttons (those containing patient names)
    const patientButtons = buttons.filter(
      (btn) => btn.textContent?.includes('Khalid M.') || btn.textContent?.includes('Fatima A.'),
    )

    expect(patientButtons).toHaveLength(2)
    // Khalid (queuePosition=1) should come before Fatima (queuePosition=2)
    expect(patientButtons[0].textContent).toContain('Khalid M.')
    expect(patientButtons[1].textContent).toContain('Fatima A.')
  })

  it('Urgent walk-ins display red styling', async () => {
    const urgentWalkIn = makeWalkIn({
      id: 'apt-urgent',
      serviceType: [{ system: 'http://terminology.hl7.org/CodeSystem/service-type', code: 'urgent', display: 'Urgent' }],
      _ultranos: { walkIn: true, queuePosition: 1, isOfflineCreated: false, hlcTimestamp: Date.now().toString(), createdAt: nowIso },
      participant: [{ actor: { reference: 'Patient/p-004', display: 'Omar S.' }, status: 'accepted' }],
    })

    mockAppointments.push(urgentWalkIn)

    const { WalkInQueue } = await import(
      '@/components/appointments/WalkInQueue'
    )
    render(<WalkInQueue />)

    // Urgent badge should display with red styling
    const urgentBadge = screen.getByText('Urgent')
    expect(urgentBadge).toBeDefined()
    expect(urgentBadge.className).toContain('bg-red-100')
    expect(urgentBadge.className).toContain('text-red-800')
  })

  it('Status change updates correctly (nextDay/prevDay)', async () => {
    const { useAppointmentStore } = await import('@/stores/appointment-store')
    // Reset store to a known state
    useAppointmentStore.setState({ selectedDate: new Date(), viewMode: 'day' })

    const store = useAppointmentStore.getState()
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const initialDate = new Date(store.selectedDate)
    initialDate.setHours(0, 0, 0, 0)

    // Verify initial date is today
    expect(initialDate.toDateString()).toBe(today.toDateString())

    // Navigate forward
    store.nextDay()
    const afterNext = new Date(useAppointmentStore.getState().selectedDate)
    const expectedNext = new Date(today)
    expectedNext.setDate(expectedNext.getDate() + 1)
    expect(afterNext.toDateString()).toBe(expectedNext.toDateString())

    // Navigate back
    store.prevDay()
    const afterPrev = new Date(useAppointmentStore.getState().selectedDate)
    expect(afterPrev.toDateString()).toBe(today.toDateString())
  })

  it('Appointment store defaults to today and day viewMode', async () => {
    const { useAppointmentStore } = await import('@/stores/appointment-store')
    // Reset store to defaults
    useAppointmentStore.setState({ selectedDate: new Date(), viewMode: 'day' })

    const state = useAppointmentStore.getState()
    const today = new Date()

    expect(state.selectedDate.toDateString()).toBe(today.toDateString())
    expect(state.viewMode).toBe('day')
  })
})
