import { describe, it, expect } from 'vitest'
import { PACKAGE_NAME } from '../index.js'

describe('@ultranos/drug-catalog-sync', () => {
  it('exposes its package name', () => {
    expect(PACKAGE_NAME).toBe('@ultranos/drug-catalog-sync')
  })
})
