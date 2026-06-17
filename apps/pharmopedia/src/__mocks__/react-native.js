/**
 * Minimal react-native mock for vitest (node environment).
 * @testing-library/react-native and our components import these primitives.
 */

const React = require('react')

function View({ children, style, testID, ...rest }) {
  return React.createElement('View', { style, testID, ...rest }, children)
}

function Text({ children, style, testID, ...rest }) {
  return React.createElement('Text', { style, testID, ...rest }, children)
}

function TextInput({ style, testID, placeholder, value, onChangeText, ...rest }) {
  return React.createElement('TextInput', {
    style,
    testID,
    placeholder,
    value,
    onChange: onChangeText ? (e) => onChangeText(e.target.value) : undefined,
    ...rest,
  })
}

function Pressable({ children, style, testID, onPress, ...rest }) {
  return React.createElement(
    'Pressable',
    { style: typeof style === 'function' ? style({ pressed: false }) : style, testID, onClick: onPress, ...rest },
    children
  )
}

function SafeAreaView({ children, style, testID, ...rest }) {
  return React.createElement('SafeAreaView', { style, testID, ...rest }, children)
}

function FlatList({ data, renderItem, keyExtractor, ListHeaderComponent, ListEmptyComponent, ...rest }) {
  const header = ListHeaderComponent ? React.createElement(React.Fragment, { key: '__header' }, ListHeaderComponent) : null
  const items = (data || []).map((item, index) => {
    const key = keyExtractor ? keyExtractor(item, index) : String(index)
    return React.createElement(React.Fragment, { key }, renderItem({ item, index }))
  })
  const empty = (!data || data.length === 0) && ListEmptyComponent
    ? React.createElement(React.Fragment, { key: '__empty' }, ListEmptyComponent)
    : null
  return React.createElement('FlatList', rest, header, ...items, empty)
}

const StyleSheet = {
  create: (styles) => styles,
  flatten: (style) => style,
  hairlineWidth: 1,
}

const Platform = {
  OS: 'ios',
  Version: 1,
  select: (obj) => obj.ios ?? obj.default,
}

const I18nManager = {
  allowRTL: () => {},
  forceRTL: () => {},
  isRTL: false,
}

const Animated = {
  Value: class Value {
    constructor(v) { this._value = v }
    setValue(v) { this._value = v }
    addListener() {}
    removeListener() {}
    interpolate() { return this }
  },
  View,
  Text,
  createAnimatedComponent: (C) => C,
  timing: () => ({ start: (cb) => cb && cb({ finished: true }), stop: () => {} }),
  spring: () => ({ start: (cb) => cb && cb({ finished: true }), stop: () => {} }),
  parallel: () => ({ start: (cb) => cb && cb({ finished: true }), stop: () => {} }),
  sequence: () => ({ start: (cb) => cb && cb({ finished: true }), stop: () => {} }),
  event: () => () => {},
  FlatList,
  ScrollView: View,
}

const Dimensions = {
  get: () => ({ width: 375, height: 812 }),
  addEventListener: () => ({ remove: () => {} }),
}

const AccessibilityInfo = {
  isScreenReaderEnabled: () => Promise.resolve(false),
  isReduceMotionEnabled: () => Promise.resolve(false),
  addEventListener: () => ({ remove: () => {} }),
  announceForAccessibility: () => {},
}

const Appearance = {
  getColorScheme: () => 'light',
  addChangeListener: () => ({ remove: () => {} }),
  setColorScheme: () => {},
}

module.exports = {
  Appearance,
  View,
  Text,
  TextInput,
  Pressable,
  SafeAreaView,
  FlatList,
  ScrollView: View,
  TouchableOpacity: Pressable,
  TouchableHighlight: Pressable,
  TouchableWithoutFeedback: Pressable,
  StyleSheet,
  Platform,
  I18nManager,
  Animated,
  Dimensions,
  AccessibilityInfo,
  Image: View,
  ImageBackground: View,
  Modal: function Modal({ children, visible, ...rest }) { return visible ? React.createElement('View', rest, children) : null },
  KeyboardAvoidingView: View,
  ActivityIndicator: View,
  Switch: View,
  Keyboard: { dismiss: () => {}, addListener: () => ({ remove: () => {} }) },
  NativeModules: {},
  NativeEventEmitter: class NativeEventEmitter {
    addListener() { return { remove: () => {} } }
    removeAllListeners() {}
  },
  Alert: { alert: () => {} },
  AppState: {
    currentState: 'active',
    addEventListener: () => ({ remove: () => {} }),
  },
  Linking: {
    openURL: () => Promise.resolve(),
    canOpenURL: () => Promise.resolve(true),
    addEventListener: () => ({ remove: () => {} }),
    getInitialURL: () => Promise.resolve(null),
  },
  PixelRatio: { get: () => 2, getFontScale: () => 1 },
  findNodeHandle: () => null,
  LogBox: { ignoreLogs: () => {}, ignoreAllLogs: () => {} },
  StatusBar: { setBarStyle: () => {}, setBackgroundColor: () => {} },
  useColorScheme: () => 'light',
  useWindowDimensions: () => ({ width: 375, height: 812 }),
  Share: {
    share: async (_content, _options) => ({ action: 'sharedAction', activityType: undefined }),
  },
  BackHandler: {
    addEventListener: (_event, _cb) => ({ remove: () => {} }),
    removeEventListener: () => {},
    exitApp: () => {},
  },
  RefreshControl: View,
}
