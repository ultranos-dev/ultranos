// Mentorship Pairing System types (v26) — Story 46.5
// These types capture technician-to-technician mentorship data only.
// No patient PHI is stored here. caseContext uses LOINC codes only — never patient-linked data.

export interface MentorshipPairing {
  id: string                    // UUID
  mentorId: string
  mentorName: string
  menteeId: string
  menteeName: string
  status: 'active' | 'paused' | 'completed'
  createdAt: string             // ISO 8601
  createdBy: string             // district health officer ID
  lastCheckInAt: string | null
  nextCheckInDue: string        // ISO 8601 — monthly cadence
  meta: { lastUpdated: string; versionId: string }
}

export interface LearningJournalEntry {
  id: string
  pairingId: string
  authorId: string              // mentor or mentee
  authorRole: 'mentor' | 'mentee'
  title: string
  body: string                  // markdown
  photos: { id: string; data: string; mimeType: string; alt?: string }[]
  caseContext?: {
    procedureRef?: string       // LOINC code — no patient-linked data
    procedureName?: string
    learningOutcome?: string
  }
  createdAt: string
  syncStatus: 'pending' | 'synced'
}

export interface CheckInRecord {
  id: string
  pairingId: string
  completedBy: string           // who initiated the check-in
  completedAt: string
  notes: string                 // brief check-in summary
  menteeGoals?: string[]        // goals for next period
  syncStatus: 'pending' | 'synced'
}
