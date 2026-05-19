// Mock for @react-navigation/native-stack
module.exports = {
  createNativeStackNavigator: () => ({
    Navigator: ({ children }) => children,
    Screen: () => null,
  }),
}
