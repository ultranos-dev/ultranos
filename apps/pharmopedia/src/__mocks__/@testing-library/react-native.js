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

function queryByText(instance, text) {
  let found = null
  function search(node) {
    if (!node) return
    if (typeof node === 'string' && node === text) { found = node; return }
    if (node.children) node.children.forEach(search)
  }
  const json = instance.toJSON()
  function deepSearch(node) {
    if (!node) return
    if (node.children) {
      node.children.forEach(child => {
        if (typeof child === 'string' && child === text) { found = node; return }
        deepSearch(child)
      })
    }
  }
  deepSearch(json)
  return found
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
}

function render(element) {
  let instance
  // react-test-renderer requires act
  ReactTestRenderer.act(() => {
    instance = ReactTestRenderer.create(element)
  })
  _currentInstance = instance
  return { instance }
}

const fireEvent = {
  press: (element) => {
    if (element && element.props && element.props.onClick) {
      element.props.onClick()
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

module.exports = { render, screen, fireEvent }
