// Mock for @ultranos/ui-kit/native/NumericText
// Renders a plain Text so tests can assert on numeric content without
// triggering the StyleSheet.create → NativeModules → __fbBatchedBridgeConfig chain
const React = require('react')
const { Text } = require('react-native')

function NumericText({ children, bold, style, ...rest }) {
  return React.createElement(Text, { ...rest, style }, children)
}

module.exports = { NumericText }
