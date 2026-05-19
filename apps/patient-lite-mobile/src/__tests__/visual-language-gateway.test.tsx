import { render, fireEvent } from '@testing-library/react-native'
import { VisualLanguageGateway } from '@/components/VisualLanguageGateway'

describe('VisualLanguageGateway', () => {
  const mockOnSelect = jest.fn()

  beforeEach(() => {
    mockOnSelect.mockClear()
  })

  it('renders three language buttons', () => {
    const { getByTestId } = render(
      <VisualLanguageGateway onSelect={mockOnSelect} />,
    )
    expect(getByTestId('language-button-en')).toBeTruthy()
    expect(getByTestId('language-button-ar')).toBeTruthy()
    expect(getByTestId('language-button-prs')).toBeTruthy()
  })

  it('shows language names in native scripts', () => {
    const { getByText } = render(
      <VisualLanguageGateway onSelect={mockOnSelect} />,
    )
    expect(getByText('English')).toBeTruthy()
    expect(getByText('العربية')).toBeTruthy()
    expect(getByText('دری')).toBeTruthy()
  })

  it('calls onSelect with locale code when button is pressed', () => {
    const { getByTestId } = render(
      <VisualLanguageGateway onSelect={mockOnSelect} />,
    )
    fireEvent.press(getByTestId('language-button-ar'))
    expect(mockOnSelect).toHaveBeenCalledWith('ar')
  })

  it('renders the gateway container', () => {
    const { getByTestId } = render(
      <VisualLanguageGateway onSelect={mockOnSelect} />,
    )
    expect(getByTestId('visual-language-gateway')).toBeTruthy()
  })

  it('buttons have minimum 80px height', () => {
    const { getByTestId } = render(
      <VisualLanguageGateway onSelect={mockOnSelect} />,
    )
    const button = getByTestId('language-button-en')
    const flatStyle = Array.isArray(button.props.style)
      ? Object.assign({}, ...button.props.style.flat().filter(Boolean))
      : button.props.style
    expect(flatStyle.minHeight).toBeGreaterThanOrEqual(80)
  })

  it('buttons have accessibilityRole="button"', () => {
    const { getByTestId } = render(
      <VisualLanguageGateway onSelect={mockOnSelect} />,
    )
    expect(getByTestId('language-button-en').props.accessibilityRole).toBe('button')
  })
})
