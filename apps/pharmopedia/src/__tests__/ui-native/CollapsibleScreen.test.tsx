import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react-native'
import { Text } from 'react-native'
import { UiKitProvider, CollapsibleScreen } from '@ultranos/ui-kit/native'

describe('CollapsibleScreen', () => {
  it('renders the title and children', () => {
    const { getByText } = render(
      <UiKitProvider mode="light">
        <CollapsibleScreen title="Profile"><Text>body content</Text></CollapsibleScreen>
      </UiKitProvider>,
    )
    expect(getByText('Profile')).toBeTruthy()
    expect(getByText('body content')).toBeTruthy()
  })

  it('renders a subtitle when provided', () => {
    const { getByText } = render(
      <UiKitProvider mode="light">
        <CollapsibleScreen title="Profile" subtitle="Pharmacist"><Text>x</Text></CollapsibleScreen>
      </UiKitProvider>,
    )
    expect(getByText('Pharmacist')).toBeTruthy()
  })
})
