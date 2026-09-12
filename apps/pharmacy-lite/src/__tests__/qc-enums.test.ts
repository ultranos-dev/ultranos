import { describe, it, expect } from 'vitest'
import { AuditAction, AuditResourceType } from '@ultranos/shared-types'

describe('QC audit enums', () => {
  it('defines the STOCK_BATCH resource type', () => {
    expect(AuditResourceType.STOCK_BATCH).toBe('STOCK_BATCH')
  })
  it('defines the two QC action verbs', () => {
    expect(AuditAction.BATCH_QC_HELD).toBe('BATCH_QC_HELD')
    expect(AuditAction.BATCH_QC_RELEASED).toBe('BATCH_QC_RELEASED')
  })
})
