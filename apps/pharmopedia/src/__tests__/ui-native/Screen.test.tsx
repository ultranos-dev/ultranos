import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react-native'
import { Text } from 'react-native'
import { UiKitProvider, Screen } from '@ultranos/ui-kit/native'
import { flattenStyle } from './_flatten'

// react-native-safe-area-context is mocked globally via the vitest alias
// (apps/pharmopedia/src/__mocks__/react-native-safe-area-context.js).

describe('Screen', () => {
  it('renders children', () => {
    const { getByText } = render(
      <UiKitProvider mode="light"><Screen><Text>hello</Text></Screen></UiKitProvider>,
    )
    expect(getByText('hello')).toBeTruthy()
  })

  it('uses the dark subtle surface background in dark mode', () => {
    const { getByTestId } = render(
      <UiKitProvider mode="dark"><Screen testID="screen"><Text>x</Text></Screen></UiKitProvider>,
    )
    expect(flattenStyle(getByTestId('screen').props.style).backgroundColor).toBe('#2a2a2a')
  })
})
