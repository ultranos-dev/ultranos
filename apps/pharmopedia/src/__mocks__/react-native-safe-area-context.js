/**
 * Minimal mock for react-native-safe-area-context in vitest (node environment).
 */

const React = require('react')

function SafeAreaView({ children, style, testID, edges: _edges }) {
  return React.createElement('SafeAreaView', { style, testID }, children)
}

function SafeAreaProvider({ children }) {
  return React.createElement('SafeAreaProvider', null, children)
}

function useSafeAreaInsets() {
  return { top: 0, bottom: 0, left: 0, right: 0 }
}

module.exports = {
  SafeAreaView,
  SafeAreaProvider,
  useSafeAreaInsets,
}
