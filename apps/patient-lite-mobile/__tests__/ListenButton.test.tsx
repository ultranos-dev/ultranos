import { render, fireEvent, waitFor } from '@testing-library/react-native'
import { ListenButton } from '@/components/ListenButton'

// Uses __mocks__/expo-av.js for auto-mock
jest.mock('expo-av')

// Mock TTS API
jest.mock('@/lib/tts-api', () => ({
  generatePrescriptionAudio: jest.fn(),
  logPlaybackCompletion: jest.fn(),
}))

// Mock fragment stitcher
jest.mock('@/lib/tts-fragment-stitcher', () => ({
  getStitchableFragments: jest.fn().mockReturnValue(null),
  hasOfflineFragments: jest.fn().mockReturnValue(false),
}))

const PATIENT_ID = '00000000-0000-4000-8000-000000000001'
const MED_RX_ID = '00000000-0000-4000-8000-000000000002'

describe('ListenButton', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders Listen button when AI_PROCESSING consent is granted', () => {
    const { getByTestId, getByText } = render(
      <ListenButton
        medicationRequestId={MED_RX_ID}
        medicationCode="AMOX500"
        patientId={PATIENT_ID}
        dialect="EN"
        hasAIConsent={true}
      />,
    )

    expect(getByTestId('listen-button')).toBeTruthy()
    expect(getByText('Listen')).toBeTruthy()
  })

  it('hides button when AI_PROCESSING consent is NOT granted', () => {
    const { queryByTestId } = render(
      <ListenButton
        medicationRequestId={MED_RX_ID}
        medicationCode="AMOX500"
        patientId={PATIENT_ID}
        dialect="EN"
        hasAIConsent={false}
      />,
    )

    expect(queryByTestId('listen-button')).toBeNull()
  })

  it('has correct accessibility label', () => {
    const { getByTestId } = render(
      <ListenButton
        medicationRequestId={MED_RX_ID}
        medicationCode="AMOX500"
        patientId={PATIENT_ID}
        dialect="EN"
        hasAIConsent={true}
      />,
    )

    const button = getByTestId('listen-button')
    expect(button.props.accessibilityLabel).toBe('Listen to medication instructions')
  })

  it('shows disclaimer text when player is active', async () => {
    const { generatePrescriptionAudio } = require('@/lib/tts-api')
    generatePrescriptionAudio.mockRejectedValue(new Error('TTS_UNAVAILABLE'))

    const { getByTestId, getByText } = render(
      <ListenButton
        medicationRequestId={MED_RX_ID}
        medicationCode="AMOX500"
        patientId={PATIENT_ID}
        dialect="EN"
        hasAIConsent={true}
        isOnline={true}
      />,
    )

    fireEvent.press(getByTestId('listen-button'))

    await waitFor(() => {
      expect(getByTestId('tts-disclaimer')).toBeTruthy()
    })
  })

  it('shows "Audio unavailable" when both online and offline fail', async () => {
    const { generatePrescriptionAudio } = require('@/lib/tts-api')
    generatePrescriptionAudio.mockRejectedValue(new Error('TTS_UNAVAILABLE'))

    const { getStitchableFragments } = require('@/lib/tts-fragment-stitcher')
    getStitchableFragments.mockReturnValue(null)

    const { getByTestId, getByText } = render(
      <ListenButton
        medicationRequestId={MED_RX_ID}
        medicationCode="AMOX500"
        patientId={PATIENT_ID}
        dialect="EN"
        hasAIConsent={true}
        isOnline={true}
      />,
    )

    fireEvent.press(getByTestId('listen-button'))

    await waitFor(() => {
      expect(getByText(/Audio unavailable/)).toBeTruthy()
    })
  })
})
