import { render, fireEvent } from '@testing-library/react-native'

// Mock theme
jest.mock('@/theme/ThemeProvider', () => ({
  useTheme: () => ({
    colors: {
      surface: '#fff',
      surfaceElevated: '#f5f5f5',
      textPrimary: '#000',
      textSecondary: '#666',
      textMuted: '#999',
      border: '#ddd',
      primary: { 500: '#2196f3' },
      onPrimary: '#fff',
      error: '#f44336',
    },
  }),
}))

// Mock i18n
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

jest.mock('@/i18n', () => ({}))

import { ProfileSetupScreen } from '@/screens/registration/ProfileSetupScreen'

describe('ProfileSetupScreen — Story 27.10', () => {
  const mockOnComplete = jest.fn()
  const mockOnBack = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders first name, DOB, and language inputs', () => {
    const { getByLabelText, getByText } = render(
      <ProfileSetupScreen onComplete={mockOnComplete} onBack={mockOnBack} />,
    )

    expect(getByLabelText('registration.firstNameLabel')).toBeTruthy()
    expect(getByLabelText('registration.dobLabel')).toBeTruthy()
    expect(getByText('English')).toBeTruthy()
    expect(getByText('\u0627\u0644\u0639\u0631\u0628\u064A\u0629')).toBeTruthy()
    expect(getByText('\u062F\u0631\u06CC')).toBeTruthy()
  })

  it('disables continue when form is incomplete', () => {
    const { getByLabelText } = render(
      <ProfileSetupScreen onComplete={mockOnComplete} onBack={mockOnBack} />,
    )

    const continueButton = getByLabelText('registration.continue')
    expect(continueButton.props.accessibilityState?.disabled).toBeTruthy()
  })

  it('enables continue when name and DOB are valid', () => {
    const { getByLabelText } = render(
      <ProfileSetupScreen onComplete={mockOnComplete} onBack={mockOnBack} />,
    )

    fireEvent.changeText(getByLabelText('registration.firstNameLabel'), 'Ahmad')
    fireEvent.changeText(getByLabelText('registration.dobLabel'), '19900115')

    const continueButton = getByLabelText('registration.continue')
    expect(continueButton.props.accessibilityState?.disabled).toBeFalsy()
  })

  it('calls onComplete with profile data when submitted', () => {
    const { getByLabelText } = render(
      <ProfileSetupScreen onComplete={mockOnComplete} onBack={mockOnBack} />,
    )

    fireEvent.changeText(getByLabelText('registration.firstNameLabel'), 'Ahmad')
    fireEvent.changeText(getByLabelText('registration.dobLabel'), '19900115')
    fireEvent.press(getByLabelText('registration.continue'))

    expect(mockOnComplete).toHaveBeenCalledWith({
      firstName: 'Ahmad',
      dateOfBirth: '1990-01-15',
      preferredLanguage: 'en',
    })
  })

  it('calls onBack when back pressed', () => {
    const { getByText } = render(
      <ProfileSetupScreen onComplete={mockOnComplete} onBack={mockOnBack} />,
    )

    fireEvent.press(getByText(/common.back/))
    expect(mockOnBack).toHaveBeenCalled()
  })
})
