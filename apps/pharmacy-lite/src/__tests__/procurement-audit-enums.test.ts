import { describe, it, expect } from 'vitest'
import { AuditAction, AuditResourceType } from '@ultranos/shared-types'

describe('procurement audit enums', () => {
  it('defines the four procurement resource types', () => {
    expect(AuditResourceType.PURCHASE_ORDER).toBe('PURCHASE_ORDER')
    expect(AuditResourceType.SUPPLIER_INVOICE).toBe('SUPPLIER_INVOICE')
    expect(AuditResourceType.SUPPLIER_PAYMENT).toBe('SUPPLIER_PAYMENT')
    expect(AuditResourceType.GOODS_RECEIPT).toBe('GOODS_RECEIPT')
  })
  it('defines the ten procurement action verbs', () => {
    expect(AuditAction.PO_CREATED).toBe('PO_CREATED')
    expect(AuditAction.PO_SENT).toBe('PO_SENT')
    expect(AuditAction.PO_CANCELLED).toBe('PO_CANCELLED')
    expect(AuditAction.GOODS_RECEIVED).toBe('GOODS_RECEIVED')
    expect(AuditAction.GOODS_RECEIPT_REVERSED).toBe('GOODS_RECEIPT_REVERSED')
    expect(AuditAction.SUPPLIER_INVOICE_CREATED).toBe('SUPPLIER_INVOICE_CREATED')
    expect(AuditAction.SUPPLIER_INVOICE_APPROVED).toBe('SUPPLIER_INVOICE_APPROVED')
    expect(AuditAction.SUPPLIER_INVOICE_DISPUTED).toBe('SUPPLIER_INVOICE_DISPUTED')
    expect(AuditAction.SUPPLIER_PAYMENT_RECORDED).toBe('SUPPLIER_PAYMENT_RECORDED')
    expect(AuditAction.SUPPLIER_PAYMENT_VOIDED).toBe('SUPPLIER_PAYMENT_VOIDED')
  })
})
