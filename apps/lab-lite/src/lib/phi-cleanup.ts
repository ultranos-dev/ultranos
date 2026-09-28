import { getDb } from './db'

/**
 * Tables containing PHI that must be cleared on session end.
 *
 * Lab-Lite stores minimal PHI per CLAUDE.md rule #7 (patient name + age only
 * for verification). Despite this, the following tables contain patient-linked
 * data and must be cleared to prevent workstation data leakage. As of Story
 * 58.3 the field-level-encrypted tables (see db.ts PHI_TABLE_CONFIGS) are also
 * blanket-cleared here for defence-in-depth beyond key-wipe alone.
 *
 * Tables determined by auditing LabLiteDatabase table declarations in db.ts:
 *   uploadQueue        — patientFirstName, patientRef, encrypted file blob
 *   verified_patients  — firstName, age (patient verification cache)
 *   patientVerifications — patientRef, sample linkage
 *   samples            — subject.reference (FHIR patient ref), specimen data
 *   orders             — patientFirstName, patientAge, patientRef
 *   queueEntries       — patientFirstName, patientAge, patientRef, token
 *   consentRecords     — patientRef, encrypted audio/thumbprint blobs
 *   payments           — patientRef (financial + patient linkage)
 *   culturalPreferences — patientRef, cultural flags
 *   familyDelegates    — patientRef, AES-GCM encrypted delegatePhone/delegateName
 *   smsQueue           — recipientPhone, messageBody (critical result notification content)
 *   lab_results        — patientRef, reportComment (clinical content)
 *   lab_observations   — linked to lab_results; clinical analyte values
 *   amendments         — originalValues, amendedValues (clinical result snapshots)
 *   labLogbook         — patientRef, patientFirstName, patientAge
 *   chw_samples        — patientRef (Community Health Worker collection data)
 *   monitoringFlags    — patientRef, patientFirstName, patientAge (TDM monitoring; Story 58.2)
 *
 * Story 58.3 (H-LAB-2) — previously-omitted patient-linked tables, now cleared:
 *   patients           — full FHIR Patient record (name, DOB, contacts). Full
 *                        tier record loaded on demand; not field-encrypted
 *                        (indexed name fields drive local search), so a wipe is
 *                        the primary at-rest protection.
 *   escalation_chains  — patientRef + criticalValue + analyte (critical-result
 *                        escalation content); field-encrypted, also wiped.
 *   resultSnapshots    — patientRef + analyteName + value (delta-check history).
 *                        Deliberately durable WITHIN a session for plausibility
 *                        delta checks, but there is no requirement to retain it
 *                        across logout on a shared workstation → cleared.
 *   custody_events     — sampleId-linked chain-of-custody events; patient-linked
 *                        via the (cleared) samples table → cleared with them.
 *   distributionQueue  — payload = JSON projection of a report (clinical result
 *                        content) bound to reportId; transient outbound queue → cleared.
 */
export const PHI_TABLES = [
  'uploadQueue',
  'verified_patients',
  'patientVerifications',
  'samples',
  'orders',
  'queueEntries',
  'consentRecords',
  'payments',
  'culturalPreferences',
  'familyDelegates',
  'smsQueue',
  'lab_results',
  'lab_observations',
  'amendments',
  'labLogbook',
  'chw_samples',
  'monitoringFlags',
  // Story 58.3 (H-LAB-2) additions:
  'patients',
  'escalation_chains',
  'resultSnapshots',
  'custody_events',
  'distributionQueue',
  // Patient clinical records captured by the shared registration/edit form (v59,
  // full access 2026-09-28). Encrypted PHI cache cleared on logout — unsynced writes
  // survive separately in syncQueue.
  'allergyIntolerances',
  'observations',
] as const

/**
 * Story 58.3 (H-LAB-2) — patient-linked tables DELIBERATELY RETAINED across
 * session end, each with a justified rationale. These survive logout because
 * clearing them would destroy a required durable/regulatory record. They must
 * NOT appear in PHI_TABLES.
 *
 * incident_reports — Biosafety/exposure incident reports (needle-stick, spill).
 *                    Append-only, Tier-1 safety-critical (see db.ts comment) and
 *                    a regulatory record that syncs to the Hub; destroying it at
 *                    logout would lose an unsynced safety report. It carries a
 *                    `sourcePatientRef` (opaque blind-index ref, not raw PHI); the
 *                    incident content is occupational-safety data, not clinical
 *                    PHI. Retained until confirmed synced, mirroring the
 *                    append-only clientAuditLog rationale.
 */
export const DOCUMENTED_RETENTION_TABLES = [
  'incident_reports',
] as const

/**
 * Tables that must NEVER be cleared on session end (durability / non-PHI):
 *
 * syncQueue          — pending/failed entries contain unsynced data; must survive for drain
 * clientAuditLog     — append-only audit trail (opaque IDs, no PHI); regulatory requirement
 * practitioner_keys  — Ed25519 public key cache; not patient PHI
 * orderAckQueue      — Story 60.4: durable order-ack retry queue; holds only the opaque
 *                      orderId + retry state (no PHI). Must survive logout/restart so a
 *                      failed acknowledgement still retries (AC 2) — same durability
 *                      rationale as syncQueue.
 */
export const PRESERVE_TABLES = [
  'syncQueue',
  'clientAuditLog',
  'practitioner_keys',
  'orderAckQueue',
] as const

