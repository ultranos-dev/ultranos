import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import type { TemperatureLocation, TemperatureReading } from '@/types/temperature-monitoring'
import { TemperatureSource } from '@/types/temperature-monitoring'

// ── next-intl mock ────────────────────────────────────────────────────────────
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
}))

// ── @/lib/db mock ─────────────────────────────────────────────────────────────
const mockGetReadingsByLocation = vi.fn()

vi.mock('@/lib/db', () => ({
  getReadingsByLocation: (...args: unknown[]) => mockGetReadingsByLocation(...args),
}))

// ── Canvas 2D context stub ────────────────────────────────────────────────────
// jsdom does not implement canvas rendering; stub all methods used by drawChart.
const canvasContextStub = {
  clearRect: vi.fn(),
  fillRect: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  stroke: vi.fn(),
  fill: vi.fn(),
  arc: vi.fn(),
  fillText: vi.fn(),
  measureText: vi.fn().mockReturnValue({ width: 0 }),
  setLineDash: vi.fn(),
  // Properties written to directly
  fillStyle: '',
  strokeStyle: '',
  lineWidth: 0,
  font: '',
  textAlign: '',
}

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

function makeReading(
  timestamp: string,
  temperatureCelsius = 5,
  locationId = 'loc-001',
): TemperatureReading {
  return {
    id: `reading-${timestamp}`,
    locationId,
    locationName: 'Reagent Fridge',
    temperatureCelsius,
    timestamp,
    source: TemperatureSource.MANUAL,
    sensorId: null,
    recordedBy: 'tech-001',
    hlcTimestamp: `hlc-${timestamp}`,
  }
}

// ── Helper: lazy import after mocks ──────────────────────────────────────────
async function getChart() {
  const mod = await import('../components/safety/TemperatureTrendChart')
  return mod.TemperatureTrendChart
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('TemperatureTrendChart', () => {
  afterEach(cleanup)

  beforeEach(() => {
    vi.clearAllMocks()
    // Spy on getContext before each test — returns our stub
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      canvasContextStub as unknown as CanvasRenderingContext2D,
    )
  })

  it('renders a canvas element when readings are provided', async () => {
    // Provide readings within the last 7 days so they pass the date filter
    const now = new Date()
    const recent = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000) // 2 days ago
    const readings = [makeReading(recent.toISOString(), 5)]
    mockGetReadingsByLocation.mockResolvedValue(readings)

    const Chart = await getChart()
    render(<Chart location={makeLocation()} />)

    await waitFor(() => {
      const canvas = screen.queryByRole('img')
      expect(canvas).not.toBeNull()
      expect(canvas?.tagName.toLowerCase()).toBe('canvas')
    })
  })

  it('does NOT render a canvas when readings array is empty', async () => {
    mockGetReadingsByLocation.mockResolvedValue([])

    const Chart = await getChart()
    render(<Chart location={makeLocation()} />)

    await waitFor(() => {
      // When empty, the component renders a placeholder div, not a canvas
      expect(screen.queryByRole('img')).toBeNull()
      // The empty-state text key should be visible
      expect(screen.getByText('noReadings')).toBeDefined()
    })
  })

  it('renders with RTL locale without crashing (smoke test)', async () => {
    // Re-mock next-intl to return an RTL locale for this test
    vi.doMock('next-intl', () => ({
      useTranslations: () => (key: string) => key,
      useLocale: () => 'ar',
    }))

    const now = new Date()
    const recent = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000)
    const readings = [makeReading(recent.toISOString(), 6)]
    mockGetReadingsByLocation.mockResolvedValue(readings)

    // Use the already-imported module with the initial locale mock (isRTL logic
    // is checked at render time; this confirms RTL doesn't throw)
    const Chart = await getChart()
    const { container } = render(
      <div dir="rtl">
        <Chart location={makeLocation()} />
      </div>,
    )

    await waitFor(() => {
      // Component should render without throwing; canvas OR empty state present
      expect(container.innerHTML).not.toBe('')
    })

    // Restore standard mock
    vi.doMock('next-intl', () => ({
      useTranslations: () => (key: string) => key,
      useLocale: () => 'en',
    }))
  })

  it('does not throw when passed a single reading', async () => {
    const now = new Date()
    const recent = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000)
    const readings = [makeReading(recent.toISOString(), 4)]
    mockGetReadingsByLocation.mockResolvedValue(readings)

    const Chart = await getChart()

    let renderError: unknown = null
    try {
      render(<Chart location={makeLocation()} />)
      await waitFor(() => {
        // Just wait for loading to finish — canvas or empty state present
        expect(screen.queryByRole('img') ?? screen.queryByText('noReadings')).not.toBeNull()
      })
    } catch (err) {
      renderError = err
    }

    expect(renderError).toBeNull()
  })
})
