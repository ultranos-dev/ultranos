import { describe, it, expect } from 'vitest'
import { LabRole, LabPermission } from '../enums'
import { LAB_ROLE_PERMISSIONS, hasLabPermission } from '../lab-permissions'

/**
 * Story 42.1 AC 2: Permission matrix verification.
 * Tests all 28 role×permission combinations against the spec.
 */

// Expected matrix from AC 2
const EXPECTED_MATRIX: Record<LabPermission, Record<LabRole, boolean>> = {
  [LabPermission.ENTER_RESULTS]: {
    [LabRole.LAB_TECH]: true,
    [LabRole.SENIOR_TECH]: true,
    [LabRole.SUPERVISOR]: true,
    [LabRole.LAB_MANAGER]: true,
  },
  [LabPermission.RELEASE_ROUTINE_RESULTS]: {
    [LabRole.LAB_TECH]: false,
    [LabRole.SENIOR_TECH]: true,
    [LabRole.SUPERVISOR]: true,
    [LabRole.LAB_MANAGER]: true,
  },
  [LabPermission.RELEASE_ALL_RESULTS]: {
    [LabRole.LAB_TECH]: false,
    [LabRole.SENIOR_TECH]: false,
    [LabRole.SUPERVISOR]: true,
    [LabRole.LAB_MANAGER]: true,
  },
  [LabPermission.OVERRIDE_QC_LOCKOUT]: {
    [LabRole.LAB_TECH]: false,
    [LabRole.SENIOR_TECH]: false,
    [LabRole.SUPERVISOR]: true,
    [LabRole.LAB_MANAGER]: true,
  },
  [LabPermission.VIEW_STAFF]: {
    [LabRole.LAB_TECH]: false,
    [LabRole.SENIOR_TECH]: false,
    [LabRole.SUPERVISOR]: true,
    [LabRole.LAB_MANAGER]: true,
  },
  [LabPermission.MANAGE_STAFF_ROLES]: {
    [LabRole.LAB_TECH]: false,
    [LabRole.SENIOR_TECH]: false,
    [LabRole.SUPERVISOR]: false,
    [LabRole.LAB_MANAGER]: true,
  },
  [LabPermission.VIEW_AUDIT_LOGS]: {
    [LabRole.LAB_TECH]: false,
    [LabRole.SENIOR_TECH]: false,
    [LabRole.SUPERVISOR]: true,
    [LabRole.LAB_MANAGER]: true,
  },
}

describe('LAB_ROLE_PERMISSIONS', () => {
  it('has entries for all four lab roles', () => {
    for (const role of Object.values(LabRole)) {
      expect(LAB_ROLE_PERMISSIONS[role]).toBeDefined()
    }
  })
})

describe('hasLabPermission', () => {
  const allRoles = Object.values(LabRole)
  const allPermissions = Object.values(LabPermission)

  // Test all 28 combinations
  for (const permission of allPermissions) {
    for (const role of allRoles) {
      const expected = EXPECTED_MATRIX[permission][role]
      it(`${role} + ${permission} → ${expected}`, () => {
        expect(hasLabPermission(role, permission)).toBe(expected)
      })
    }
  }

  it('returns false for unknown role', () => {
    expect(hasLabPermission('UNKNOWN' as LabRole, LabPermission.ENTER_RESULTS)).toBe(false)
  })

  it('returns false for null-ish role', () => {
    expect(hasLabPermission(undefined as unknown as LabRole, LabPermission.ENTER_RESULTS)).toBe(false)
    expect(hasLabPermission(null as unknown as LabRole, LabPermission.ENTER_RESULTS)).toBe(false)
  })
})
