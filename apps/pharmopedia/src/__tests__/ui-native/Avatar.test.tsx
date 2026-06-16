import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react-native'
import { UiKitProvider, Avatar } from '@ultranos/ui-kit/native'

describe('Avatar', () => {
  it('shows two-letter initials from a full name', () => {
    const { getByText } = render(
      <UiKitProvider mode="light"><Avatar name="Sara Ahmadi" /></UiKitProvider>,
    )
    expect(getByText('SA')).toBeTruthy()
  })

  it('shows the first two letters for a single-word name', () => {
    const { getByText } = render(
      <UiKitProvider mode="light"><Avatar name="Pharmacist" /></UiKitProvider>,
    )
    expect(getByText('PH')).toBeTruthy()
  })

  it('renders an image when photoUri is provided', () => {
    const { getByTestId } = render(
      <UiKitProvider mode="light"><Avatar name="Sara" photoUri="https://x/y.png" /></UiKitProvider>,
    )
    expect(getByTestId('avatar-image')).toBeTruthy()
  })

  it('exposes the name as an accessibility label', () => {
    const { getByLabelText } = render(
      <UiKitProvider mode="light"><Avatar name="Sara Ahmadi" /></UiKitProvider>,
    )
    expect(getByLabelText('Sara Ahmadi')).toBeTruthy()
  })

  it('falls back to a person glyph when there is no name', () => {
    const { getByTestId } = render(
      <UiKitProvider mode="light"><Avatar /></UiKitProvider>,
    )
    expect(getByTestId('icon-User')).toBeTruthy()
  })
})
