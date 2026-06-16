import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { TemperatureLocation, TemperatureReading, TemperatureExcursion } from '@/types/temperature-monitoring'
import { TemperatureSource, ExcursionSeverity } from '@/types/temperature-monitoring'

// ── next-intl mock ────────────────────────────────────────────────────────────
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
}))

// ── @/lib/safety/temperature-service mock ────────────────────────────────────
const mockLogReading = vi.fn()

vi.mock('@/lib/safety/temperature-service', () => ({
  logReading: (...args: unknown[]) => mockLogReading(...args),
  getExcursionDuration: vi.fn().mockReturnValue(30),
}))

// ── @/lib/safety/temperature-alerts mock ─────────────────────────────────────
const mockGenerateAlert = vi.fn()

vi.mock('@/lib/safety/temperature-alerts', () => ({
  generateAlert: (...args: unknown[]) => mockGenerateAlert(...args),
}))

// ── @/lib/db mock ─────────────────────────────────────────────────────────────
vi.mock('@/lib/db', () => ({
  getTemperatureLocations: vi.fn().mockResolvedValue([]),
  getReadingsByLocation: vi.fn().mockResolvedValue([]),
  getOngoingExcursionForLocation: vi.fn().mockResolvedValue(null),
}))

// ── @/lib/audit-client mock ───────────────────────────────────────────────────
const mockReportTemperatureEvent = vi.fn()

vi.mock('@/lib/audit-client', () => ({
  reportTemperatureEvent: (...args: unknown[]) => mockReportTemperatureEvent(...args),
}))

// ── Fixtures ──────────────────────────────────────────────────────────────────

const defaultLocation: TemperatureLocation = {
  id: 'loc-001',
  name: 'Reagent Fridge',
  minTemp: 2,
  maxTemp: 8,
  type: 'FRIDGE',
  sensorId: null,
}

function makeReading(temp: number): TemperatureReading {
  return {
    id: 'reading-001',
    locationId: defaultLocation.id,
    locationName: defaultLocation.name,
    temperatureCelsius: temp,
    timestamp: new Date().toISOString(),
    source: TemperatureSource.MANUAL,
    sensorId: null,
    recordedBy: 'tech-001',
    hlcTimestamp: 'hlc-001',
  }
}

