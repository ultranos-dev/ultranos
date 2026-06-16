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
  const json = instance.toJSON()
  if (Array.isArray(json)) {
    json.forEach(search)
  } else {
    search(json)
  }
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
  // closestInteractive: the nearest ancestor (including self) that has onClick/onPress.
  // Passed down the recursion so that when we find a text match on a non-interactive leaf
  // we can return the interactive ancestor — mirroring how real RNTL surfaces pressable
  // parents when pressing on a Text node inside a Pressable.
  function deepSearch(node, closestInteractive) {
    if (!node || found) return
    const isSelf = node.props && (node.props.onClick || node.props.onPress)
    const nextInteractive = isSelf ? node : closestInteractive
    if (node.children) {
      // Check if this node's full leaf text matches
      const fullText = collectLeafText(node)
      if (fullText && (text instanceof RegExp ? text.test(fullText) : fullText === text)) {
        // Prefer the closest matching leaf node
        const isLeafMatch = node.children.some(child => matchesText(child, text))
        if (isLeafMatch) {
          // Return the interactive ancestor if the matched node itself isn't interactive
          found = isSelf ? node : (nextInteractive ?? node)
          return
        }
        // For regex, also accept if any child string matches
        if (text instanceof RegExp) {
          const directStringMatch = node.children.some(child => typeof child === 'string' && text.test(child))
          if (directStringMatch) { found = isSelf ? node : (nextInteractive ?? node); return }
        }
      }
      // Recurse into children
      node.children.forEach(child => {
        if (typeof child === 'string') {
          if (matchesText(child, text)) { if (!found) found = nextInteractive ?? node }
        } else {
          deepSearch(child, nextInteractive)
        }
      })
      // Fallback: if regex and full concatenated text matches, use this node
      if (!found && text instanceof RegExp && text.test(fullText)) {
        found = isSelf ? node : (nextInteractive ?? node)
      }
    }
  }
  if (Array.isArray(json)) {
    json.forEach((n) => deepSearch(n, null))
  } else {
    deepSearch(json, null)
  }
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
let _parentMap = new WeakMap()

/**
 * Build a WeakMap from each node to its parent so that fireEvent.press can
 * bubble up the tree when the directly-matched node has no handler — mirroring
 * how the real @testing-library/react-native handles press events on Text nodes
 * that live inside a Pressable.
 */
function buildParentMap(node, parent = null) {
  if (!node || typeof node !== 'object') return
  if (parent) _parentMap.set(node, parent)
  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      if (child && typeof child === 'object') buildParentMap(child, node)
    }
  }
}

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
  _parentMap = new WeakMap()
  const json = instance.toJSON()
  if (Array.isArray(json)) { json.forEach((n) => buildParentMap(n, null)) } else { buildParentMap(json, null) }

  async function findByTestId(testID, { timeout = 1000, interval = 50 } = {}) {
    const start = Date.now()
    let lastError
    while (Date.now() - start < timeout) {
      await ReactTestRenderer.act(async () => {
        await new Promise((resolve) => setTimeout(resolve, interval))
      })
      const result = queryByTestId(instance, testID)
      if (result) return result
      lastError = new Error(`Unable to find an element with testID: ${testID}`)
    }
    throw lastError
  }

  async function findByText(text, { timeout = 1000, interval = 50 } = {}) {
    const start = Date.now()
    let lastError
    while (Date.now() - start < timeout) {
      await ReactTestRenderer.act(async () => {
        await new Promise((resolve) => setTimeout(resolve, interval))
      })
      const result = queryByText(instance, text)
      if (result) return result
      lastError = new Error(`Unable to find an element with text: ${text}`)
    }
    throw lastError
  }

  function rerender(nextElement) {
    ReactTestRenderer.act(() => {
      instance.update(nextElement)
    })
    _currentInstance = instance
    _parentMap = new WeakMap()
    const newJson = instance.toJSON()
    if (Array.isArray(newJson)) { newJson.forEach((n) => buildParentMap(n, null)) } else { buildParentMap(newJson, null) }
  }

  return {
    instance,
    rerender,
    toJSON: () => instance.toJSON(),
    getByTestId: (testID) => {
      const result = queryByTestId(instance, testID)
      if (!result) throw new Error(`Unable to find an element with testID: ${testID}`)
      return result
    },
    queryByTestId: (testID) => queryByTestId(instance, testID),
    findByTestId,
    getByText: (text) => {
      const result = queryByText(instance, text)
      if (!result) throw new Error(`Unable to find an element with text: ${text}`)
      return result
    },
    queryByText: (text) => queryByText(instance, text),
    findByText,
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
    // Walk up the ancestor chain to find the nearest node with onPress/onClick,
    // mirroring how real RNTL bubbles press events up through the tree.
    let node = element
    while (node && node.props) {
      if (node.props.onPress) { node.props.onPress(); return }
      if (node.props.onClick) { node.props.onClick(); return }
      node = _parentMap.get(node) ?? null
    }
    // No handler up the chain: no-op. This mirrors a disabled Pressable (whose
    // onPress is undefined) — real RNTL also fires nothing in that case, which
    // the "blocks press when disabled" Button tests rely on.
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
