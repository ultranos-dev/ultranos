import { describe, it, expect } from 'vitest'

describe('opd-lite smoke test', () => {
  it('should confirm the test environment is working', () => {
    expect(1 + 1).toBe(2)
  })

  it('should have access to DOM APIs (jsdom)', () => {
    const div = document.createElement('div')
    div.textContent = 'OPD Lite'
    expect(div.textContent).toBe('OPD Lite')
  })
})
