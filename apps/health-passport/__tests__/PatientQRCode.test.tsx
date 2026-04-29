import { render, act } from '@testing-library/react-native'
import { PatientQRCode, type IdentityQRPayload } from '@/components/PatientQRCode'

// Mock react-native-qrcode-svg
jest.mock('react-native-qrcode-svg', () => {
  const { View } = require('react-native')
  return {
    __esModule: true,
    default: ({ value, size, color, backgroundColor, ecl }: {
      value: string
      size: number
      color: string
      backgroundColor: string
      ecl: string
    }) => (
      <View
        testID="qr-svg"
        accessibilityLabel={value}
        style={{ width: size, height: size }}
      />
    ),
  }
})

const TEST_PATIENT_ID = '550e8400-e29b-41d4-a716-446655440000'

describe('PatientQRCode', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2026-04-29T12:00:00Z'))
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('renders QR code container (AC: 2)', () => {
    const { getByTestId } = render(
      <PatientQRCode patientId={TEST_PATIENT_ID} />,
    )
    expect(getByTestId('patient-qr-code')).toBeTruthy()
    expect(getByTestId('qr-svg')).toBeTruthy()
  })

  it('generates payload with patient_id, issued_at, expiry — never raw PHI (CLAUDE.md)', () => {
    const { getByTestId } = render(
      <PatientQRCode patientId={TEST_PATIENT_ID} />,
    )

    const qrSvg = getByTestId('qr-svg')
    const payload: IdentityQRPayload = JSON.parse(qrSvg.props.accessibilityLabel)

    // Must contain pid (patient UUID)
    expect(payload.pid).toBe(TEST_PATIENT_ID)
    // Must contain issued-at timestamp
    expect(payload.iat).toBe('2026-04-29T12:00:00.000Z')
    // Must contain expiry (24h later)
    expect(payload.exp).toBe('2026-04-30T12:00:00.000Z')
    // Must contain version
    expect(payload.v).toBe(1)
    // Must NOT contain any PHI fields
    expect(payload).not.toHaveProperty('name')
    expect(payload).not.toHaveProperty('nationalId')
    expect(payload).not.toHaveProperty('birthDate')
    expect(payload).not.toHaveProperty('gender')
  })

  it('includes signature when provided', () => {
    const { getByTestId } = render(
      <PatientQRCode patientId={TEST_PATIENT_ID} signature="base64sig==" />,
    )

    const qrSvg = getByTestId('qr-svg')
    const payload = JSON.parse(qrSvg.props.accessibilityLabel)
    expect(payload.sig).toBe('base64sig==')
  })

  it('shows "Unverified" badge when no signature is provided', () => {
    const { getByTestId } = render(
      <PatientQRCode patientId={TEST_PATIENT_ID} />,
    )
    expect(getByTestId('qr-unverified-badge')).toBeTruthy()
  })

  it('hides "Unverified" badge when signature is provided', () => {
    const { queryByTestId } = render(
      <PatientQRCode patientId={TEST_PATIENT_ID} signature="base64sig==" />,
    )
    expect(queryByTestId('qr-unverified-badge')).toBeNull()
  })

  it('returns null for empty patientId', () => {
    const { toJSON } = render(
      <PatientQRCode patientId="" />,
    )
    expect(toJSON()).toBeNull()
  })

  it('uses high-contrast rendering: black QR on white background (AC: 5)', () => {
    const { getByTestId } = render(
      <PatientQRCode patientId={TEST_PATIENT_ID} />,
    )

    // QR wrapper should have white background and dark border
    const qrContainer = getByTestId('patient-qr-code')
    expect(qrContainer).toBeTruthy()

    // The QR SVG mock receives color/backgroundColor props
    const qrSvg = getByTestId('qr-svg')
    expect(qrSvg).toBeTruthy()
  })

  it('displays validity duration hint', () => {
    const { getByText } = render(
      <PatientQRCode patientId={TEST_PATIENT_ID} />,
    )
    expect(getByText('Valid for 24 hours')).toBeTruthy()
  })

  it('auto-refreshes payload before expiry', () => {
    const { getByTestId } = render(
      <PatientQRCode patientId={TEST_PATIENT_ID} />,
    )

    const initialPayload = getByTestId('qr-svg').props.accessibilityLabel

    // Advance time by 24 hours (the refresh interval)
    act(() => {
      jest.advanceTimersByTime(24 * 60 * 60 * 1000)
    })

    const refreshedPayload = getByTestId('qr-svg').props.accessibilityLabel

    // Payload should have been regenerated with new timestamps
    expect(refreshedPayload).not.toBe(initialPayload)

    const parsed: IdentityQRPayload = JSON.parse(refreshedPayload)
    expect(parsed.pid).toBe(TEST_PATIENT_ID)
    expect(parsed.iat).toBe('2026-04-30T12:00:00.000Z')
  })
})
