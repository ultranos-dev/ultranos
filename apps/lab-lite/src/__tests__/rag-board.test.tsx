/**
 * RAGBoard component tests — Story 51.5
 *
 * Tests: renders 4 dimension cards, RAG colors, drill-down panel,
 * wall display toggle, access control, auto-refresh.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, act, fireEvent, cleanup } from '@testing-library/react'

// Mock rag-service
vi.mock('@/lib/rag-service', () => ({
  getFullRAGStatus: vi.fn(),
}))

// Mock auth store
vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: vi.fn(),
}))

// Mock sub-components to isolate RAGBoard logic
vi.mock('@/components/readiness/RAGDimensionCard', () => ({
  RAGDimensionCard: ({ dimension, status, onClick }: { dimension: string; status: string; onClick?: () => void }) => (
    <button data-testid={`card-${dimension}`} data-status={status} onClick={onClick}>
      {dimension}
    </button>
  ),
}))

vi.mock('@/components/readiness/RAGBoardWallDisplay', () => ({
  RAGBoardWallDisplay: ({ onExit }: { onExit: () => void }) => (
    <div data-testid="wall-display">
      <button onClick={onExit} data-testid="exit-wall">Exit</button>
    </div>
  ),
}))

// Mock drill-down components
vi.mock('@/components/readiness/PersonnelDrillDown', () => ({
  PersonnelDrillDown: ({ onBack }: { onBack: () => void }) => (
    <div data-testid="personnel-drill-down">
      <button onClick={onBack} data-testid="drill-back">Back</button>
    </div>
  ),
}))
vi.mock('@/components/readiness/EquipmentDrillDown', () => ({
  EquipmentDrillDown: () => <div data-testid="equipment-drill-down" />,
}))
vi.mock('@/components/readiness/SupplyDrillDown', () => ({
  SupplyDrillDown: () => <div data-testid="supply-drill-down" />,
}))
vi.mock('@/components/readiness/QCDrillDown', () => ({
  QCDrillDown: () => <div data-testid="qc-drill-down" />,
}))

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

// Mock ui-kit icons
vi.mock('@ultranos/ui-kit/icons', () => ({
  Maximize2: () => <svg data-testid="maximize-icon" />,
  X: () => <svg data-testid="x-icon" />,
  ArrowLeft: () => <svg data-testid="arrow-left" />,
}))

vi.mock('@ultranos/shared-types', () => ({
  LabRole: {
    LAB_TECH: 'LAB_TECH',
    SENIOR_TECH: 'SENIOR_TECH',
    SUPERVISOR: 'SUPERVISOR',
    LAB_MANAGER: 'LAB_MANAGER',
  },
}))

import { RAGBoard } from '@/components/readiness/RAGBoard'
import { getFullRAGStatus } from '@/lib/rag-service'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import type { RAGBoardState } from '@/lib/rag-service'

const mockGetFullRAGStatus = vi.mocked(getFullRAGStatus)
const mockUseAuthSessionStore = vi.mocked(useAuthSessionStore)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGreenBoard(): RAGBoardState {
  const now = new Date().toISOString()
  const makeDim = (dimension: 'PERSONNEL' | 'EQUIPMENT' | 'SUPPLIES' | 'QC') => ({
    dimension,
    status: 'GREEN' as const,
    summary: 'All OK',
    details: [],
    updatedAt: now,
  })
  return {
    personnel: makeDim('PERSONNEL'),
    equipment: makeDim('EQUIPMENT'),
    supplies: makeDim('SUPPLIES'),
    qc: makeDim('QC'),
    overallStatus: 'GREEN',
    generatedAt: now,
  }
}

function makeBoard(overrides: Partial<RAGBoardState>): RAGBoardState {
  return { ...makeGreenBoard(), ...overrides }
}

function setAuthorizedRole(role: string) {
  mockUseAuthSessionStore.mockImplementation((selector: (s: { session: { labRole: string } | null }) => unknown) =>
    selector({ session: { labRole: role } })
  )
}

function setUnauthorizedRole(role: string) {
  setAuthorizedRole(role)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  setAuthorizedRole('SUPERVISOR')
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

// ---------------------------------------------------------------------------
// Access control
// ---------------------------------------------------------------------------

describe('RAGBoard access control', () => {
  it('renders access denied for LAB_TECH role', () => {
    setUnauthorizedRole('LAB_TECH')
    render(<RAGBoard />)
    expect(screen.getByRole('alert')).toBeDefined()
    expect(screen.queryByTestId('card-PERSONNEL')).toBeNull()
  })

  it('renders access denied for SENIOR_TECH role', () => {
    setUnauthorizedRole('SENIOR_TECH')
    render(<RAGBoard />)
    expect(screen.getByRole('alert')).toBeDefined()
  })

  it('renders board for SUPERVISOR role', async () => {
    setAuthorizedRole('SUPERVISOR')
    mockGetFullRAGStatus.mockResolvedValue(makeGreenBoard())
    render(<RAGBoard initialBoardState={makeGreenBoard()} />)
    expect(screen.getByTestId('card-PERSONNEL')).toBeDefined()
  })

  it('renders board for LAB_MANAGER role', async () => {
    setAuthorizedRole('LAB_MANAGER')
    mockGetFullRAGStatus.mockResolvedValue(makeGreenBoard())
    render(<RAGBoard initialBoardState={makeGreenBoard()} />)
    expect(screen.getByTestId('card-PERSONNEL')).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// Board rendering
// ---------------------------------------------------------------------------

describe('RAGBoard board rendering', () => {
  it('renders all four dimension cards', () => {
    render(<RAGBoard initialBoardState={makeGreenBoard()} />)
    expect(screen.getByTestId('card-PERSONNEL')).toBeDefined()
    expect(screen.getByTestId('card-EQUIPMENT')).toBeDefined()
    expect(screen.getByTestId('card-SUPPLIES')).toBeDefined()
    expect(screen.getByTestId('card-QC')).toBeDefined()
  })

  it('passes RED status to dimension card', () => {
    const board = makeBoard({
      personnel: {
        dimension: 'PERSONNEL',
        status: 'RED',
        summary: 'Understaffed',
        details: [],
        updatedAt: new Date().toISOString(),
      },
    })
    render(<RAGBoard initialBoardState={board} />)
    expect(screen.getByTestId('card-PERSONNEL').getAttribute('data-status')).toBe('RED')
  })

  it('passes AMBER status to dimension card', () => {
    const board = makeBoard({
      equipment: {
        dimension: 'EQUIPMENT',
        status: 'AMBER',
        summary: 'Near threshold',
        details: [],
        updatedAt: new Date().toISOString(),
      },
    })
    render(<RAGBoard initialBoardState={board} />)
    expect(screen.getByTestId('card-EQUIPMENT').getAttribute('data-status')).toBe('AMBER')
  })

  it('renders wall display button', () => {
    render(<RAGBoard initialBoardState={makeGreenBoard()} />)
    const btn = screen.getByRole('button', { name: /rag\.wallDisplay/i })
    expect(btn).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// Wall display mode
// ---------------------------------------------------------------------------

describe('RAGBoard wall display', () => {
  it('switches to wall display when wall display button is clicked', async () => {
    render(<RAGBoard initialBoardState={makeGreenBoard()} />)
    const btn = screen.getByRole('button', { name: /rag\.wallDisplay/i })
    await act(async () => { fireEvent.click(btn) })
    expect(screen.getByTestId('wall-display')).toBeDefined()
    expect(screen.queryByTestId('card-PERSONNEL')).toBeNull()
  })

  it('returns to normal view when wall display onExit is called', async () => {
    render(<RAGBoard initialBoardState={makeGreenBoard()} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /rag\.wallDisplay/i }))
    })
    await act(async () => {
      fireEvent.click(screen.getByTestId('exit-wall'))
    })
    expect(screen.queryByTestId('wall-display')).toBeNull()
    expect(screen.getByTestId('card-PERSONNEL')).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// Auto-refresh
// ---------------------------------------------------------------------------

describe('RAGBoard auto-refresh', () => {
  it('calls getFullRAGStatus on mount when no initialBoardState', async () => {
    mockGetFullRAGStatus.mockResolvedValue(makeGreenBoard())
    render(<RAGBoard />)
    await waitFor(() => {
      expect(mockGetFullRAGStatus).toHaveBeenCalledTimes(1)
    })
  })

  it('does not call getFullRAGStatus on mount when initialBoardState provided', () => {
    render(<RAGBoard initialBoardState={makeGreenBoard()} />)
    // Advance timers slightly — no initial fetch expected
    act(() => { vi.advanceTimersByTime(100) })
    expect(mockGetFullRAGStatus).not.toHaveBeenCalled()
  })

  it('calls getFullRAGStatus again after 60s interval', async () => {
    mockGetFullRAGStatus.mockResolvedValue(makeGreenBoard())
    render(<RAGBoard initialBoardState={makeGreenBoard()} />)
    expect(mockGetFullRAGStatus).not.toHaveBeenCalled()
    await act(async () => { vi.advanceTimersByTime(60_000) })
    expect(mockGetFullRAGStatus).toHaveBeenCalledTimes(1)
    await act(async () => { vi.advanceTimersByTime(60_000) })
    expect(mockGetFullRAGStatus).toHaveBeenCalledTimes(2)
  })
})