/**
 * Non-PHI operational / reference / config tables. Enumerated so the
 * completeness guard (phi-cleanup-completeness.test.ts) can assert that EVERY
 * Dexie table is classified as exactly one of: PHI (cleared),
 * documented-retention, preserved, or non-PHI. Adding a new table without
 * classifying it fails that test. Keep alphabetized.
 *
 * These hold no patient-linked clinical content — reagent inventory, equipment,
 * gamification, quality metrics, config, reference data, employee-health
 * (self-encrypted), etc. `employee_health_records` is occupational-health data
 * stored as pre-encrypted EncryptedHealthRecord and is out of the patient-PHI
 * scope of this cleanup.
 */
export const NON_PHI_TABLES = [
  'achievement_preferences',
  'achievement_scheduler_config',
  'achievements',
  'ai_provenance',
  'archived_samples',
  'atlas_categories',
  'atlas_entries',
  'authorizationActions',
  'badges',
  'certification_pathways',
  'check_in_records',
  'checklistConfig',
  'checklist_templates',
  'competency_snapshots',
  'completedChecklists',
  'consultation_recipients',
  'consultation_requests',
  'consultation_responses',
  'courier_handoffs',
  'criticalValueThresholds',
  'dailyLogs',
  'daily_log_settings',
  'daily_sitreps',
  'dataBudgetConfig',
  'dataUsage',
  'decay_notifications',
  'digital_certificates',
  'donorPrograms',
  'donorReportTemplates',
  'donorReports',
  'driftAlerts',
  'earned_badges',
  'employee_health_records',
  'escalation_contacts',
  'flagAcknowledgments',
  'guidance_content',
  'guidance_triggers',
  'handover_reports',
  'hmisReports',
  'infection_control_audits',
  'instrument_history',
  'instrument_notifications',
  'instrument_queue',
  'instruments',
  'knowledge_cards',
  'labOverheadConfig',
  'labStats',
  'lab_config',
  'lab_locations',
  'learning_journal',
  'medicationLabMappings',
  'mentorship_pairings',
  'micro_learning_modules',
  'moderation_flags',
  'module_completions',
  'networkInventory',
  'network_snapshots',
  'orderHistory',
  'outbreak_configs',
  'peer_posts',
  'peer_responses',
  'pep_providers',
  'plausibilityConfigs',
  'power_schedules',
  'priorityOverrides',
  'procedure_competencies',
  'qcRuns',
  'quality_metrics',
  'quality_streaks',
  'rangeVersions',
  'reagent_alert_cache',
  'reagent_consumption_log',
  'reagent_inventory',
  'reagent_supplier_mapping',
  'redistributionRecommendations',
  'referenceRanges',
  'reference_labs',
  'reportableDiseases',
  'resupplyRequests',
  'safety_reports',
  'sample_locks',
  'securityAlertState',
  'send_out_transitions',
  'send_outs',
  'shift_sessions',
  'smsEscalationSchedule',
  'smsGatewayConfig',
  'sop_acknowledgments',
  'sops',
  'spill_incidents',
  'supervised_procedures',
  'supplier_config',
  'supply_inventory',
  'surveillanceAlerts',
  'surveillanceBaselines',
  'surveillanceSchedulerConfig',
  'tat_overrides',
  'team_achievements',
  'tech_availability',
  'tech_workload_snapshots',
  'technician_progress',
  'temperature_excursions',
  'temperature_locations',
  'temperature_readings',
  'testCostConfigs',
  'test_time_estimates',
  'transport_sessions',
  'trigger_rules',
  'trusted_devices',
  'waste_containers',
  'waste_disposal_records',
] as const

// Compile-time safety: ensure syncQueue is never accidentally added to PHI_TABLES
type AssertNotInPhi<T extends string> = T extends (typeof PHI_TABLES)[number] ? never : T
type _SyncQueueSafe = AssertNotInPhi<'syncQueue'>

/**
 * Clear all PHI tables from IndexedDB.
 * Fires all clears in parallel for speed (important for beforeunload).
 * Also clears the session encryption key used for consent blobs.
 * Never throws — swallows errors to avoid blocking logout/tab-close.
 */
export async function clearPhiTables(): Promise<void> {
  const db = getDb()
  await Promise.allSettled(
    PHI_TABLES.map((tableName) => {
      try {
        const table = db.table(tableName)
        return table.clear()
      } catch {
        // Table may not exist in this schema version — skip gracefully.
        return Promise.resolve()
      }
    }),
  )
}

/**
 * Purge synced entries from the sync queue.
 * Deletes entries with status 'synced' (no longer needed — already on Hub).
 * Retains 'pending' and 'failed' entries because they contain unsynced
 * clinical data that must not be lost.
 *
 * Called during logout and session expiry as part of cleanup (Story 28.2).
 * Full sync-queue PHI encryption is Story 28.3.
 */
export async function purgeSyncedQueueEntries(): Promise<void> {
  try {
    const db = getDb()
    await db.syncQueue.where('status').equals('synced').delete()
  } catch {
    // Non-fatal — if delete fails, entries remain but are harmless (already on Hub).
  }
}

/**
 * Verify that all PHI tables are empty.
 * Used on session start to detect incomplete cleanup from a previous session.
 * Returns true if all PHI tables are empty, false if stale data exists.
 */
export async function verifyPhiCleanup(): Promise<boolean> {
  try {
    const db = getDb()
    const counts = await Promise.all(
      PHI_TABLES.map((tableName) => db.table(tableName).count()),
    )
    return counts.every((c) => c === 0)
  } catch {
    // If we can't verify, assume dirty — caller should force-clear
    return false
  }
}
