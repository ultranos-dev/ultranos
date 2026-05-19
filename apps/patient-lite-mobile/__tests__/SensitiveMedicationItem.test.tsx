import { render, fireEvent, waitFor, act } from '@testing-library/react-native'
import { SensitiveMedicationItem } from '@/components/SensitiveMedicationItem'
import * as audit from '@/lib/audit'
import * as keyService from '@/lib/mobile-key-service'

jest.mock('@/lib/audit')
jest.mock('@/lib/mobile-key-service')

const mockEmitAudit = jest.mocked(audit.emitAuditEvent)
const mockUnlock = jest.mocked(keyService.unlockWithBiometrics)

const PATIENT_ID = 'patient-001'
const MED_ID = 'med-sensitive-001'
const MED_NAME = 'Tenofovir 300mg'

describe('SensitiveMedicationItem', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()
    mockUnlock.mockResolvedValue({ success: true, unlockToken: 'test-token' })
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('shows "Private Health Matter" by default, not the medication name', () => {
    const { getByText, queryByText } = render(
      <SensitiveMedicationItem
        medicationId={MED_ID}
        medicationName={MED_NAME}
        patientId={PATIENT_ID}
      />,
    )

    expect(getByText('Private Health Matter')).toBeTruthy()
    expect(queryByText(MED_NAME)).toBeNull()
  })

  it('shows lock icon when masked', () => {
    const { getByTestId } = render(
      <SensitiveMedicationItem
        medicationId={MED_ID}
        medicationName={MED_NAME}
        patientId={PATIENT_ID}
      />,
    )

    expect(getByTestId('lock-icon')).toBeTruthy()
  })

  it('reveals medication name after biometric success', async () => {
    const { getByTestId, getByText, queryByText } = render(
      <SensitiveMedicationItem
        medicationId={MED_ID}
        medicationName={MED_NAME}
        patientId={PATIENT_ID}
      />,
    )

    await act(async () => {
      fireEvent.press(getByTestId(`sensitive-med-${MED_ID}`))
    })

    await waitFor(() => {
      expect(getByText(MED_NAME)).toBeTruthy()
      expect(queryByText('Private Health Matter')).toBeNull()
    })
  })

  it('emits PHI_UNMASK audit event on biometric success', async () => {
    const { getByTestId } = render(
      <SensitiveMedicationItem
        medicationId={MED_ID}
        medicationName={MED_NAME}
        patientId={PATIENT_ID}
      />,
    )

    await act(async () => {
      fireEvent.press(getByTestId(`sensitive-med-${MED_ID}`))
    })

    expect(mockEmitAudit).toHaveBeenCalledWith({
      action: 'PHI_UNMASK',
      resourceType: 'MedicationRequest',
      resourceId: MED_ID,
      patientId: PATIENT_ID,
      outcome: 'success',
    })
  })

  it('auto-hides medication after 30 seconds', async () => {
    const { getByTestId, getByText, queryByText } = render(
      <SensitiveMedicationItem
        medicationId={MED_ID}
        medicationName={MED_NAME}
        patientId={PATIENT_ID}
      />,
    )

    // Reveal
    await act(async () => {
      fireEvent.press(getByTestId(`sensitive-med-${MED_ID}`))
    })

    await waitFor(() => {
      expect(getByText(MED_NAME)).toBeTruthy()
    })

    // Advance 30 seconds
    act(() => {
      jest.advanceTimersByTime(30_000)
    })

    expect(getByText('Private Health Matter')).toBeTruthy()
    expect(queryByText(MED_NAME)).toBeNull()
  })

  it('stays revealed before 30 seconds', async () => {
    const { getByTestId, getByText } = render(
      <SensitiveMedicationItem
        medicationId={MED_ID}
        medicationName={MED_NAME}
        patientId={PATIENT_ID}
      />,
    )

    await act(async () => {
      fireEvent.press(getByTestId(`sensitive-med-${MED_ID}`))
    })

    await waitFor(() => {
      expect(getByText(MED_NAME)).toBeTruthy()
    })

    // Advance 29 seconds — should still be visible
    act(() => {
      jest.advanceTimersByTime(29_000)
    })

    expect(getByText(MED_NAME)).toBeTruthy()
  })

  it('keeps medication masked on biometric failure', async () => {
    mockUnlock.mockResolvedValue({ success: false, reason: 'failed' })

    const { getByTestId, getByText, queryByText } = render(
      <SensitiveMedicationItem
        medicationId={MED_ID}
        medicationName={MED_NAME}
        patientId={PATIENT_ID}
      />,
    )

    await act(async () => {
      fireEvent.press(getByTestId(`sensitive-med-${MED_ID}`))
    })

    await waitFor(() => {
      expect(getByText('Private Health Matter')).toBeTruthy()
      expect(queryByText(MED_NAME)).toBeNull()
      expect(getByTestId('auth-error')).toBeTruthy()
    })
  })

  it('does not emit audit event on biometric failure', async () => {
    mockUnlock.mockResolvedValue({ success: false, reason: 'cancelled' })

    const { getByTestId } = render(
      <SensitiveMedicationItem
        medicationId={MED_ID}
        medicationName={MED_NAME}
        patientId={PATIENT_ID}
      />,
    )

    await act(async () => {
      fireEvent.press(getByTestId(`sensitive-med-${MED_ID}`))
    })

    expect(mockEmitAudit).not.toHaveBeenCalled()
  })

  it('has correct accessibility label when masked', () => {
    const { getByTestId } = render(
      <SensitiveMedicationItem
        medicationId={MED_ID}
        medicationName={MED_NAME}
        patientId={PATIENT_ID}
      />,
    )

    const card = getByTestId(`sensitive-med-${MED_ID}`)
    expect(card.props.accessibilityLabel).toBe('Private Health Matter - tap to reveal')
  })

  it('has correct accessibility label when revealed', async () => {
    const { getByTestId } = render(
      <SensitiveMedicationItem
        medicationId={MED_ID}
        medicationName={MED_NAME}
        patientId={PATIENT_ID}
      />,
    )

    await act(async () => {
      fireEvent.press(getByTestId(`sensitive-med-${MED_ID}`))
    })

    await waitFor(() => {
      const card = getByTestId(`sensitive-med-${MED_ID}`)
      expect(card.props.accessibilityLabel).toBe(`Medicine: ${MED_NAME}`)
    })
  })
})
