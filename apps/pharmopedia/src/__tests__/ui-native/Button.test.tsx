import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react-native'
import { UiKitProvider, Button } from '@ultranos/ui-kit/native'
import { flattenStyle } from './_flatten'

describe('Button', () => {
  it('renders the label and fires onPress', () => {
    const onPress = vi.fn()
    const { getByText, getByRole } = render(
      <UiKitProvider mode="light"><Button label="Sync now" onPress={onPress} /></UiKitProvider>,
    )
    expect(getByText('Sync now')).toBeTruthy()
    fireEvent.press(getByRole('button'))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('shows a spinner and hides the label while loading, and blocks press', () => {
    const onPress = vi.fn()
    const { queryByText, getByTestId, getByRole } = render(
      <UiKitProvider mode="light"><Button label="Sync now" loading onPress={onPress} /></UiKitProvider>,
    )
    expect(getByTestId('button-spinner')).toBeTruthy()
    expect(queryByText('Sync now')).toBeNull()
    fireEvent.press(getByRole('button'))
    expect(onPress).not.toHaveBeenCalled()
    expect(getByRole('button').props.accessibilityState).toEqual({ disabled: true, busy: true })
  })

  it('blocks press when disabled', () => {
    const onPress = vi.fn()
    const { getByRole } = render(
      <UiKitProvider mode="light"><Button label="Go" disabled onPress={onPress} /></UiKitProvider>,
    )
    fireEvent.press(getByRole('button'))
    expect(onPress).not.toHaveBeenCalled()
  })

  it('uses the primary brand colour for the primary variant', () => {
    const { getByRole } = render(
      <UiKitProvider mode="light"><Button label="Go" onPress={() => {}} /></UiKitProvider>,
    )
    expect(flattenStyle(getByRole('button').props.style).backgroundColor).toBe('#2e9e71')
  })
})
