import { render } from '@testing-library/react-native'
import { ProgressBar, CompletionCheckmark, PulsingDots } from '@/components/VisualProgress'

describe('VisualProgress', () => {
  describe('ProgressBar', () => {
    it('renders with accessibilityRole="progressbar"', () => {
      const { getByTestId } = render(
        <ProgressBar progress={0.5} testID="progress" />,
      )
      expect(getByTestId('progress').props.accessibilityRole).toBe('progressbar')
    })

    it('reports progress value for accessibility', () => {
      const { getByTestId } = render(
        <ProgressBar progress={0.75} testID="progress" />,
      )
      const value = getByTestId('progress').props.accessibilityValue
      expect(value.now).toBe(75)
      expect(value.min).toBe(0)
      expect(value.max).toBe(100)
    })
  })

  describe('CompletionCheckmark', () => {
    it('renders checkmark emoji', () => {
      const { getByText } = render(
        <CompletionCheckmark testID="check" />,
      )
      expect(getByText('✅')).toBeTruthy()
    })

    it('has completion accessibility label', () => {
      const { getByTestId } = render(
        <CompletionCheckmark testID="check" />,
      )
      expect(getByTestId('check').props.accessibilityLabel).toBe('Complete')
    })
  })

  describe('PulsingDots', () => {
    it('renders three dots', () => {
      const { getByTestId } = render(
        <PulsingDots testID="dots" />,
      )
      const container = getByTestId('dots')
      expect(container.children).toHaveLength(3)
    })

    it('has in-progress accessibility label', () => {
      const { getByTestId } = render(
        <PulsingDots testID="dots" />,
      )
      expect(getByTestId('dots').props.accessibilityLabel).toBe('In progress')
    })
  })
})
