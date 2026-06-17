import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockSelection } = vi.hoisted(() => ({ mockSelection: vi.fn() }))
vi.mock('@/lib/haptics', () => ({ hapticSelection: mockSelection }))

import { render, screen, fireEvent } from '@testing-library/react-native'
import { Text } from 'react-native'
import { Home } from 'lucide-react-native'
import { TabBarButton } from '@/components/TabBarButton'
import { AnimatedTabIcon } from '@/components/AnimatedTabIcon'

beforeEach(() => { vi.clearAllMocks() })

describe('TabBarButton', () => {
  it('forwards onPress and fires a selection haptic when switching to another tab', () => {
    const onPress = vi.fn()
    render(
      <TabBarButton testID="tab-btn" onPress={onPress} accessibilityState={{ selected: false }}>
        <Text>Home</Text>
      </TabBarButton>,
    )
    fireEvent.press(screen.getByTestId('tab-btn'))
    expect(onPress).toHaveBeenCalledTimes(1)
    expect(mockSelection).toHaveBeenCalledTimes(1)
  })

  it('does not fire a haptic when re-pressing the already-active tab', () => {
    render(
      <TabBarButton testID="tab-btn" onPress={vi.fn()} accessibilityState={{ selected: true }}>
        <Text>Home</Text>
      </TabBarButton>,
    )
    fireEvent.press(screen.getByTestId('tab-btn'))
    expect(mockSelection).not.toHaveBeenCalled()
  })

  it('renders the navigator-supplied children (icon + label)', () => {
    render(
      <TabBarButton testID="tab-btn">
        <Text>Saved</Text>
      </TabBarButton>,
    )
    expect(screen.getByText('Saved')).toBeTruthy()
  })
})

describe('AnimatedTabIcon', () => {
  it('renders the icon (which glides into place) in both states', () => {
    const { getByTestId, rerender } = render(
      <AnimatedTabIcon icon={Home} color="#000" size={24} focused={false} />,
    )
    expect(getByTestId('icon-Home')).toBeTruthy()

    rerender(<AnimatedTabIcon icon={Home} color="#2e9e71" size={24} focused />)
    expect(getByTestId('icon-Home')).toBeTruthy()
  })
})
