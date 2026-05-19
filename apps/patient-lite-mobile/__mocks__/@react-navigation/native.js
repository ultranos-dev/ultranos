// Mock for @react-navigation/native
const jest_fn = typeof jest !== 'undefined' ? jest.fn : () => () => {}

module.exports = {
  useNavigation: () => ({
    navigate: jest_fn(),
    goBack: jest_fn(),
    getParent: () => ({ navigate: jest_fn() }),
  }),
  useRoute: () => ({ params: {} }),
  useFocusEffect: jest_fn(),
  NavigationContainer: ({ children }) => children,
  useIsFocused: () => true,
}
