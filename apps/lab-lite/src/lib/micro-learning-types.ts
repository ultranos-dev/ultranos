/**
 * Contextual Micro-Learning Module types — Story 46.2
 *
 * Self-contained learning modules bundled offline in Dexie.
 * No patient data; pure procedural training content (CLAUDE.md Rule #7 non-applicable).
 */

export interface ModuleStep {
  stepNumber: number
  text: string                // markdown
  imageBase64?: string        // base64-encoded image (fully self-contained for offline)
  imageMimeType?: string      // e.g. 'image/png', 'image/jpeg'
  imageAlt?: string           // alt text for accessibility
}

export interface AssessmentQuestion {
  id: string
  question: string
  options: string[]
  correctIndex: number        // zero-based index into options
}

export interface MicroLearningModule {
  id: string
  procedureRef: string        // LOINC code or procedure identifier
  procedureName: string       // human-readable name shown in notification
  title: string
  content: ModuleStep[]
  keyTips: string[]
  selfAssessment: AssessmentQuestion[]
  durationMinutes: number     // display hint shown in notification toast
  version: string             // semver
  relatedSopId?: string       // link to SOP from Story 46.1
  /** Per-procedure decay threshold in days. Defaults to 30 if absent. */
  skillDecayDays?: number
  meta: {
    lastUpdated: string       // ISO 8601 instant (FHIR canonical)
    versionId: string
  }
}

export type ModuleCompletionSyncStatus = 'pending' | 'synced'

export interface ModuleCompletion {
  id: string
  moduleId: string
  moduleVersion: string
  technicianId: string
  completedAt: string         // ISO 8601
  assessmentScore: number     // correct answers / total questions (0–1)
  assessmentPassed: boolean   // score >= threshold (default 66%)
  syncStatus: ModuleCompletionSyncStatus
}

/** Result returned by the trigger engine — used to show the notification. */
export type TriggerType = 'first_time' | 'skill_decay' | 'new_sop'

export interface TriggerResult {
  type: TriggerType
  moduleId: string
  procedureName: string
  durationMinutes: number
}
