import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import type { TemperatureLocation, TemperatureExcursion } from '@/types/temperature-monitoring'
import { ExcursionSeverity, TemperatureSource } from '@/types/temperature-monitoring'

// ── next-intl mock ────────────────────────────────────────────────────────────
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
}))

// ── @/lib/db mock ─────────────────────────────────────────────────────────────
const mockGetTemperatureLocations = vi.fn()
const mockGetReadingsByLocation = vi.fn()
const mockGetActiveExcursions = vi.fn()
const mockGetOngoingExcursionForLocation = vi.fn()

vi.mock('@/lib/db', () => ({
  getTemperatureLocations: (...args: unknown[]) => mockGetTemperatureLocations(...args),
  getReadingsByLocation: (...args: unknown[]) => mockGetReadingsByLocation(...args),
  getActiveExcursions: (...args: unknown[]) => mockGetActiveExcursions(...args),
  getOngoingExcursionForLocation: (...args: unknown[]) => mockGetOngoingExcursionForLocation(...args),
  addExcursion: vi.fn(),
  getDb: vi.fn(),
}))

// ── @/lib/safety/ble-temperature mock ────────────────────────────────────────
const mockIsBleAvailable = vi.fn()
const mockScanForSensors = vi.fn()

vi.mock('@/lib/safety/ble-temperature', () => ({
  isBleAvailable: (...args: unknown[]) => mockIsBleAvailable(...args),
  scanForSensors: (...args: unknown[]) => mockScanForSensors(...args),
}))

// ── @/lib/safety/temperature-prompts mock ────────────────────────────────────
vi.mock('@/lib/safety/temperature-prompts', () => ({
  isPromptDue: vi.fn().mockResolvedValue(false),
}))

// ── @/lib/safety/temperature-service mock ────────────────────────────────────
vi.mock('@/lib/safety/temperature-service', () => ({
  logReading: vi.fn(),
  getExcursionDuration: vi.fn().mockReturnValue(30),
}))

// ── @/lib/audit-client mock ───────────────────────────────────────────────────
vi.mock('@/lib/audit-client', () => ({
  reportTemperatureEvent: vi.fn().mockResolvedValue(undefined),
}))

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeLocation(overrides: Partial<TemperatureLocation> = {}): TemperatureLocation {
  return {
    id: 'loc-001',
    name: 'Reagent Fridge',
    minTemp: 2,
    maxTemp: 8,
    type: 'FRIDGE',
    sensorId: null,
    ...overrides,
  }
}

function makeReading(locationId = 'loc-001') {
  return {
    id: 'reading-001',
    locationId,
    locationName: 'Reagent Fridge',
    temperatureCelsius: 5,
    timestamp: new Date().toISOString(),
    source: TemperatureSource.MANUAL,
    sensorId: null,
    recordedBy: 'tech-001',
    hlcTimestamp: 'hlc-001',
  }
}

function makeExcursion(locationId = 'loc-001'): TemperatureExcursion {
  return {
    id: 'exc-001',
    locationId,
    locationName: 'Reagent Fridge',
    startTime: new Date().toISOString(),
    endTime: null,
    peakTemperature: 12,
    durationMinutes: 30,
    severity: ExcursionSeverity.CRITICAL,
    acknowledged: false,
    acknowledgedBy: null,
    affectedReagents: [],
  }
}

