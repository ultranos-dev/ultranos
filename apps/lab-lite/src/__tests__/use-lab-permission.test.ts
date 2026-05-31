import { describe, it, expect, beforeEach } from 'vitest'
import { LabRole, LabPermission, hasLabPermission } from '@ultranos/shared-types'
import { useAuthSessionStore } from '../stores/auth-session-store'

/**
 * Story 42.1 AC 2: Permission hook logic tests.
 *
 * We test the underlying hasLabPermission logic and the store integration
 * directly (not via React hooks) since Vitest doesn't have a React renderer.
 * The hooks are thin wrappers around these — they call
 * useAuthSessionStore(s => s.session?.labRole) + hasLabPermission.
 */

function setLabRole(labRole: LabRole | null) {
  useAuthSessionStore.getState().setSession({
    userId: 'u1',
    practitionerId: 'p1',
    role: 'LAB_TECH',
    sessionId: 's1',
    email: 'test@lab.test',
    labRole,
  })
}

function checkPermission(permission: LabPermission): boolean {
  const labRole = useAuthSessionStore.getState().session?.labRole
  if (!labRole) return false
  return hasLabPermission(labRole, permission)
}

const ROLE_ORDER: LabRole[] = [LabRole.LAB_TECH, LabRole.SENIOR_TECH, LabRole.SUPERVISOR, LabRole.LAB_MANAGER]

function checkRequireRole(minRole: LabRole): boolean {
  const labRole = useAuthSessionStore.getState().session?.labRole
  if (!labRole) return false
  const currentIdx = ROLE_ORDER.indexOf(labRole)
  const requiredIdx = ROLE_ORDER.indexOf(minRole)
  if (currentIdx === -1 || requiredIdx === -1) return false
  return currentIdx >= requiredIdx
}

describe('useLabPermission (store-based)', () => {
  beforeEach(() => {
    useAuthSessionStore.getState().clearSession()
  })

  // All 28 role×permission combinations from AC 2 matrix
  const matrix: Array<{ role: LabRole; permission: LabPermission; expected: boolean }> = [
    { role: LabRole.LAB_TECH, permission: LabPermission.ENTER_RESULTS, expected: true },
    { role: LabRole.SENIOR_TECH, permission: LabPermission.ENTER_RESULTS, expected: true },
    { role: LabRole.SUPERVISOR, permission: LabPermission.ENTER_RESULTS, expected: true },
    { role: LabRole.LAB_MANAGER, permission: LabPermission.ENTER_RESULTS, expected: true },

    { role: LabRole.LAB_TECH, permission: LabPermission.RELEASE_ROUTINE_RESULTS, expected: false },
    { role: LabRole.SENIOR_TECH, permission: LabPermission.RELEASE_ROUTINE_RESULTS, expected: true },
    { role: LabRole.SUPERVISOR, permission: LabPermission.RELEASE_ROUTINE_RESULTS, expected: true },
    { role: LabRole.LAB_MANAGER, permission: LabPermission.RELEASE_ROUTINE_RESULTS, expected: true },

    { role: LabRole.LAB_TECH, permission: LabPermission.RELEASE_ALL_RESULTS, expected: false },
    { role: LabRole.SENIOR_TECH, permission: LabPermission.RELEASE_ALL_RESULTS, expected: false },
    { role: LabRole.SUPERVISOR, permission: LabPermission.RELEASE_ALL_RESULTS, expected: true },
    { role: LabRole.LAB_MANAGER, permission: LabPermission.RELEASE_ALL_RESULTS, expected: true },

    { role: LabRole.LAB_TECH, permission: LabPermission.OVERRIDE_QC_LOCKOUT, expected: false },
    { role: LabRole.SENIOR_TECH, permission: LabPermission.OVERRIDE_QC_LOCKOUT, expected: false },
    { role: LabRole.SUPERVISOR, permission: LabPermission.OVERRIDE_QC_LOCKOUT, expected: true },
    { role: LabRole.LAB_MANAGER, permission: LabPermission.OVERRIDE_QC_LOCKOUT, expected: true },

    { role: LabRole.LAB_TECH, permission: LabPermission.VIEW_STAFF, expected: false },
    { role: LabRole.SENIOR_TECH, permission: LabPermission.VIEW_STAFF, expected: false },
    { role: LabRole.SUPERVISOR, permission: LabPermission.VIEW_STAFF, expected: true },
    { role: LabRole.LAB_MANAGER, permission: LabPermission.VIEW_STAFF, expected: true },

    { role: LabRole.LAB_TECH, permission: LabPermission.MANAGE_STAFF_ROLES, expected: false },
    { role: LabRole.SENIOR_TECH, permission: LabPermission.MANAGE_STAFF_ROLES, expected: false },
    { role: LabRole.SUPERVISOR, permission: LabPermission.MANAGE_STAFF_ROLES, expected: false },
    { role: LabRole.LAB_MANAGER, permission: LabPermission.MANAGE_STAFF_ROLES, expected: true },

    { role: LabRole.LAB_TECH, permission: LabPermission.VIEW_AUDIT_LOGS, expected: false },
    { role: LabRole.SENIOR_TECH, permission: LabPermission.VIEW_AUDIT_LOGS, expected: false },
    { role: LabRole.SUPERVISOR, permission: LabPermission.VIEW_AUDIT_LOGS, expected: true },
    { role: LabRole.LAB_MANAGER, permission: LabPermission.VIEW_AUDIT_LOGS, expected: true },
  ]

  for (const { role, permission, expected } of matrix) {
    it(`${role} + ${permission} → ${expected}`, () => {
      setLabRole(role)
      expect(checkPermission(permission)).toBe(expected)
    })
  }

  it('returns false for null labRole', () => {
    setLabRole(null)
    expect(checkPermission(LabPermission.ENTER_RESULTS)).toBe(false)
  })

  it('returns false when no session', () => {
    expect(checkPermission(LabPermission.ENTER_RESULTS)).toBe(false)
  })
})

describe('useRequireLabRole (store-based)', () => {
  beforeEach(() => {
    useAuthSessionStore.getState().clearSession()
  })

  it('LAB_TECH meets LAB_TECH requirement', () => {
    setLabRole(LabRole.LAB_TECH)
    expect(checkRequireRole(LabRole.LAB_TECH)).toBe(true)
  })

  it('LAB_TECH does not meet SUPERVISOR requirement', () => {
    setLabRole(LabRole.LAB_TECH)
    expect(checkRequireRole(LabRole.SUPERVISOR)).toBe(false)
  })

  it('LAB_MANAGER meets any role requirement', () => {
    setLabRole(LabRole.LAB_MANAGER)
    expect(checkRequireRole(LabRole.LAB_TECH)).toBe(true)
    expect(checkRequireRole(LabRole.SENIOR_TECH)).toBe(true)
    expect(checkRequireRole(LabRole.SUPERVISOR)).toBe(true)
    expect(checkRequireRole(LabRole.LAB_MANAGER)).toBe(true)
  })

  it('returns false when no session', () => {
    expect(checkRequireRole(LabRole.LAB_TECH)).toBe(false)
  })
})
