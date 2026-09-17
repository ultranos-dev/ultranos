// Mock for @ultranos/ui-kit/native/NumericText
// Used in jest tests where the native ui-kit subpath isn't available
const React = require('react')
const { Text } = require('react-native')

const NumericText = ({ children, style, ...props }) =>
  React.createElement(Text, { style, ...props }, children)

module.exports = { NumericText }
