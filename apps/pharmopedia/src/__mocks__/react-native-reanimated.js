/**
 * Minimal mock for react-native-reanimated in vitest (node environment).
 * Strips animation wrappers so component tests can render without native modules.
 *
 * CJS→ESM interop note: when vitest imports this via an alias (no __esModule flag),
 * `import Animated from 'react-native-reanimated'` resolves to the whole
 * module.exports object as the default. So Animated.View must be available
 * directly on module.exports.
 */

const React = require('react')

// Animation builder stub — all methods are no-ops that return themselves
const animationStub = new Proxy({}, {
  get: (_t, _k) => () => animationStub,
})

const FadeInUp = new Proxy({}, {
  get: (_t, _k) => () => animationStub,
})

const FadeOutDown = new Proxy({}, {
  get: (_t, _k) => () => animationStub,
})

const FadeInDown = new Proxy({}, {
  get: (_t, _k) => () => animationStub,
})

const FadeOutUp = new Proxy({}, {
  get: (_t, _k) => () => animationStub,
})

const Easing = {
  linear: (t) => t,
  ease: (t) => t,
  quad: (t) => t,
  cubic: (t) => t,
  inOut: () => (t) => t,
  in: () => (t) => t,
  out: () => (t) => t,
  poly: () => (t) => t,
  sin: (t) => t,
  circle: (t) => t,
  exp: (t) => t,
  elastic: () => (t) => t,
  back: () => (t) => t,
  bounce: (t) => t,
  bezier: () => (t) => t,
  bezierFn: () => (t) => t,
  steps: () => (t) => t,
}

const withRepeat = (_anim, _n, _reverse) => _anim

// Animated components — passthrough wrappers that drop animation props
function AnimatedView({ children, style, testID, entering: _entering, exiting: _exiting, ...rest }) {
  return React.createElement('View', { style, testID, ...rest }, children)
}

function AnimatedText({ children, style, testID, entering: _entering, exiting: _exiting, ...rest }) {
  return React.createElement('Text', { style, testID, ...rest }, children)
}

function AnimatedScrollView({ children, style, testID, entering: _entering, exiting: _exiting, ...rest }) {
  return React.createElement('View', { style, testID, ...rest }, children)
}

// Helper hooks
const useAnimatedStyle = () => ({})
const useSharedValue = (v) => ({ value: v })
const withTiming = (v) => v
const withSpring = (v) => v
const withDelay = (_delay, anim) => anim
const runOnJS = (fn) => fn
const interpolate = (v, _input, output) => output[0]
const Extrapolation = { CLAMP: 'clamp' }

// Expose Animated.* members directly on module.exports so that
// `import Animated from 'react-native-reanimated'` → Animated.View works
// regardless of whether vitest uses __esModule default or whole-module-as-default.
// FadeIn animation stub (used by CoachMark component)
const FadeIn = new Proxy({}, {
  get: (_t, _k) => () => animationStub,
})

module.exports = {
  // Named exports
  FadeIn,
  FadeInUp,
  FadeOutDown,
  FadeInDown,
  FadeOutUp,
  Easing,
  withRepeat,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withSpring,
  withDelay,
  runOnJS,
  interpolate,
  Extrapolation,

  // Animated.* surface — available both via `Animated.View` and directly
  View: AnimatedView,
  Text: AnimatedText,
  ScrollView: AnimatedScrollView,
  Image: AnimatedView,
  createAnimatedComponent: (Component) => Component,
}

// Also set default for consumers that explicitly destructure `default`
module.exports.default = module.exports
