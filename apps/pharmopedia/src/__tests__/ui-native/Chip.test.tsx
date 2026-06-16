import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react-native'
import { UiKitProvider, Chip } from '@ultranos/ui-kit/native'
import { flattenStyle } from './_flatten'

describe('Chip', () => {
  it('renders the label and fires onPress', () => {
    const onPress = vi.fn()
    const { getByText, getByRole } = render(
      <UiKitProvider mode="light"><Chip label="EN" onPress={onPress} /></UiKitProvider>,
    )
    expect(getByText('EN')).toBeTruthy()
    fireEvent.press(getByRole('button'))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('reflects selected state in accessibilityState and background', () => {
    const { getByRole } = render(
      <UiKitProvider mode="light"><Chip label="EN" selected onPress={() => {}} /></UiKitProvider>,
    )
    const chip = getByRole('button')
    expect(chip.props.accessibilityState).toEqual({ selected: true })
    expect(flattenStyle(chip.props.style).backgroundColor).toBe('#2e9e71')
  })

  it('is not selected by default', () => {
    const { getByRole } = render(
      <UiKitProvider mode="light"><Chip label="EN" onPress={() => {}} /></UiKitProvider>,
    )
    expect(getByRole('button').props.accessibilityState).toEqual({ selected: false })
  })
})
