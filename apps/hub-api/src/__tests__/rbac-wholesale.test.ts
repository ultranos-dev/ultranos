import { describe, it, expect } from 'vitest'
import { hasResourceAccess } from '@/trpc/rbac'

describe('wholesale RBAC', () => {
  it('PHARMACIST may access the 3 wholesale resource types', () => {
    for (const t of ['WholesaleCustomer', 'SalesOrder', 'CustomerLedgerEntry']) {
      expect(hasResourceAccess('PHARMACIST', t)).toBe(true)
    }
  })
  it('PHARMACIST retains existing access', () => {
    expect(hasResourceAccess('PHARMACIST', 'MedicationDispense')).toBe(true)
  })
  it('non-pharmacist roles are denied wholesale resources', () => {
    expect(hasResourceAccess('DOCTOR', 'SalesOrder')).toBe(false)
    // LAB_TECH: product decision 2026-09-28 grants lab-lite FULL, unrestricted access
    // ('*') at this stage — role-based access will be layered on later — so it is no
    // longer denied wholesale (or any) resources. See CLAUDE.md Rule #7.
    expect(hasResourceAccess('LAB_TECH', 'WholesaleCustomer')).toBe(true)
  })
})
