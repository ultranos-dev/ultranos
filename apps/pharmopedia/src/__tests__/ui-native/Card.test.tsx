import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react-native'
import { Text } from 'react-native'
import { UiKitProvider, Card, CardSection } from '@ultranos/ui-kit/native'
import { flattenStyle } from './_flatten'

function countTestId(node: unknown, testID: string): number {
  if (!node || typeof node !== 'object') return 0
  const n = node as { props?: { testID?: string }; children?: unknown[] }
  let count = n.props?.testID === testID ? 1 : 0
  if (Array.isArray(n.children)) for (const c of n.children) count += countTestId(c, testID)
  return count
}

describe('Card / CardSection', () => {
  it('renders children with the surface background', () => {
    const { getByText, getByTestId } = render(
      <UiKitProvider mode="light"><Card testID="card"><Text>body</Text></Card></UiKitProvider>,
    )
    expect(getByText('body')).toBeTruthy()
    expect(flattenStyle(getByTestId('card').props.style).backgroundColor).toBe('#ffffff')
  })

  it('uses the dark surface background in dark mode', () => {
    const { getByTestId } = render(
      <UiKitProvider mode="dark"><Card testID="card"><Text>body</Text></Card></UiKitProvider>,
    )
    expect(flattenStyle(getByTestId('card').props.style).backgroundColor).toBe('#121212')
  })

  it('renders an optional section label and its children', () => {
    const { getByText } = render(
      <UiKitProvider mode="light">
        <CardSection label="PREFERENCES">
          <Text>row 1</Text>
          <Text>row 2</Text>
        </CardSection>
      </UiKitProvider>,
    )
    expect(getByText('PREFERENCES')).toBeTruthy()
    expect(getByText('row 1')).toBeTruthy()
    expect(getByText('row 2')).toBeTruthy()
  })

  it('inserts a divider between rows but not before the first', () => {
    const { toJSON } = render(
      <UiKitProvider mode="light">
        <CardSection>
          <Text>row 1</Text>
          <Text>row 2</Text>
          <Text>row 3</Text>
        </CardSection>
      </UiKitProvider>,
    )
    expect(countTestId(toJSON(), 'card-divider')).toBe(2)
  })
})
