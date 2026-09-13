import { describe, it, expect } from 'vitest'
import type { LabOrderStatus } from '../index.js'

describe('LabOrderStatus', () => {
  it('accepts id + status with optional received fields', () => {
    const full: LabOrderStatus = {
      id: '11111111-1111-1111-1111-111111111111',
      status: 'on-hold',
      receivedAt: '2026-09-12T00:00:00.000Z',
      receivedByLabId: '22222222-2222-2222-2222-222222222222',
    }
    const minimal: LabOrderStatus = {
      id: '33333333-3333-3333-3333-333333333333',
      status: 'active',
    }
    expect(full.status).toBe('on-hold')
    expect(minimal.receivedAt).toBeUndefined()
  })
})