// ── Helper: lazy import after mocks are set up ────────────────────────────────
async function getDashboard() {
  const mod = await import('../components/safety/TemperatureDashboard')
  return mod.TemperatureDashboard
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('TemperatureDashboard', () => {
  afterEach(cleanup)

  beforeEach(() => {
    vi.clearAllMocks()
    mockIsBleAvailable.mockReturnValue(false)
    mockScanForSensors.mockResolvedValue([])
    mockGetActiveExcursions.mockResolvedValue([])
    mockGetOngoingExcursionForLocation.mockResolvedValue(null)
  })

  it('renders a location card for each monitored location', async () => {
    const locations = [
      makeLocation({ id: 'loc-001', name: 'Reagent Fridge' }),
      makeLocation({ id: 'loc-002', name: 'Freezer A', type: 'FREEZER', minTemp: -25, maxTemp: -15 }),
    ]
    mockGetTemperatureLocations.mockResolvedValue(locations)
    mockGetReadingsByLocation.mockResolvedValue([])

    const Dashboard = await getDashboard()
    render(<Dashboard />)

    await waitFor(() => {
      expect(screen.getByText('Reagent Fridge')).toBeDefined()
      expect(screen.getByText('Freezer A')).toBeDefined()
    })
  })

  it('shows location name, current temperature, and status indicator for each card', async () => {
    const location = makeLocation({ id: 'loc-001', name: 'Reagent Fridge' })
    mockGetTemperatureLocations.mockResolvedValue([location])
    mockGetReadingsByLocation.mockResolvedValue([makeReading('loc-001')])

    const Dashboard = await getDashboard()
    render(<Dashboard />)

    await waitFor(() => {
      // Location name
      expect(screen.getByText('Reagent Fridge')).toBeDefined()
      // Temperature value (5°C)
      expect(screen.getByText('5')).toBeDefined()
      // Status indicator — aria-label from t('status.green') = 'status.green'
      expect(screen.getByLabelText('status.green')).toBeDefined()
    })
  })

  it('shows excursion banner with role="alert" when a location has an active excursion', async () => {
    const location = makeLocation({ id: 'loc-001', name: 'Reagent Fridge' })
    mockGetTemperatureLocations.mockResolvedValue([location])
    mockGetReadingsByLocation.mockResolvedValue([makeReading('loc-001')])
    mockGetOngoingExcursionForLocation.mockResolvedValue(makeExcursion('loc-001'))

    const Dashboard = await getDashboard()
    render(<Dashboard />)

    await waitFor(() => {
      // There should be a role="alert" element for the excursion banner
      const alerts = screen.getAllByRole('alert')
      expect(alerts.length).toBeGreaterThan(0)
      // The banner should mention the location name
      const bannerText = alerts.map((el) => el.textContent).join(' ')
      expect(bannerText).toContain('Reagent Fridge')
    })
  })

  it('shows the "Connect Sensor" button when BLE is available and location has no sensorId', async () => {
    mockIsBleAvailable.mockReturnValue(true)
    const location = makeLocation({ id: 'loc-001', name: 'Reagent Fridge', sensorId: null })
    mockGetTemperatureLocations.mockResolvedValue([location])
    mockGetReadingsByLocation.mockResolvedValue([])

    const Dashboard = await getDashboard()
    render(<Dashboard />)

    await waitFor(() => {
      // t('connectSensor') returns 'connectSensor' with our mock
      expect(screen.getByText('connectSensor')).toBeDefined()
    })
  })

  it('does NOT show the "Connect Sensor" button when BLE is unavailable', async () => {
    mockIsBleAvailable.mockReturnValue(false)
    const location = makeLocation({ id: 'loc-001', name: 'Reagent Fridge', sensorId: null })
    mockGetTemperatureLocations.mockResolvedValue([location])
    mockGetReadingsByLocation.mockResolvedValue([])

    const Dashboard = await getDashboard()
    render(<Dashboard />)

    await waitFor(() => {
      expect(screen.queryByText('connectSensor')).toBeNull()
    })
  })

  it('does NOT show the "Connect Sensor" button when location already has a sensorId', async () => {
    mockIsBleAvailable.mockReturnValue(true)
    const location = makeLocation({ id: 'loc-001', name: 'Reagent Fridge', sensorId: 'sensor-abc' })
    mockGetTemperatureLocations.mockResolvedValue([location])
    mockGetReadingsByLocation.mockResolvedValue([])

    const Dashboard = await getDashboard()
    render(<Dashboard />)

    await waitFor(() => {
      expect(screen.queryByText('connectSensor')).toBeNull()
    })
  })

  it('shows an error message when data load fails', async () => {
    mockGetTemperatureLocations.mockRejectedValue(new Error('DB error'))

    const Dashboard = await getDashboard()
    render(<Dashboard />)

    await waitFor(() => {
      const alert = screen.getByRole('alert')
      expect(alert.textContent).toContain('Failed to load temperature data')
    })
  })

  it('RTL snapshot — renders location cards correctly with dir="rtl"', async () => {
    const location = makeLocation({ id: 'loc-001', name: 'Reagent Fridge' })
    mockGetTemperatureLocations.mockResolvedValue([location])
    // Use a fixed timestamp so the formatted time is deterministic across runs
    mockGetReadingsByLocation.mockResolvedValue([
      { ...makeReading('loc-001'), timestamp: '2026-06-12T14:00:00.000Z' },
    ])

    const Dashboard = await getDashboard()
    const { container } = render(
      <div dir="rtl">
        <Dashboard />
      </div>,
    )

    await waitFor(() => {
      expect(screen.getByText('Reagent Fridge')).toBeDefined()
    })

    expect(container.firstChild).toMatchSnapshot()
  })
})
