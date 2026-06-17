import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react-native'
import { Globe } from 'lucide-react-native'
import { UiKitProvider, ListRow } from '@ultranos/ui-kit/native'
import { flattenStyle } from './_flatten'

describe('ListRow', () => {
  it('renders label and value', () => {
    const { getByText } = render(
      <UiKitProvider mode="light"><ListRow icon={Globe} label="Language" value="English" /></UiKitProvider>,
    )
    expect(getByText('Language')).toBeTruthy()
    expect(getByText('English')).toBeTruthy()
  })

  it('is a button with a composed label when pressable, and fires onPress', () => {
    const onPress = vi.fn()
    const { getByRole } = render(
      <UiKitProvider mode="light"><ListRow label="Language" value="English" onPress={onPress} /></UiKitProvider>,
    )
    const row = getByRole('button')
    expect(row.props.accessibilityLabel).toBe('Language, English')
    fireEvent.press(row)
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('is not a button when not pressable', () => {
    const { queryByRole } = render(
      <UiKitProvider mode="light"><ListRow label="Static" /></UiKitProvider>,
    )
    expect(queryByRole('button')).toBeNull()
  })

  it('colours the label with danger when destructive', () => {
    const { getByText } = render(
      <UiKitProvider mode="light"><ListRow label="Delete" destructive /></UiKitProvider>,
    )
    expect(flattenStyle(getByText('Delete').props.style).color).toBe('#dc2626')
  })

  it('uses the explicit accessibilityLabel prop when provided, overriding auto-derived label', () => {
    const onPress = vi.fn()
    const { getByRole } = render(
      <UiKitProvider mode="light">
        <ListRow label="Category" value="12 drugs" accessibilityLabel="Custom, 12 drugs" onPress={onPress} />
      </UiKitProvider>,
    )
    const row = getByRole('button')
    expect(row.props.accessibilityLabel).toBe('Custom, 12 drugs')
  })
})
