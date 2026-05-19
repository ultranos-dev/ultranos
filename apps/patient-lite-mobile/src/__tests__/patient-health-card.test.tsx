import { render, fireEvent } from '@testing-library/react-native'
import { PatientHealthCard } from '@/components/PatientHealthCard'

describe('PatientHealthCard', () => {
  it('renders allergy variant with red background', () => {
    const { getByTestId } = render(
      <PatientHealthCard
        variant="allergy"
        title="Penicillin"
        testID="allergy-card"
      />,
    )
    const card = getByTestId('allergy-card')
    // Card should render with the allergy background color
    const flatStyle = Array.isArray(card.props.style)
      ? Object.assign({}, ...card.props.style.flat())
      : card.props.style
    expect(flatStyle.backgroundColor).toBe('#FEE2E2')
  })

  it('renders medication variant with blue background', () => {
    const { getByTestId } = render(
      <PatientHealthCard
        variant="medication"
        title="Amoxicillin 500mg"
        subtitle="Twice daily"
        testID="med-card"
      />,
    )
    const card = getByTestId('med-card')
    const flatStyle = Array.isArray(card.props.style)
      ? Object.assign({}, ...card.props.style.flat())
      : card.props.style
    expect(flatStyle.backgroundColor).toBe('#DBEAFE')
  })

  it('renders consent variant with green background', () => {
    const { getByTestId } = render(
      <PatientHealthCard
        variant="consent"
        title="Data Sharing"
        subtitle="Active"
        testID="consent-card"
      />,
    )
    const card = getByTestId('consent-card')
    const flatStyle = Array.isArray(card.props.style)
      ? Object.assign({}, ...card.props.style.flat())
      : card.props.style
    expect(flatStyle.backgroundColor).toBe('#D1FAE5')
  })

  it('shows title and subtitle text', () => {
    const { getByText } = render(
      <PatientHealthCard
        variant="medication"
        title="Amoxicillin"
        subtitle="500mg"
      />,
    )
    expect(getByText('Amoxicillin')).toBeTruthy()
    expect(getByText('500mg')).toBeTruthy()
  })

  it('is tappable when onPress provided', () => {
    const mockPress = jest.fn()
    const { getByTestId } = render(
      <PatientHealthCard
        variant="allergy"
        title="Latex"
        onPress={mockPress}
        testID="tap-card"
      />,
    )
    // The card itself is wrapped in a Pressable
    fireEvent.press(getByTestId('tap-card'))
    expect(mockPress).toHaveBeenCalledTimes(1)
  })

  it('has correct accessibility label combining icon label and title', () => {
    const { getByTestId } = render(
      <PatientHealthCard
        variant="allergy"
        title="Sulfa"
        testID="a11y-card"
      />,
    )
    const card = getByTestId('a11y-card')
    expect(card.props.accessibilityLabel).toContain('Sulfa')
  })

  it('renders with minimum 72px height', () => {
    const { getByTestId } = render(
      <PatientHealthCard
        variant="medication"
        title="Test"
        testID="height-card"
      />,
    )
    const card = getByTestId('height-card')
    const flatStyle = Array.isArray(card.props.style)
      ? Object.assign({}, ...card.props.style.flat())
      : card.props.style
    expect(flatStyle.minHeight).toBeGreaterThanOrEqual(72)
  })
})
