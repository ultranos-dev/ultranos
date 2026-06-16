import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react-native'
import { Text } from 'react-native'
import { UiKitProvider, CollapsibleList } from '@ultranos/ui-kit/native'

const items = [{ id: 'a', name: 'Amoxicillin' }, { id: 'b', name: 'Metformin' }]

describe('CollapsibleList', () => {
  it('renders the title and the list items', () => {
    const { getByText } = render(
      <UiKitProvider mode="light">
        <CollapsibleList
          title="Search"
          data={items}
          keyExtractor={(it) => it.id}
          renderItem={({ item }) => <Text>{item.name}</Text>}
        />
      </UiKitProvider>,
    )
    expect(getByText('Search')).toBeTruthy()
    expect(getByText('Amoxicillin')).toBeTruthy()
    expect(getByText('Metformin')).toBeTruthy()
  })

  it('renders the empty component when data is empty', () => {
    const { getByText, queryByText } = render(
      <UiKitProvider mode="light">
        <CollapsibleList
          title="Saved"
          data={[]}
          keyExtractor={(it: { id: string }) => it.id}
          renderItem={() => null}
          ListEmptyComponent={<Text>Nothing saved</Text>}
        />
      </UiKitProvider>,
    )
    expect(getByText('Nothing saved')).toBeTruthy()
    expect(queryByText('Amoxicillin')).toBeNull()
  })

  it('renders a subHeader when provided', () => {
    const { getByText } = render(
      <UiKitProvider mode="light">
        <CollapsibleList
          title="Search"
          subHeader={<Text>search-bar</Text>}
          data={[]}
          keyExtractor={(it: { id: string }) => it.id}
          renderItem={() => null}
        />
      </UiKitProvider>,
    )
    expect(getByText('search-bar')).toBeTruthy()
  })
})