function makeExcursion(): TemperatureExcursion {
  return {
    id: 'exc-001',
    locationId: defaultLocation.id,
    locationName: defaultLocation.name,
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

// ── Helper: lazy import after mocks ──────────────────────────────────────────
async function getModal() {
  const mod = await import('../components/safety/LogTemperatureModal')
  return mod.LogTemperatureModal
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('LogTemperatureModal — validation', () => {
  afterEach(cleanup)

  beforeEach(() => {
    vi.clearAllMocks()
    mockReportTemperatureEvent.mockResolvedValue(undefined)
  })

  it('shows a validation error for temperatures below -80°C', async () => {
    const user = userEvent.setup()
    const Modal = await getModal()
    render(
      <Modal location={defaultLocation} onClose={vi.fn()} onSaved={vi.fn()} />,
    )

    const input = screen.getByLabelText(/temperatureLabel/i)
    await user.clear(input)
    await user.type(input, '-81')

    // Validation error key from t('invalidTemperature')
    await waitFor(() => {
      expect(screen.getByText('invalidTemperature')).toBeDefined()
    })
  })

  it('shows a validation error for temperatures above 60°C', async () => {
    const user = userEvent.setup()
    const Modal = await getModal()
    render(
      <Modal location={defaultLocation} onClose={vi.fn()} onSaved={vi.fn()} />,
    )

    const input = screen.getByLabelText(/temperatureLabel/i)
    await user.clear(input)
    await user.type(input, '61')

    await waitFor(() => {
      expect(screen.getByText('invalidTemperature')).toBeDefined()
    })
  })

  it('accepts the boundary value -80°C (no validation error)', async () => {
    const user = userEvent.setup()
    const Modal = await getModal()
    render(
      <Modal location={defaultLocation} onClose={vi.fn()} onSaved={vi.fn()} />,
    )

    const input = screen.getByLabelText(/temperatureLabel/i)
    await user.clear(input)
    await user.type(input, '-80')

    // No validation error should appear; excursion warning may appear (temp out of range)
    await waitFor(() => {
      expect(screen.queryByText('invalidTemperature')).toBeNull()
    })
  })

  it('accepts the boundary value 60°C (no validation error)', async () => {
    const user = userEvent.setup()
    const Modal = await getModal()
    render(
      <Modal location={defaultLocation} onClose={vi.fn()} onSaved={vi.fn()} />,
    )

    const input = screen.getByLabelText(/temperatureLabel/i)
    await user.clear(input)
    await user.type(input, '60')

    await waitFor(() => {
      expect(screen.queryByText('invalidTemperature')).toBeNull()
    })
  })
})

describe('LogTemperatureModal — excursion warning before save', () => {
  afterEach(cleanup)

  beforeEach(() => {
    vi.clearAllMocks()
    mockReportTemperatureEvent.mockResolvedValue(undefined)
  })

  it('shows excursion warning banner when entered temperature is outside the location range', async () => {
    const user = userEvent.setup()
    const Modal = await getModal()
    render(
      <Modal location={defaultLocation} onClose={vi.fn()} onSaved={vi.fn()} />,
    )

    // defaultLocation: minTemp=2, maxTemp=8 — entering 15 triggers excursion warning
    const input = screen.getByLabelText(/temperatureLabel/i)
    await user.clear(input)
    await user.type(input, '15')

    await waitFor(() => {
      // The excursion warning has role="alert"
      const alert = screen.getByRole('alert')
      expect(alert).toBeDefined()
      // The text is the translation key since our mock returns the key
      expect(alert.textContent).toContain('excursionWarningBeforeSave')
    })
  })

  it('does NOT show excursion warning when temperature is within the acceptable range', async () => {
    const user = userEvent.setup()
    const Modal = await getModal()
    render(
      <Modal location={defaultLocation} onClose={vi.fn()} onSaved={vi.fn()} />,
    )

    const input = screen.getByLabelText(/temperatureLabel/i)
    await user.clear(input)
    await user.type(input, '5')

    await waitFor(() => {
      expect(screen.queryByRole('alert')).toBeNull()
    })
  })
})

describe('LogTemperatureModal — save behavior', () => {
  afterEach(cleanup)

  beforeEach(() => {
    vi.clearAllMocks()
    mockReportTemperatureEvent.mockResolvedValue(undefined)
  })

  it('calls logReading() with correct arguments on save', async () => {
    const user = userEvent.setup()
    mockLogReading.mockResolvedValue({ reading: makeReading(5), excursion: null })

    const Modal = await getModal()
    render(
      <Modal location={defaultLocation} onClose={vi.fn()} onSaved={vi.fn()} />,
    )

    const input = screen.getByLabelText(/temperatureLabel/i)
    await user.clear(input)
    await user.type(input, '5')

    const saveButton = screen.getByText('save')
    await user.click(saveButton)

    await waitFor(() => {
      expect(mockLogReading).toHaveBeenCalledOnce()
      expect(mockLogReading).toHaveBeenCalledWith({
        locationId: defaultLocation.id,
        temperatureCelsius: 5,
        source: TemperatureSource.MANUAL,
      })
    })
  })

  it('calls onSaved() callback after a successful save', async () => {
    const user = userEvent.setup()
    const onSaved = vi.fn()
    mockLogReading.mockResolvedValue({ reading: makeReading(5), excursion: null })

    const Modal = await getModal()
    render(
      <Modal location={defaultLocation} onClose={vi.fn()} onSaved={onSaved} />,
    )

    const input = screen.getByLabelText(/temperatureLabel/i)
    await user.clear(input)
    await user.type(input, '5')

    await user.click(screen.getByText('save'))

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledOnce()
    })
  })

  it('does NOT call onSaved() if save fails', async () => {
    const user = userEvent.setup()
    const onSaved = vi.fn()
    mockLogReading.mockRejectedValue(new Error('Save failed'))

    const Modal = await getModal()
    render(
      <Modal location={defaultLocation} onClose={vi.fn()} onSaved={onSaved} />,
    )

    const input = screen.getByLabelText(/temperatureLabel/i)
    await user.clear(input)
    await user.type(input, '5')

    await user.click(screen.getByText('save'))

    await waitFor(() => {
      // Error message shown, but onSaved never called
      expect(screen.getByText('saveFailed')).toBeDefined()
    })

    expect(onSaved).not.toHaveBeenCalled()
  })

  it('calls generateAlert when an excursion is detected on save', async () => {
    const user = userEvent.setup()
    const excursion = makeExcursion()
    mockLogReading.mockResolvedValue({ reading: makeReading(12), excursion })
    mockGenerateAlert.mockReturnValue({
      excursionId: excursion.id,
      locationId: defaultLocation.id,
      locationName: defaultLocation.name,
      severity: ExcursionSeverity.CRITICAL,
      message: 'Reagent Fridge exceeded 8°C — duration 0.5 hours.',
      notifyLabManager: true,
    })

    const Modal = await getModal()
    render(
      <Modal location={defaultLocation} onClose={vi.fn()} onSaved={vi.fn()} />,
    )

    const input = screen.getByLabelText(/temperatureLabel/i)
    await user.clear(input)
    await user.type(input, '12')

    await user.click(screen.getByText('save'))

    await waitFor(() => {
      expect(mockGenerateAlert).toHaveBeenCalledOnce()
      expect(mockGenerateAlert).toHaveBeenCalledWith(excursion, defaultLocation)
    })
  })
})
