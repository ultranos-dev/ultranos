// ---------------------------------------------------------------------------
// Story 54.2 — CHW Mode Detection
// CHW mode is active when the current user's role is 'chw' OR the location
// config is set to 'chw-collection'. In CHW mode, result entry, QC,
// inventory, and advanced settings are completely removed from the component
// tree (not just hidden) per AC #8.
// ---------------------------------------------------------------------------

import { useAuthSessionStore } from '@/stores/auth-session-store'

/** Roles that activate CHW mode. */
const CHW_ROLES = new Set(['chw', 'chw-collection'])

/**
 * Returns true if the current session is operating in CHW mode.
 * Reads from the Zustand auth session store (synchronous, always available).
 */
export function isCHWMode(): boolean {
  const session = useAuthSessionStore.getState().session
  if (!session) return false
  return CHW_ROLES.has(session.role)
}

/**
 * React hook version — re-renders when session changes.
 * Use in components that need to react to login/role changes.
 */
export function useIsCHWMode(): boolean {
  const role = useAuthSessionStore((s) => s.session?.role ?? null)
  return role != null && CHW_ROLES.has(role)
}
