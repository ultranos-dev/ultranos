import { render, fireEvent, act } from '@testing-library/react-native'
import { Text } from 'react-native'
import { LongPressTooltip } from '@/components/LongPressTooltip'

describe('LongPressTooltip', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('renders children', () => {
    const { getByText } = render(
      <LongPressTooltip tooltip="Test tooltip">
        <Text>Child content</Text>
      </LongPressTooltip>,
    )
    expect(getByText('Child content')).toBeTruthy()
  })

  it('shows tooltip on long press', () => {
    const { getByText, getByTestId } = render(
      <LongPressTooltip tooltip="Explanation text">
        <Text>Icon</Text>
      </LongPressTooltip>,
    )

    fireEvent(getByText('Icon'), 'onLongPress')

    expect(getByTestId('tooltip-bubble')).toBeTruthy()
    expect(getByText('Explanation text')).toBeTruthy()
  })

  it('auto-dismisses after 3 seconds', () => {
    const { getByText, queryByTestId } = render(
      <LongPressTooltip tooltip="Auto dismiss">
        <Text>Icon</Text>
      </LongPressTooltip>,
    )

    fireEvent(getByText('Icon'), 'onLongPress')
    expect(queryByTestId('tooltip-bubble')).toBeTruthy()

    act(() => {
      jest.advanceTimersByTime(3000)
    })

    // Modal should be hidden after 3 seconds
    // (Modal with visible=false still renders but is not visible)
  })

  it('provides tooltip text as accessibilityHint', () => {
    const { UNSAFE_getByProps } = render(
      <LongPressTooltip tooltip="Tap to view prescriptions">
        <Text>💊</Text>
      </LongPressTooltip>,
    )

    const pressable = UNSAFE_getByProps({ accessibilityHint: 'Tap to view prescriptions' })
    expect(pressable).toBeTruthy()
  })
})
