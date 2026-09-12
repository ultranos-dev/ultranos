import { describe, it, expect } from 'vitest'
import { AuditAction } from '@ultranos/shared-types'

describe('PO approval audit verbs', () => {
  it('defines the three approval action verbs', () => {
    expect(AuditAction.PO_SUBMITTED_FOR_APPROVAL).toBe('PO_SUBMITTED_FOR_APPROVAL')
    expect(AuditAction.PO_APPROVED).toBe('PO_APPROVED')
    expect(AuditAction.PO_REJECTED).toBe('PO_REJECTED')
  })
})
