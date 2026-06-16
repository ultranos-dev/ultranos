import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react-native'
import { Bookmark } from 'lucide-react-native'
import { UiKitProvider, EmptyState } from '@ultranos/ui-kit/native'

describe('EmptyState', () => {
  it('renders title and description', () => {
    const { getByText } = render(
      <UiKitProvider mode="light">
        <EmptyState icon={Bookmark} title="No saved medicines" description="Bookmark drugs to find them fast." />
      </UiKitProvider>,
    )
    expect(getByText('No saved medicines')).toBeTruthy()
    expect(getByText('Bookmark drugs to find them fast.')).toBeTruthy()
  })

  it('renders an action button and fires its onPress', () => {
    const onPress = vi.fn()
    const { getByText, getByRole } = render(
      <UiKitProvider mode="light">
        <EmptyState icon={Bookmark} title="Empty" action={{ label: 'Browse', onPress }} />
      </UiKitProvider>,
    )
    expect(getByText('Browse')).toBeTruthy()
    fireEvent.press(getByRole('button'))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('renders no button when there is no action', () => {
    const { queryByRole } = render(
      <UiKitProvider mode="light"><EmptyState icon={Bookmark} title="Empty" /></UiKitProvider>,
    )
    expect(queryByRole('button')).toBeNull()
  })
})
