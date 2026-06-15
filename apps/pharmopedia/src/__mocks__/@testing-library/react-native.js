/**
 * Lightweight mock of @testing-library/react-native for vitest (node env).
 * Provides render/screen/fireEvent without importing the actual package,
 * which ships TypeScript source maps that vitest tries to resolve.
 */

const React = require('react')
const ReactTestRenderer = require('react-test-renderer')

// Normalize a react-test-renderer JSON node so that .props.children reflects
// the text content of the node (mirroring what @testing-library/react-native
// exposes on its wrapper elements).
function normalizeNode(node) {
  if (!node || typeof node !== 'object') return node
  const children = node.children
  let propsChildren
  if (children === null || children === undefined) {
    propsChildren = undefined
  } else if (children.length === 1) {
    propsChildren = children[0]
  } else {
    propsChildren = children
  }
  return {
    ...node,
    props: { ...node.props, children: propsChildren },
  }
}

// Minimal query helpers
function queryByTestId(instance, testID) {
  let found = null
  function search(node) {
    if (!node) return
    if (node.props && node.props.testID === testID) { found = node; return }
    if (node.children) node.children.forEach(search)
  }
  search(instance.toJSON())
  return found ? normalizeNode(found) : null
}

function matchesText(child, text) {
  if (typeof child !== 'string') return false
  if (text instanceof RegExp) return text.test(child)
  return child === text
}

function collectLeafText(node) {
  if (!node) return ''
  if (typeof node === 'string') return node
  if (!node.children) return ''
  return node.children.map(collectLeafText).join('')
}

function queryByText(instance, text) {
  let found = null
  const json = instance.toJSON()
  function deepSearch(node) {
    if (!node || found) return
    if (node.children) {
      // Check if this node's full leaf text matches
      const fullText = collectLeafText(node)
      if (fullText && (text instanceof RegExp ? text.test(fullText) : fullText === text)) {
        // Prefer the closest matching leaf node
        const isLeafMatch = node.children.some(child => matchesText(child, text))
        if (isLeafMatch) {
          found = node
          return
        }
        // For regex, also accept if any child string matches
        if (text instanceof RegExp) {
          const directStringMatch = node.children.some(child => typeof child === 'string' && text.test(child))
          if (directStringMatch) { found = node; return }
        }
      }
      // Recurse into children
      node.children.forEach(child => {
        if (typeof child === 'string') {
          if (matchesText(child, text)) { if (!found) found = node }
        } else {
          deepSearch(child)
        }
      })
      // Fallback: if regex and full concatenated text matches, use this node
      if (!found && text instanceof RegExp && text.test(fullText)) {
        found = node
      }
    }
  }
  deepSearch(json)
  return found
}

function queryByRole(instance, role) {
  let found = null
  function search(node) {
    if (!node) return
    if (node.props && node.props.accessibilityRole === role) { found = node; return }
    if (node.children) node.children.forEach(search)
  }
  const json = instance.toJSON()
  // toJSON may return an array for fragments
  if (Array.isArray(json)) {
    json.forEach(search)
  } else {
    search(json)
  }
  return found ? normalizeNode(found) : null
}

function queryByLabelText(instance, label) {
  let found = null
  function search(node) {
    if (!node) return
    if (node.props && node.props.accessibilityLabel === label) { found = node; return }
    if (node.children) node.children.forEach(search)
  }
  const json = instance.toJSON()
  search(json)
  return found ? normalizeNode(found) : null
}

function queryByPlaceholderText(instance, placeholder) {
  let found = null
  function search(node) {
    if (!node) return
    if (node.props && node.props.placeholder === placeholder) { found = node; return }
    if (node.children) node.children.forEach(search)
  }
  const json = instance.toJSON()
  search(json)
  return found
}

let _currentInstance = null

