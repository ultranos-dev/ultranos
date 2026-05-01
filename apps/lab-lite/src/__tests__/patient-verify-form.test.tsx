import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react'
import { PatientVerifyForm } from '../components/PatientVerifyForm'

const mockVerifyPatient = vi.fn()

vi.mock('@/lib/trpc', () => ({
  verifyPatient: (...args: unknown[]) => mockVerifyPatient(...args),
}))

const defaultProps = {
  onVerified: vi.fn(),
  onError: vi.fn(),
  token: 'test-jwt-token',
}

describe('PatientVerifyForm', () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the National ID input field', () => {
    render(<PatientVerifyForm {...defaultProps} />)
    expect(screen.getByLabelText('National ID')).toBeDefined()
    expect(screen.getByPlaceholderText('Enter patient National ID')).toBeDefined()
  })

  it('submits National ID and shows verification card with first name + age only', async () => {
    mockVerifyPatient.mockResolvedValue({
      firstName: 'Amir',
      age: 35,
      patientRef: 'abc123',
    })

    render(<PatientVerifyForm {...defaultProps} />)

    fireEvent.change(screen.getByLabelText('National ID'), {
      target: { value: 'NID-12345' },
    })

    await act(async () => {
      fireEvent.click(screen.getByText('Look Up Patient'))
    })

    await waitFor(() => {
      expect(screen.getByText('Amir')).toBeDefined()
      expect(screen.getByText('35')).toBeDefined()
      expect(screen.getByText('Patient Verified')).toBeDefined()
    })

    // Verify the API was called with NATIONAL_ID method
    expect(mockVerifyPatient).toHaveBeenCalledWith('NID-12345', 'NATIONAL_ID', 'test-jwt-token')
  })

  it('calls onVerified with full result when Confirm Patient is clicked', async () => {
    const verifiedResult = { firstName: 'Fatima', age: 28, patientRef: 'ref-xyz' }
    mockVerifyPatient.mockResolvedValue(verifiedResult)

    render(<PatientVerifyForm {...defaultProps} />)

    fireEvent.change(screen.getByLabelText('National ID'), {
      target: { value: 'NID-67890' },
    })

    await act(async () => {
      fireEvent.click(screen.getByText('Look Up Patient'))
    })

    await waitFor(() => {
      expect(screen.getByText('Confirm Patient')).toBeDefined()
    })

    await act(async () => {
      fireEvent.click(screen.getByText('Confirm Patient'))
    })

    expect(defaultProps.onVerified).toHaveBeenCalledWith(verifiedResult)
  })

  it('calls onError when verification fails', async () => {
    mockVerifyPatient.mockRejectedValue(new Error('Patient not found'))

    render(<PatientVerifyForm {...defaultProps} />)

    fireEvent.change(screen.getByLabelText('National ID'), {
      target: { value: 'NID-INVALID' },
    })

    await act(async () => {
      fireEvent.click(screen.getByText('Look Up Patient'))
    })

    await waitFor(() => {
      expect(defaultProps.onError).toHaveBeenCalledWith('Patient not found')
    })
  })

  it('does not display patientRef in the UI (data minimization)', async () => {
    mockVerifyPatient.mockResolvedValue({
      firstName: 'Amir',
      age: 35,
      patientRef: 'secret-ref-should-not-appear',
    })

    render(<PatientVerifyForm {...defaultProps} />)

    fireEvent.change(screen.getByLabelText('National ID'), {
      target: { value: 'NID-12345' },
    })

    await act(async () => {
      fireEvent.click(screen.getByText('Look Up Patient'))
    })

    await waitFor(() => {
      expect(screen.getByText('Amir')).toBeDefined()
    })

    // patientRef must NOT be visible in the rendered output
    expect(screen.queryByText('secret-ref-should-not-appear')).toBeNull()
  })

  it('resets form when Try Again is clicked', async () => {
    mockVerifyPatient.mockResolvedValue({
      firstName: 'Amir',
      age: 35,
      patientRef: 'ref-1',
    })

    render(<PatientVerifyForm {...defaultProps} />)

    fireEvent.change(screen.getByLabelText('National ID'), {
      target: { value: 'NID-12345' },
    })

    await act(async () => {
      fireEvent.click(screen.getByText('Look Up Patient'))
    })

    await waitFor(() => {
      expect(screen.getByText('Try Again')).toBeDefined()
    })

    await act(async () => {
      fireEvent.click(screen.getByText('Try Again'))
    })

    // Should be back to input mode
    expect(screen.getByLabelText('National ID')).toBeDefined()
    expect(screen.queryByText('Patient Verified')).toBeNull()
  })

  it('disables submit button when input is empty', () => {
    render(<PatientVerifyForm {...defaultProps} />)
    const button = screen.getByText('Look Up Patient')
    expect(button.hasAttribute('disabled')).toBe(true)
  })
})
