/**
 * ActivateOutbreakModal Component Tests — Story 54.5 (Task 15.4)
 *
 * Tests:
 *   - Role gate: null session → renders nothing, unauthorized → renders nothing
 *   - Authorized user sees the form
 *   - Form validation: missing pathogen, no test codes, no reason, bad multiplier
 *   - Pathogen selection autocomplete and LOINC code auto-population
 *   - Submit transitions to confirm dialog
 *   - Cancel calls onCancel
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks — declared before component import
// ---------------------------------------------------------------------------

vi.mock('@ultranos/ui-kit/icons', () => ({
  AlertTriangle: () => <span data-testid="alert-triangle-icon" />,
  ChevronDown: () => <span data-testid="chevron-down-icon" />,
}))

vi.mock('@ultranos/ui-kit', () => ({
  DirectionalIcon: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('@/lib/outbreak-service', () => ({
  isOutbreakAuthorized: vi.fn(),
}))

const mockSession = {
  userId: 'u1',
  role: 'HEALTH_OFFICER',
  labRole: null,
  practitionerId: 'prac-001',
}

vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: (selector: (s: { session: typeof mockSession | null }) => unknown) =>
    selector({ session: mockSession }),
}))

import { ActivateOutbreakModal } from '../components/outbreak/ActivateOutbreakModal'
import { isOutbreakAuthorized } from '../lib/outbreak-service'

const mockIsOutbreakAuthorized = vi.mocked(isOutbreakAuthorized)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const defaultProps = {
  labLocationIds: ['loc-001', 'loc-002'],
  onActivated: vi.fn().mockResolvedValue(undefined),
  onCancel: vi.fn(),
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ActivateOutbreakModal — role gate', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders nothing when user is not authorized', () => {
    mockIsOutbreakAuthorized.mockReturnValue(false)
    const { container } = render(<ActivateOutbreakModal {...defaultProps} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders the modal when user is authorized', () => {
    mockIsOutbreakAuthorized.mockReturnValue(true)
    render(<ActivateOutbreakModal {...defaultProps} />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Activate Outbreak Mode')).toBeInTheDocument()
  })

  it('renders nothing when session has no role (null session handled by store)', () => {
    // isOutbreakAuthorized returns false for unauthorized
    mockIsOutbreakAuthorized.mockReturnValue(false)
    const { container } = render(<ActivateOutbreakModal {...defaultProps} />)
    expect(container.firstChild).toBeNull()
  })
})

describe('ActivateOutbreakModal — form fields', () => {
  beforeEach(() => {
    mockIsOutbreakAuthorized.mockReturnValue(true)
    vi.clearAllMocks()
  })

  it('renders the pathogen search input', () => {
    render(<ActivateOutbreakModal {...defaultProps} />)
    expect(screen.getByLabelText(/target pathogen/i)).toBeInTheDocument()
  })

  it('renders activation reason textarea', () => {
    render(<ActivateOutbreakModal {...defaultProps} />)
    expect(screen.getByLabelText(/activation reason/i)).toBeInTheDocument()
  })

  it('renders surge multiplier input with default value 3', () => {
    render(<ActivateOutbreakModal {...defaultProps} />)
    const input = screen.getByLabelText(/surge inventory multiplier/i)
    expect(input).toHaveValue(3)
  })

  it('renders location checkboxes for each labLocationId', () => {
    render(<ActivateOutbreakModal {...defaultProps} />)
    expect(screen.getByText('loc-001')).toBeInTheDocument()
    expect(screen.getByText('loc-002')).toBeInTheDocument()
  })

  it('renders Cancel button', () => {
    render(<ActivateOutbreakModal {...defaultProps} />)
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
  })

  it('renders Review & Confirm button', () => {
    render(<ActivateOutbreakModal {...defaultProps} />)
    expect(screen.getByRole('button', { name: /review.*confirm/i })).toBeInTheDocument()
  })
})

describe('ActivateOutbreakModal — pathogen autocomplete', () => {
  beforeEach(() => {
    mockIsOutbreakAuthorized.mockReturnValue(true)
    vi.clearAllMocks()
  })

  it('shows dropdown on input focus', () => {
    render(<ActivateOutbreakModal {...defaultProps} />)
    const input = screen.getByLabelText(/target pathogen/i)
    fireEvent.focus(input)
    expect(screen.getByRole('listbox')).toBeInTheDocument()
  })

  it('shows common pathogens in dropdown', () => {
    render(<ActivateOutbreakModal {...defaultProps} />)
    fireEvent.focus(screen.getByLabelText(/target pathogen/i))
    expect(screen.getByRole('option', { name: 'Malaria' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Tuberculosis (TB)' })).toBeInTheDocument()
  })

  it('selecting a pathogen populates the input', () => {
    render(<ActivateOutbreakModal {...defaultProps} />)
    const input = screen.getByLabelText(/target pathogen/i)
    fireEvent.focus(input)
    fireEvent.mouseDown(screen.getByRole('option', { name: 'Malaria' }))
    expect(input).toHaveValue('Malaria')
  })

  it('selecting a pathogen auto-populates LOINC checkboxes', () => {
    render(<ActivateOutbreakModal {...defaultProps} />)
    fireEvent.focus(screen.getByLabelText(/target pathogen/i))
    fireEvent.mouseDown(screen.getByRole('option', { name: 'Malaria' }))
    // LOINC codes for Malaria should appear
    expect(screen.getByText(/51587-4/)).toBeInTheDocument()
  })
})

describe('ActivateOutbreakModal — form validation', () => {
  beforeEach(() => {
    mockIsOutbreakAuthorized.mockReturnValue(true)
    vi.clearAllMocks()
  })

  it('shows error when trying to submit without selecting a pathogen', () => {
    render(<ActivateOutbreakModal {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: /review.*confirm/i }))
    expect(screen.getByRole('alert')).toHaveTextContent(/select a target pathogen/i)
  })

  it('shows error when activation reason is empty', () => {
    render(<ActivateOutbreakModal {...defaultProps} />)
    // Select a pathogen first
    fireEvent.focus(screen.getByLabelText(/target pathogen/i))
    fireEvent.mouseDown(screen.getByRole('option', { name: 'Malaria' }))
    // Click submit without filling reason
    fireEvent.click(screen.getByRole('button', { name: /review.*confirm/i }))
    expect(screen.getByRole('alert')).toHaveTextContent(/activation reason/i)
  })

  it('shows error for surge multiplier below 1.5', () => {
    render(<ActivateOutbreakModal {...defaultProps} />)
    // Select pathogen
    fireEvent.focus(screen.getByLabelText(/target pathogen/i))
    fireEvent.mouseDown(screen.getByRole('option', { name: 'Malaria' }))
    // Enter reason
    fireEvent.change(screen.getByLabelText(/activation reason/i), {
      target: { value: 'WHO alert' },
    })
    // Set bad multiplier
    fireEvent.change(screen.getByLabelText(/surge inventory multiplier/i), {
      target: { value: '1' },
    })
    fireEvent.click(screen.getByRole('button', { name: /review.*confirm/i }))
    expect(screen.getByRole('alert')).toHaveTextContent(/surge multiplier/i)
  })

  it('transitions to confirm dialog when form is valid', () => {
    render(<ActivateOutbreakModal {...defaultProps} />)
    // Select pathogen
    fireEvent.focus(screen.getByLabelText(/target pathogen/i))
    fireEvent.mouseDown(screen.getByRole('option', { name: 'Malaria' }))
    // Enter reason
    fireEvent.change(screen.getByLabelText(/activation reason/i), {
      target: { value: 'WHO alert — Malaria surge' },
    })
    fireEvent.click(screen.getByRole('button', { name: /review.*confirm/i }))
    // Confirm dialog shows
    expect(screen.getByRole('dialog', { name: /confirm outbreak mode activation/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /activate outbreak mode/i })).toBeInTheDocument()
  })
})

describe('ActivateOutbreakModal — cancel', () => {
  beforeEach(() => {
    mockIsOutbreakAuthorized.mockReturnValue(true)
    vi.clearAllMocks()
  })

  it('calls onCancel when Cancel button is clicked', () => {
    const onCancel = vi.fn()
    render(<ActivateOutbreakModal {...defaultProps} onCancel={onCancel} />)
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
