// ============================================================
// ULTRANOS — SUBSCRIPTION CONSTANTS
// Role-to-module mapping and helpers for subscription-scoped
// user provisioning (Story 27.7).
// ============================================================

/**
 * Maps each staff role to the module code that must be actively subscribed
 * for the role to be assignable. `null` means "always available".
 *
 * Shared constant — used by Hub API (validation), Admin Portal (UI),
 * and subscription lifecycle logic (suspension on cancellation).
 */
export const ROLE_MODULE_MAP: Record<string, string | null> = {
  ADMIN: null,
  CLINICIAN: 'OPD_LITE',
  DOCTOR: 'OPD_LITE',
  PHARMACIST: 'PHARMACY_LITE',
  LAB_TECH: 'LAB_LITE',
  CHW: null,
}

/** Human-readable display names for module codes. */
export const MODULE_DISPLAY_NAMES: Record<string, string> = {
  OPD_LITE: 'OPD Lite',
  PHARMACY_LITE: 'Pharmacy Lite',
  LAB_LITE: 'Lab Lite',
}

/** Returns all roles that require the given module subscription. */
export function getRolesForModule(moduleCode: string): string[] {
  return Object.entries(ROLE_MODULE_MAP)
    .filter(([, mod]) => mod === moduleCode)
    .map(([role]) => role)
}

/** Returns the module code a role requires, or null if always available. */
export function getModuleForRole(role: string): string | null {
  return ROLE_MODULE_MAP[role] ?? null
}
