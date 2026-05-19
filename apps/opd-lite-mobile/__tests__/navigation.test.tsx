import { render } from '@testing-library/react-native'
import { NavigationContainer } from '@react-navigation/native'

// Mock the stack navigator
jest.mock('@react-navigation/native-stack', () => {
  const { View, Text } = require('react-native')
  return {
    createNativeStackNavigator: () => ({
      Navigator: ({ children, ...props }: any) => <View testID="stack-navigator">{children}</View>,
      Screen: ({ name, component: Component, ...props }: any) => (
        <View testID={`screen-${name}`}>
          <Text>{name}</Text>
        </View>
      ),
    }),
  }
})

import { RootNavigator } from '../src/navigation/RootNavigator'

describe('RootNavigator', () => {
  it('renders the stack navigator', () => {
    const { getByTestId } = render(
      <NavigationContainer>
        <RootNavigator />
      </NavigationContainer>
    )
    expect(getByTestId('stack-navigator')).toBeTruthy()
  })

  it('has PatientSearch screen', () => {
    const { getByTestId } = render(
      <NavigationContainer>
        <RootNavigator />
      </NavigationContainer>
    )
    expect(getByTestId('screen-PatientSearch')).toBeTruthy()
  })

  it('has PatientSummary screen', () => {
    const { getByTestId } = render(
      <NavigationContainer>
        <RootNavigator />
      </NavigationContainer>
    )
    expect(getByTestId('screen-PatientSummary')).toBeTruthy()
  })
})
