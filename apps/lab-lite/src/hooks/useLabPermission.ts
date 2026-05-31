import { type LabPermission, type LabRole, hasLabPermission } from '@ultranos/shared-types'
import { useAuthSessionStore } from '@/stores/auth-session-store'

/**
 * Check if the current user has a specific lab permission.
 * Story 42.1 AC 2, 6: Client-side permission gating (offline-safe).
 */
export function useLabPermission(permission: LabPermission): boolean {
  const labRole = useAuthSessionStore((s) => s.session?.labRole)
  if (!labRole) return false
  return hasLabPermission(labRole, permission)
}

/**
 * Convenience hook for component-level role gating.
 * Returns true if the current user's lab role is at least `minRole`.
 */
const ROLE_ORDER: LabRole[] = ['LAB_TECH', 'SENIOR_TECH', 'SUPERVISOR', 'LAB_MANAGER'] as LabRole[]

export function useRequireLabRole(minRole: LabRole): boolean {
  const labRole = useAuthSessionStore((s) => s.session?.labRole)
  if (!labRole) return false
  const currentIdx = ROLE_ORDER.indexOf(labRole)
  const requiredIdx = ROLE_ORDER.indexOf(minRole)
  if (currentIdx === -1 || requiredIdx === -1) return false
  return currentIdx >= requiredIdx
}
