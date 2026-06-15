/**
 * Story 49.4 — Conflict Zone Security Protocols
 * Zustand store for Security Alert state.
 *
 * Persists activation state to Dexie (securityAlertState table) so that
 * Security Mode survives browser restarts. On app load the store is
 * hydrated from the Dexie singleton record (id=1).
 *
 * INVARIANT: only users with labRole === LAB_MANAGER may call activate().
 */

import { create } from 'zustand'
import { LabRole } from '@ultranos/shared-types'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { getDb, type ChecklistItem, type SecurityAlertStateRecord } from '@/lib/db'
import { setReadOnlyMode } from '@/lib/security/read-only-guard'

export type { ChecklistItem }

interface SecurityAlertState {
  isActive: boolean
  activatedAt: string | null
  activatedBy: string | null
  readOnlyMode: boolean
  checklistItems: ChecklistItem[]
  backupGenerated: boolean
  wipeCompleted: boolean

  /** Activate Security Alert. Only callable by LAB_MANAGER. */
  activate: (userId: string) => Promise<void>
  /** Deactivate Security Alert (requires successful restoration). */
  deactivate: () => Promise<void>
  /** Toggle a checklist item's checked state. */
  updateChecklist: (itemId: string, checked: boolean) => void
  /** Mark backup as generated. */
  markBackupGenerated: () => Promise<void>
  /** Mark wipe as completed. */
  markWipeCompleted: () => Promise<void>
  /** Reset all state (used in tests and after full wipe). */
  reset: () => void
  /** Hydrate from Dexie on app load. */
  hydrateFromDb: () => Promise<void>
}

const DEFAULT_CHECKLIST_ITEMS: ChecklistItem[] = [
  { id: 'biohazard', label: 'security.checklist.biohazard', checked: false, checkedAt: null },
  { id: 'sampleStorage', label: 'security.checklist.sampleStorage', checked: false, checkedAt: null },
  { id: 'instruments', label: 'security.checklist.instruments', checked: false, checkedAt: null },
  { id: 'paperRecords', label: 'security.checklist.paperRecords', checked: false, checkedAt: null },
  { id: 'usbRemoval', label: 'security.checklist.usbRemoval', checked: false, checkedAt: null },
  { id: 'notifyDistrict', label: 'security.checklist.notifyDistrict', checked: false, checkedAt: null },
  { id: 'staffContacts', label: 'security.checklist.staffContacts', checked: false, checkedAt: null },
]

const INITIAL_STATE = {
  isActive: false,
  activatedAt: null,
  activatedBy: null,
  readOnlyMode: false,
  checklistItems: DEFAULT_CHECKLIST_ITEMS,
  backupGenerated: false,
  wipeCompleted: false,
}

/** Extract only serializable data fields from the store state. */
function extractDataFields(state: SecurityAlertState): Omit<SecurityAlertStateRecord, 'id'> {
  return {
    isActive: state.isActive,
    activatedAt: state.activatedAt,
    activatedBy: state.activatedBy,
    readOnlyMode: state.readOnlyMode,
    checklistItems: state.checklistItems,
    backupGenerated: state.backupGenerated,
    wipeCompleted: state.wipeCompleted,
  }
}

async function persistToDb(
  data: Omit<SecurityAlertStateRecord, 'id'>,
): Promise<void> {
  try {
    const db = getDb()
    await db.securityAlertState.put({ id: 1, ...data })
  } catch {
    // Best-effort — never throw from state persistence
  }
}

export const useSecurityAlertStore = create<SecurityAlertState>((set, get) => ({
  ...INITIAL_STATE,

  activate: async (userId: string) => {
    const session = useAuthSessionStore.getState().session
    if (!session) {
      throw new Error('Not authenticated')
    }
    if (session.labRole !== LabRole.LAB_MANAGER) {
      throw new Error('Only a lab_manager role can activate Security Alert')
    }

    const now = new Date().toISOString()
    const newState = {
      isActive: true,
      activatedAt: now,
      activatedBy: userId,
      readOnlyMode: true,
      checklistItems: DEFAULT_CHECKLIST_ITEMS,
      backupGenerated: false,
      wipeCompleted: false,
    }

    set(newState)
    setReadOnlyMode(true)
    await persistToDb(newState)

    // Emit audit event (fire-and-forget — must not block activation)
    void import('@/lib/audit-client').then(({ reportSecurityAuditEvent }) => {
      reportSecurityAuditEvent({ action: 'SECURITY_ALERT_ACTIVATED' })
    })
  },

  deactivate: async () => {
    const newState = {
      isActive: false,
      activatedAt: null,
      activatedBy: null,
      readOnlyMode: false,
      checklistItems: DEFAULT_CHECKLIST_ITEMS,
      backupGenerated: false,
      wipeCompleted: false,
    }

    set(newState)
    setReadOnlyMode(false)
    await persistToDb(newState)

    void import('@/lib/audit-client').then(({ reportSecurityAuditEvent }) => {
      reportSecurityAuditEvent({ action: 'SECURITY_ALERT_DEACTIVATED' })
    })
  },

  updateChecklist: (itemId: string, checked: boolean) => {
    const now = new Date().toISOString()
    const updated = get().checklistItems.map((item) =>
      item.id === itemId
        ? { ...item, checked, checkedAt: checked ? now : null }
        : item,
    )
    set({ checklistItems: updated })
    void persistToDb(extractDataFields(get()))
  },

  markBackupGenerated: async () => {
    set({ backupGenerated: true })
    await persistToDb(extractDataFields(get()))
  },

  markWipeCompleted: async () => {
    set({ wipeCompleted: true })
    await persistToDb(extractDataFields(get()))
  },

  reset: () => {
    set(INITIAL_STATE)
    setReadOnlyMode(false)
  },

  hydrateFromDb: async () => {
    try {
      const db = getDb()
      const stored = await db.securityAlertState.get(1)
      if (stored) {
        set({
          isActive: stored.isActive,
          activatedAt: stored.activatedAt,
          activatedBy: stored.activatedBy,
          readOnlyMode: stored.readOnlyMode,
          checklistItems: stored.checklistItems ?? DEFAULT_CHECKLIST_ITEMS,
          backupGenerated: stored.backupGenerated,
          wipeCompleted: stored.wipeCompleted,
        })
        setReadOnlyMode(stored.readOnlyMode)
      }
    } catch {
      // Best-effort — app still functions without persisted state
    }
  },
}))
