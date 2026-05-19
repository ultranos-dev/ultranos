import { render, fireEvent, waitFor, act } from '@testing-library/react-native'
import { MedicalTimeline } from '@/components/timeline/MedicalTimeline'
import * as audit from '@/lib/audit'
import * as keyService from '@/lib/mobile-key-service'
import type { TimelineEvent } from '@/hooks/useMedicalHistory'

jest.mock('@/lib/audit')
jest.mock('@/lib/mobile-key-service')

const mockEmitAudit = jest.mocked(audit.emitAuditEvent)
const mockUnlock = jest.mocked(keyService.unlockWithBiometrics)

const PATIENT_ID = 'patient-001'

const makeEvent = (overrides: Partial<TimelineEvent> = {}): TimelineEvent => ({
  id: 'evt-001',
  type: 'encounter',
  date: '2026-03-15T10:00:00Z',
  label: 'Doctor Visit',
  icon: 'stethoscope',
  isSensitive: false,
  status: 'finished',
  resource: {} as TimelineEvent['resource'],
  ...overrides,
})

describe('Sensitive medication in MedicalTimeline', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()
    mockUnlock.mockResolvedValue({ success: true, unlockToken: 'test-token' })
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('shows "Private Health Matter" for sensitive medication in timeline', () => {
    const sensitiveMed = makeEvent({
      id: 'med-sensitive-001',
      type: 'medication',
      label: 'Tenofovir 300mg',
      icon: 'pill',
      isSensitive: true,
      status: 'active',
    })

    const { getByText, queryByText } = render(
      <MedicalTimeline
        events={[sensitiveMed]}
        activeMedications={[]}
        isLoading={false}
        error={null}
        patientId={PATIENT_ID}
      />,
    )

    expect(getByText('Private Health Matter')).toBeTruthy()
    expect(queryByText('Tenofovir 300mg')).toBeNull()
  })

  it('requires biometric to reveal sensitive medication', async () => {
    const sensitiveMed = makeEvent({
      id: 'med-sensitive-001',
      type: 'medication',
      label: 'Tenofovir 300mg',
      icon: 'pill',
      isSensitive: true,
      status: 'active',
    })

    const { getByTestId } = render(
      <MedicalTimeline
        events={[sensitiveMed]}
        activeMedications={[]}
        isLoading={false}
        error={null}
        patientId={PATIENT_ID}
      />,
    )

    await act(async () => {
      fireEvent.press(getByTestId('timeline-card-med-sensitive-001'))
    })

    expect(mockUnlock).toHaveBeenCalled()
  })

  it('emits PHI_UNMASK (not PHI_DISPLAY) for sensitive medication reveal', async () => {
    const sensitiveMed = makeEvent({
      id: 'med-sensitive-001',
      type: 'medication',
      label: 'Tenofovir 300mg',
      icon: 'pill',
      isSensitive: true,
      status: 'active',
    })

    const { getByTestId } = render(
      <MedicalTimeline
        events={[sensitiveMed]}
        activeMedications={[]}
        isLoading={false}
        error={null}
        patientId={PATIENT_ID}
      />,
    )

    await act(async () => {
      fireEvent.press(getByTestId('timeline-card-med-sensitive-001'))
    })

    expect(mockEmitAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PHI_UNMASK',
        resourceType: 'MedicationRequest',
        resourceId: 'med-sensitive-001',
        patientId: PATIENT_ID,
      }),
    )
  })

  it('auto-hides sensitive medication after 30 seconds in timeline', async () => {
    const sensitiveMed = makeEvent({
      id: 'med-sensitive-001',
      type: 'medication',
      label: 'Tenofovir 300mg',
      icon: 'pill',
      isSensitive: true,
      status: 'active',
    })

    const { getByTestId, getByText, queryByText } = render(
      <MedicalTimeline
        events={[sensitiveMed]}
        activeMedications={[]}
        isLoading={false}
        error={null}
        patientId={PATIENT_ID}
      />,
    )

    // Reveal
    await act(async () => {
      fireEvent.press(getByTestId('timeline-card-med-sensitive-001'))
    })

    await waitFor(() => {
      expect(queryByText('Private Health Matter')).toBeNull()
    })

    // Advance 30 seconds
    act(() => {
      jest.advanceTimersByTime(30_000)
    })

    expect(getByText('Private Health Matter')).toBeTruthy()
  })

  it('keeps sensitive medication masked on biometric failure', async () => {
    mockUnlock.mockResolvedValue({ success: false, reason: 'failed' })

    const sensitiveMed = makeEvent({
      id: 'med-sensitive-001',
      type: 'medication',
      label: 'Tenofovir 300mg',
      icon: 'pill',
      isSensitive: true,
      status: 'active',
    })

    const { getByTestId, getByText, queryByText } = render(
      <MedicalTimeline
        events={[sensitiveMed]}
        activeMedications={[]}
        isLoading={false}
        error={null}
        patientId={PATIENT_ID}
      />,
    )

    await act(async () => {
      fireEvent.press(getByTestId('timeline-card-med-sensitive-001'))
    })

    await waitFor(() => {
      expect(getByText('Private Health Matter')).toBeTruthy()
      expect(queryByText('Tenofovir 300mg')).toBeNull()
    })
  })

  it('non-sensitive medications display normally', () => {
    const normalMed = makeEvent({
      id: 'med-normal-001',
      type: 'medication',
      label: 'Amoxicillin 500mg',
      icon: 'pill',
      isSensitive: false,
      status: 'active',
    })

    const { getByText } = render(
      <MedicalTimeline
        events={[normalMed]}
        activeMedications={[]}
        isLoading={false}
        error={null}
        patientId={PATIENT_ID}
      />,
    )

    expect(getByText('Amoxicillin 500mg')).toBeTruthy()
  })

  it('renders SensitiveMedicationItem in ActiveMedications for sensitive meds', () => {
    const sensitiveMed = makeEvent({
      id: 'med-sensitive-001',
      type: 'medication',
      label: 'Tenofovir 300mg',
      icon: 'pill',
      isSensitive: true,
      status: 'active',
    })

    const normalMed = makeEvent({
      id: 'med-normal-001',
      type: 'medication',
      label: 'Amoxicillin 500mg',
      icon: 'pill',
      isSensitive: false,
      status: 'active',
    })

    const { getByTestId, queryByTestId } = render(
      <MedicalTimeline
        events={[sensitiveMed, normalMed]}
        activeMedications={[sensitiveMed, normalMed]}
        isLoading={false}
        error={null}
        patientId={PATIENT_ID}
      />,
    )

    // Sensitive med uses SensitiveMedicationItem
    expect(getByTestId('sensitive-med-med-sensitive-001')).toBeTruthy()
    // Normal med uses regular ActiveMedCard
    expect(getByTestId('active-med-med-normal-001')).toBeTruthy()
  })
})
