# Story 46.5: Mentorship Pairing System

Status: ready-for-dev

## Story

As a district health officer,
I want to pair experienced techs with isolated or junior techs for structured mentorship,
so that professional isolation is addressed and knowledge transfer happens even without travel.

## Context

Lab technicians in remote facilities often work alone with no access to experienced colleagues for guidance or professional growth. This story creates a structured mentorship pairing system where district health officers can pair experienced techs (mentors) with isolated or junior techs (mentees). All interactions are asynchronous — no real-time connectivity required. The system includes monthly check-in prompts, a shared learning journal for case discussions, and progress tracking.

The mentorship communication channel reuses the peer network infrastructure from Story 46.4, operating as a private channel between paired individuals. Mentorship activity feeds into the tech's professional development record and is visible to district health officers for oversight.

**PRD Requirements:** FR46 (brainstorm #37)
**Dependencies:** Story 46.4 (Peer Network — reuses messaging infrastructure)

## Acceptance Criteria

1. [ ] Given the Hub has a registry of lab technicians across the network, when a mentorship pairing is created, then the mentor and mentee are linked in Lab-Lite.
2. [ ] The pairing includes: monthly check-in prompts, a shared learning journal for case discussions, and progress tracking.
3. [ ] All interactions are asynchronous (no real-time requirement).
4. [ ] The district health officer can see which techs are mentored and which are unmatched.
5. [ ] Mentorship activity is tracked in the tech's professional development record.
6. [ ] All UI is RTL-compatible and i18n-ready.

## Tasks / Subtasks

- [ ] **Task 1: Mentorship Data Model & Dexie Schema** (AC: 1, 2)
  - [ ] Create `apps/lab-lite/src/lib/mentorship-types.ts` with:
    ```
    MentorshipPairing {
      id: string                   // UUID
      mentorId: string
      mentorName: string
      menteeId: string
      menteeName: string
      status: 'active' | 'paused' | 'completed'
      createdAt: string            // ISO 8601
      createdBy: string            // district health officer ID
      lastCheckInAt: string | null
      nextCheckInDue: string       // ISO 8601 — monthly cadence
      meta: { lastUpdated: string, versionId: string }
    }
    ```
  - [ ] Define `LearningJournalEntry` type:
    ```
    {
      id: string
      pairingId: string
      authorId: string             // mentor or mentee
      authorRole: 'mentor' | 'mentee'
      title: string
      body: string                 // markdown
      photos: { id: string, data: string, mimeType: string, alt?: string }[]
      caseContext?: {
        procedureRef?: string      // LOINC code
        procedureName?: string
        learningOutcome?: string
      }
      createdAt: string
      syncStatus: 'pending' | 'synced'
    }
    ```
  - [ ] Define `CheckInRecord` type:
    ```
    {
      id: string
      pairingId: string
      completedBy: string          // who initiated the check-in
      completedAt: string
      notes: string                // brief check-in summary
      menteeGoals?: string[]       // goals for next period
      syncStatus: 'pending' | 'synced'
    }
    ```
  - [ ] Update `apps/lab-lite/src/lib/db.ts` — add Dexie tables:
    - `mentorship_pairings` table: `&id, mentorId, menteeId, status, [mentorId+status], [menteeId+status]`
    - `learning_journal` table: `&id, pairingId, authorId, createdAt, syncStatus`
    - `check_in_records` table: `&id, pairingId, completedAt, syncStatus`

- [ ] **Task 2: Pairing Sync from Hub** (AC: 1, 4)
  - [ ] Create `apps/lab-lite/src/lib/mentorship-sync.ts`.
  - [ ] Implement `syncMentorshipPairings()`:
    - Pull pairing registry from Hub (Hub manages pairing creation by district health officers).
    - Sync locally stored journal entries and check-in records to Hub.
    - Pull partner's journal entries and check-in responses.
  - [ ] Integrate into the existing sync cycle.
  - [ ] Pairings are Hub-managed (read-only in Lab-Lite) — Lab-Lite cannot create or delete pairings, only consume them.

- [ ] **Task 3: Monthly Check-In Prompt System** (AC: 2)
  - [ ] Create `apps/lab-lite/src/lib/check-in-scheduler.ts`.
  - [ ] Implement `getOverdueCheckIns(technicianId: string): Promise<MentorshipPairing[]>` — returns pairings where `nextCheckInDue` is in the past.
  - [ ] Create `apps/lab-lite/src/components/mentorship/CheckInPrompt.tsx` — notification component shown on dashboard when a check-in is overdue.
  - [ ] Create `apps/lab-lite/src/components/mentorship/CheckInForm.tsx`:
    - Brief notes field (how things are going).
    - Mentee goals for next period (optional text list).
    - Submit updates `lastCheckInAt` and advances `nextCheckInDue` by 30 days.
  - [ ] Save `CheckInRecord` to Dexie with `syncStatus: 'pending'`.

- [ ] **Task 4: Shared Learning Journal** (AC: 2, 3)
  - [ ] Create `apps/lab-lite/src/components/mentorship/LearningJournal.tsx`.
  - [ ] Display journal entries for a pairing in chronological order.
  - [ ] Both mentor and mentee can add entries with: title, body (markdown), optional photos, optional case context (procedure, learning outcome).
  - [ ] Create `apps/lab-lite/src/components/mentorship/JournalEntryForm.tsx` — form for creating new entries.
  - [ ] Entries are stored in Dexie and synced asynchronously — each party sees the other's entries after sync.
  - [ ] Photo handling reuses the same compression/EXIF-stripping logic from Story 46.4.

- [ ] **Task 5: Mentorship Dashboard** (AC: 1, 2, 5)
  - [ ] Create `apps/lab-lite/src/components/mentorship/MentorshipDashboard.tsx`.
  - [ ] Show active pairings with: partner name, role (mentor/mentee), pairing status, last check-in date, next check-in due, journal entry count.
  - [ ] Visual indicators: overdue check-in (amber warning), no activity in 30+ days (red warning).
  - [ ] Link to learning journal and check-in form for each pairing.
  - [ ] For techs with no pairing: display a message — "No active mentorship pairing. Contact your district health officer for pairing."

- [ ] **Task 6: District Health Officer Visibility** (AC: 4)
  - [ ] Mentorship activity data (check-in dates, journal entry counts, pairing status) syncs to Hub.
  - [ ] Hub-side dashboard for district health officers showing: all pairings in their district, paired vs. unmatched techs, overdue check-ins, inactive pairings.
  - [ ] **Note:** The Hub-side dashboard UI is out of scope for Lab-Lite — this task ensures the correct data is synced. Hub API implementation deferred.

- [ ] **Task 7: Page Route & Navigation** (AC: 6)
  - [ ] Create `apps/lab-lite/src/app/[locale]/mentorship/page.tsx`.
  - [ ] Add mentorship link to `AppSidebar.tsx` navigation.
  - [ ] Add all translation keys for mentorship-related labels.
  - [ ] Ensure RTL layout compatibility.

- [ ] **Task 8: Tests** (AC: 1-5)
  - [ ] Unit tests for check-in scheduler: overdue detection, next due date calculation, no pairing case.
  - [ ] Unit tests for mentorship sync: pairing pull, journal entry push/pull.
  - [ ] Component tests for MentorshipDashboard: pairing display, warning indicators.
  - [ ] Component tests for CheckInForm: submit behavior, goal list.
  - [ ] Component tests for LearningJournal: chronological ordering, both-party entries.
  - [ ] RTL snapshot tests.

## Dev Notes

- **Hub-managed pairings:** Pairing creation and deletion are administrative actions performed by district health officers through the Hub. Lab-Lite is a consumer only — it syncs pairings and displays them. This prevents unauthorized self-pairing.
- **Async communication channel:** The shared learning journal effectively serves as the async communication channel between mentor and mentee. It reuses the same photo handling patterns as Story 46.4 (compression, EXIF stripping, base64 storage).
- **Monthly check-in cadence:** The 30-day check-in cycle is fixed but could be made configurable per pairing in future iterations. The check-in is a lightweight touchpoint, not a comprehensive review.
- **No patient data in journal entries:** Journal entries may discuss case types and procedures but must never include patient identifiers, sample IDs, or specific result values. The `caseContext` field captures procedure type only (LOINC code), not patient-linked data. This aligns with CLAUDE.md Rule #7.
- **Mentorship activity in professional development:** Check-in completion and journal entries count as professional development activity, feeding into the certification pathway (Story 46.6).
- **Reuse of peer network infrastructure:** While this story creates its own data model for the private mentor-mentee channel, it reuses the photo processing utilities and sync patterns from Story 46.4. Consider extracting shared photo utilities to a common module.

### Project Structure Notes

New files:
- `apps/lab-lite/src/lib/mentorship-types.ts`
- `apps/lab-lite/src/lib/mentorship-sync.ts`
- `apps/lab-lite/src/lib/check-in-scheduler.ts`
- `apps/lab-lite/src/components/mentorship/MentorshipDashboard.tsx`
- `apps/lab-lite/src/components/mentorship/CheckInPrompt.tsx`
- `apps/lab-lite/src/components/mentorship/CheckInForm.tsx`
- `apps/lab-lite/src/components/mentorship/LearningJournal.tsx`
- `apps/lab-lite/src/components/mentorship/JournalEntryForm.tsx`
- `apps/lab-lite/src/app/[locale]/mentorship/page.tsx`

Modified files:
- `apps/lab-lite/src/lib/db.ts` (new Dexie version with mentorship tables)
- `apps/lab-lite/src/components/AppSidebar.tsx` (add mentorship link)
- `apps/lab-lite/src/i18n/locales/en.json` (mentorship translation keys)

## References

- Epic definition: `_bmad-output/planning-artifacts/epics.md` — Epic 46, Story 46.5
- Peer network infrastructure: Story 46.4 (photo processing, sync patterns)
- Certification pathway: Story 46.6 (mentorship activity counts toward milestones)
- CLAUDE.md Rule #7: Lab Portal data minimization — no patient data in journal entries
- Existing Dexie schema: `apps/lab-lite/src/lib/db.ts`
