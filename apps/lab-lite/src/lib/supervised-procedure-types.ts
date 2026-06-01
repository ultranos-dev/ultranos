/**
 * Supervised Procedure types — Story 46.6
 *
 * Logs supervisor-witnessed procedure events for a technician.
 * No PHI: supervisorId, technicianId are opaque practitioner IDs.
 * procedureRef uses LOINC codes — no patient linkage.
 */

export interface SupervisedProcedure {
  id: string
  technicianId: string
  supervisorId: string
  /** LOINC code */
  procedureRef: string
  procedureName: string
  performedAt: string
  supervisorNotes?: string
  syncStatus: 'pending' | 'synced'
}
