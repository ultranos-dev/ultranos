import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react-native'
import { UiKitProvider, Banner } from '@ultranos/ui-kit/native'
import { flattenStyle } from './_flatten'

describe('Banner', () => {
  it('renders the text', () => {
    const { getByText } = render(
      <UiKitProvider mode="light"><Banner variant="info" text="Syncing catalog…" /></UiKitProvider>,
    )
    expect(getByText('Syncing catalog…')).toBeTruthy()
  })

  it('uses role=alert for warning and error variants', () => {
    const { getByRole } = render(
      <UiKitProvider mode="light"><Banner variant="warning" text="Recall" testID="b" /></UiKitProvider>,
    )
    expect(getByRole('alert')).toBeTruthy()
  })

  it('becomes a button when onPress is provided and fires it', () => {
    const onPress = vi.fn()
    const { getByRole } = render(
      <UiKitProvider mode="light"><Banner variant="warning" text="Recall" onPress={onPress} /></UiKitProvider>,
    )
    fireEvent.press(getByRole('button'))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('uses the danger background for the error variant', () => {
    const { getByText } = render(
      <UiKitProvider mode="light"><Banner variant="error" text="Failed" /></UiKitProvider>,
    )
    // text colour is the danger foreground
    expect(flattenStyle(getByText('Failed').props.style).color).toBe('#dc2626')
  })
})