const screen = {
  getByTestId: (testID) => {
    const result = queryByTestId(_currentInstance, testID)
    if (!result) throw new Error(`Unable to find an element with testID: ${testID}`)
    return result
  },
  getByText: (text) => {
    const result = queryByText(_currentInstance, text)
    if (!result) throw new Error(`Unable to find an element with text: ${text}`)
    return result
  },
  getByPlaceholderText: (placeholder) => {
    const result = queryByPlaceholderText(_currentInstance, placeholder)
    if (!result) throw new Error(`Unable to find an element with placeholder: ${placeholder}`)
    return result
  },
  queryByTestId: (testID) => queryByTestId(_currentInstance, testID),
  queryByText: (text) => queryByText(_currentInstance, text),
  getByLabelText: (label) => {
    const result = queryByLabelText(_currentInstance, label)
    if (!result) throw new Error(`Unable to find an element with accessibilityLabel: ${label}`)
    return result
  },
  queryByLabelText: (label) => queryByLabelText(_currentInstance, label),
  getByRole: (role) => {
    const result = queryByRole(_currentInstance, role)
    if (!result) throw new Error(`Unable to find an element with role: ${role}`)
    return result
  },
  queryByRole: (role) => queryByRole(_currentInstance, role),
}

function render(element) {
  let instance
  // react-test-renderer requires act
  ReactTestRenderer.act(() => {
    instance = ReactTestRenderer.create(element)
  })
  _currentInstance = instance
  return {
    instance,
    toJSON: () => instance.toJSON(),
    getByTestId: (testID) => {
      const result = queryByTestId(instance, testID)
      if (!result) throw new Error(`Unable to find an element with testID: ${testID}`)
      return result
    },
    queryByTestId: (testID) => queryByTestId(instance, testID),
    getByText: (text) => {
      const result = queryByText(instance, text)
      if (!result) throw new Error(`Unable to find an element with text: ${text}`)
      return result
    },
    queryByText: (text) => queryByText(instance, text),
    getByLabelText: (label) => {
      const result = queryByLabelText(instance, label)
      if (!result) throw new Error(`Unable to find an element with accessibilityLabel: ${label}`)
      return result
    },
    queryByLabelText: (label) => queryByLabelText(instance, label),
    getByRole: (role) => {
      const result = queryByRole(instance, role)
      if (!result) throw new Error(`Unable to find an element with role: ${role}`)
      return result
    },
    queryByRole: (role) => queryByRole(instance, role),
  }
}

const fireEvent = {
  press: (element) => {
    if (element && element.props) {
      if (element.props.onPress) element.props.onPress()
      else if (element.props.onClick) element.props.onClick()
    }
  },
  changeText: (element, text) => {
    if (element && element.props && element.props.onChange) {
      element.props.onChange({ target: { value: text }, nativeEvent: { text } })
    }
    if (element && element.props && element.props.onChangeText) {
      element.props.onChangeText(text)
    }
  },
}

/**
 * waitFor — polls the callback until it stops throwing or the timeout expires.
 * Wraps each retry in ReactTestRenderer.act so that async state updates
 * (from resolved promises in useEffect) are flushed before the callback runs.
 */
async function waitFor(callback, { timeout = 1000, interval = 50 } = {}) {
  const start = Date.now()
  let lastError
  while (Date.now() - start < timeout) {
    // Flush pending React state updates and effects
    await ReactTestRenderer.act(async () => {
      await new Promise((resolve) => setTimeout(resolve, interval))
    })
    try {
      return callback()
    } catch (err) {
      lastError = err
    }
  }
  throw lastError
}

/**
 * act — thin wrapper around ReactTestRenderer.act so that async state
 * updates (resolved promises, useEffect callbacks) are flushed before
 * assertions run.
 */
async function act(callback) {
  await ReactTestRenderer.act(async () => {
    await callback()
  })
}

/**
 * renderHook — renders a hook inside a minimal wrapper component and
 * exposes the hook's return value via `result.current`.
 */
function renderHook(renderCallback) {
  let hookResult
  function TestComponent() {
    hookResult = renderCallback()
    return null
  }
  ReactTestRenderer.act(() => {
    ReactTestRenderer.create(React.createElement(TestComponent))
  })
  return {
    get result() {
      return { get current() { return hookResult } }
    },
  }
}

module.exports = { render, screen, fireEvent, waitFor, act, renderHook }
