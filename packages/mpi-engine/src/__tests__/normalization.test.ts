import { describe, it, expect } from 'vitest'
import type { MpiDecision, MpiInput } from '../types.js'

describe('mpi-engine types', () => {
  it('MpiDecision has BLOCK WARN ALLOW values', () => {
    const decisions: MpiDecision[] = ['BLOCK', 'WARN', 'ALLOW']
    expect(decisions).toHaveLength(3)
  })

  it('MpiInput accepts all optional fields', () => {
    const input: MpiInput = {
      nameGiven: 'Ahmad',
      nameFather: 'Mohammad',
      birthYear: 1985,
      gender: 'male',
    }
    expect(input.nameGiven).toBe('Ahmad')
  })
})
