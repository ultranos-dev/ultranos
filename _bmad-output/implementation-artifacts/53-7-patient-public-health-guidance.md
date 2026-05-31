# Story 53.7: Patient-Facing Public Health Guidance

Status: pending

## Story

As a patient receiving a positive test result,
I want to receive simple, actionable health guidance along with my result,
So that I know what to do next to protect myself and my family.

## Context

In low-resource settings, patients receiving positive test results for conditions like malaria, TB, or hepatitis often have no access to follow-up counseling. They leave the clinic with a result but no understanding of what to do next. This story provides physician-authored, condition-specific guidance messages that accompany result delivery in Patient-Lite.

Guidance content is **physician-authored only** — never AI-generated. This is a strict requirement per CLAUDE.md: "All AI-generated clinical content requires a physician confirmation gate." Public health guidance bypasses AI entirely; these are pre-written, reviewed, and versioned scripts authored by public health physicians.

Guidance is delivered in the patient's language with both text and audio support for low-literacy populations. The four supported languages are Dari (prs), Pashto (ps), Arabic (ar), and English (en). Audio files are pre-recorded by native speakers and bundled for offline delivery.

This story spans two apps:
- **Lab-Lite:** Triggers guidance based on result conditions and attaches guidance to the result record.
- **Patient-Lite Mobile:** Displays guidance to the patient alongside the result notification.

**PRD Requirements:** FR53 (brainstorm #108)
**Dependencies:** Story 42.4 (Structured Result Data — trigger conditions), Story 42.6 (Write-Once Distribute-Many — result delivery to Patient-Lite)

## Acceptance Criteria

1. [ ] Given a result triggers a public health guidance condition (malaria positive, TB positive, hepatitis positive, etc.), when the result is delivered to Patient-Lite or the family delegate, then a physician-approved guidance message accompanies the result.
2. [ ] Guidance messages are condition-specific: each condition has a dedicated message with actionable steps tailored to the disease.
3. [ ] Guidance messages are delivered in the patient's language: text + audio in Dari (prs), Pashto (ps), Arabic (ar), and English (en).
4. [ ] Audio guidance is pre-recorded by native speakers and bundled for offline delivery.
5. [ ] Guidance messages are NEVER AI-generated — only physician-authored scripts. Each message includes author attribution and version.
6. [ ] Guidance messages are versioned: updates to guidance content are tracked with semver and old versions are retained for historical reference.
7. [ ] The guidance trigger engine maps result conditions to guidance content IDs (deterministic mapping, not AI).
8. [ ] Guidance content is bundled offline in both Lab-Lite (for attachment to results) and Patient-Lite (for display).
9. [ ] All guidance delivery events emit audit events (no PHI — only guidance ID, condition code, and delivery status).
10. [ ] The guidance display in Patient-Lite is designed for low-literacy users: large text, high contrast, audio auto-play option, simple iconography.

## Tasks / Subtasks

- [ ] **Task 1: Guidance Content Data Model** (AC: 2, 3, 5, 6)
  - [ ] Create `apps/lab-lite/src/lib/public-health-guidance.ts` with type definitions:
    ```typescript
    interface GuidanceContent {
      id: string                          // e.g., 'PHG-MALARIA-001'
      conditionCode: string               // mapped condition (e.g., 'MALARIA_POSITIVE')
      conditionDisplay: string            // i18n key for condition name

      // Multilingual content
      text: {
        en: string                        // English guidance text
        ar: string                        // Arabic guidance text
        prs: string                       // Dari guidance text
        ps: string                        // Pashto guidance text
      }

      // Audio references
      audio: {
        en: string                        // base64-encoded audio or asset path
        ar: string
        prs: string
        ps: string
      }

      // Actionable steps (separate from prose for structured display)
      steps: Array<{
        order: number
        icon: string                      // icon identifier (bed, medicine, water, family, etc.)
        text: {
          en: string
          ar: string
          prs: string
          ps: string
        }
      }>

      // Authorship & versioning
      author: {
        name: string
        credentials: string
        institution: string
      }
      version: string                     // semver
      lastReviewedAt: string              // ISO 8601
      approvedBy: string                  // reviewing authority
    }

    interface GuidanceTrigger {
      id: string
      conditionCode: string               // maps to GuidanceContent.conditionCode
      triggerType: 'result_value' | 'result_code'
      templateLoincCode: string           // which test template
      fieldCode?: string                  // specific field (for value-based triggers)
      operator?: 'eq' | 'gt' | 'gte' | 'positive'  // comparison
      value?: string | number             // threshold or code value
    }
    ```

- [ ] **Task 2: Seed Guidance Content** (AC: 1, 2, 3, 5)
  - [ ] Create `apps/lab-lite/src/lib/guidance-seed-data.ts` with initial guidance set:
    - **Malaria Positive:** "Your malaria test is positive. Your doctor will give you medicine. Important: (1) Sleep under a bed net tonight, (2) Bring your children for testing within 2 days, (3) Drink clean water and rest."
    - **TB Positive:** "(1) Take ALL your medicine every day — even when you feel better, (2) Cover your mouth when coughing, (3) Open windows for fresh air, (4) Bring family members for testing, (5) Return for your follow-up appointment."
    - **Hepatitis B Positive:** "(1) Your doctor will explain your treatment plan, (2) Do not share razors, toothbrushes, or needles, (3) Your family should be tested and vaccinated, (4) Avoid alcohol, (5) Return for follow-up blood tests."
    - **Hepatitis C Positive:** "(1) Hepatitis C can be cured with medicine, (2) Your doctor will explain the treatment, (3) Do not share razors, toothbrushes, or needles, (4) Your family should be tested, (5) Avoid alcohol."
    - **HIV Positive:** "(1) This result is confidential, (2) Your doctor will explain treatment options — effective medicines are available, (3) Return for your next appointment, (4) A counselor is available to talk with you."
    - **Anemia (Severe):** "(1) Your blood count is very low, (2) Your doctor may give you iron medicine or a blood transfusion, (3) Eat iron-rich foods: meat, beans, dark green vegetables, (4) Return for follow-up blood tests."
  - [ ] Each guidance message fully authored with steps, author attribution, and version.
  - [ ] Translations for Dari, Pashto, and Arabic (initial English text with placeholder translations marked `[TRANSLATE]`).
  - [ ] Audio fields set to empty string initially — placeholder until recordings are provided.

- [ ] **Task 3: Guidance Trigger Engine** (AC: 1, 7)
  - [ ] Create `apps/lab-lite/src/lib/guidance-trigger.ts`.
  - [ ] Implement `evaluateGuidanceTriggers(resultValues: Record<string, number | string | null>, templateLoincCode: string): GuidanceContent[]`.
  - [ ] Define trigger rules:
    - Malaria RDT or smear: positive result field.
    - TB GeneXpert or smear: positive result field.
    - Hepatitis B surface antigen: positive result.
    - Hepatitis C antibody: positive result.
    - HIV rapid test: positive result (with note: confirmatory testing required).
    - CBC hemoglobin: < 7 g/dL (severe anemia).
  - [ ] Return matching guidance content (may return multiple for combined conditions).
  - [ ] Unit tests: positive match, no match, multiple matches, boundary values.

- [ ] **Task 4: Dexie Schema Update** (AC: 8)
  - [ ] Add `guidance_content` table to Lab-Lite Dexie: `&id, conditionCode, version`.
  - [ ] Add `guidance_triggers` table: `&id, conditionCode, templateLoincCode`.
  - [ ] Create migration to next Dexie version.
  - [ ] Implement `seedGuidance()` function for first-load population.
  - [ ] Version-check logic for content updates.

- [ ] **Task 5: Lab-Lite Integration — Attach Guidance to Results** (AC: 1, 7)
  - [ ] After result authorization (Story 42.5), evaluate guidance triggers against the result.
  - [ ] If guidance matches, attach the guidance content ID to the result record's distribution metadata.
  - [ ] When the result is distributed to Patient-Lite (Story 42.6), include the guidance content IDs in the distribution payload.
  - [ ] The guidance content itself is synced separately (bundled in both apps).

- [ ] **Task 6: Patient-Lite Guidance Display** (AC: 3, 4, 10)
  - [ ] Create guidance display component in Patient-Lite (`apps/patient-lite-mobile/`):
    - Large, high-contrast text (minimum 18pt).
    - Numbered step cards with large icons (bed, medicine, water, family).
    - Audio play button with auto-play option (respecting device settings).
    - Language automatically set to patient's preferred language.
    - Simple layout: guidance title -> audio player -> numbered steps -> "I understand" acknowledgment button.
  - [ ] Guidance appears alongside the result notification in Patient-Lite.
  - [ ] Offline-capable: guidance content and audio are pre-bundled.
  - [ ] RTL layout for Arabic, Dari, and Pashto.

- [ ] **Task 7: Audio Asset Pipeline** (AC: 4)
  - [ ] Create `scripts/prepare-guidance-audio.ts` — a build-time script that:
    - Reads audio files from `apps/lab-lite/src/assets/guidance-audio/` (when recordings are provided).
    - Converts to MP3 at 64kbps mono (optimized for speech, small file size).
    - Encodes as base64 for bundling in Dexie.
    - Outputs metadata (duration, file size) for the seed data.
  - [ ] Target: < 500KB per audio file (30-60 seconds of speech at 64kbps).
  - [ ] Document the recording requirements: native speakers, clear pronunciation, measured pace, quiet background.

- [ ] **Task 8: Audit Integration** (AC: 9)
  - [ ] Add `reportGuidanceEvent()` to `apps/lab-lite/src/lib/audit-client.ts`.
  - [ ] Events: `GUIDANCE_TRIGGERED`, `GUIDANCE_ATTACHED`, `GUIDANCE_DELIVERED`, `GUIDANCE_ACKNOWLEDGED`.
  - [ ] Metadata: `guidanceId`, `conditionCode`, `language`, `deliveryChannel` (no PHI — no patient identifiers, no result values).
  - [ ] In Patient-Lite, emit `GUIDANCE_ACKNOWLEDGED` when patient taps "I understand."
  - [ ] Follow existing pattern: never throw, fire-and-forget.

- [ ] **Task 9: Tests** (AC: 5, 7)
  - [ ] Unit tests for guidance trigger engine: positive match per condition, no match, multiple conditions.
  - [ ] Unit tests for content model: all required fields present, author attribution, version format.
  - [ ] Verify guidance content is physician-authored: no `aiGenerated: true` flag, author field is required and non-empty.
  - [ ] PHI guard tests: audit metadata contains no patient identifiers.
  - [ ] Integration test: result entry -> authorization -> guidance trigger -> attachment -> distribution payload includes guidance IDs.

## Dev Notes

- **Physician-authored content only.** Guidance messages are pre-written clinical scripts, not AI-generated. Each message has an author (physician name + credentials), a reviewing authority, and a version number. This is explicitly outside the AI confirmation gate requirement because there is no AI involvement.
- **Low-literacy design for Patient-Lite.** The guidance display must work for patients who cannot read. Key design decisions: (1) audio auto-play option so the message is spoken aloud, (2) large icons representing each action step (universally recognizable — bed, medicine cup, water, family group), (3) simple numbered steps with large text, (4) "I understand" button rather than a dismiss action.
- **Multilingual audio.** Audio files are pre-recorded by native speakers of each language. The audio pipeline converts to MP3 at 64kbps mono — optimized for speech clarity at small file sizes. At 64kbps, a 45-second guidance message is ~360KB. With 6 conditions x 4 languages = 24 audio files, total audio storage is ~8.6MB — acceptable for PWA offline bundling.
- **Cross-app story.** This story touches both Lab-Lite (trigger engine, attachment to results) and Patient-Lite (display, audio playback, acknowledgment). The data model and trigger engine live in Lab-Lite. The display component lives in Patient-Lite. Guidance content is bundled in both apps.
- **Data minimization.** Guidance content contains no PHI. The trigger engine receives structured result values (same as Story 53.1 knowledge cards) — no patient identifiers. The distribution payload includes guidance content IDs, not the guidance text itself (both apps have the content bundled locally).
- **Versioned content updates.** When a physician updates a guidance message (e.g., new WHO malaria guidelines), the new version is bundled in the next app update. Old versions are retained in Dexie for historical reference — if a patient received guidance v1.0.0, that version is preserved in the delivery record.
- **Placeholder translations.** Initial seed data includes full English text. Dari, Pashto, and Arabic translations are marked with `[TRANSLATE]` prefix and will be filled by clinical translation partners. Audio is initially empty — placeholder until recordings are provided.

### References

- Epic 53 definition: `_bmad-output/planning-artifacts/epics.md` (Story 53.7)
- Result template data model: Story 42.4
- Result distribution: Story 42.6 (Write-Once Distribute-Many)
- Result authorization: Story 42.5
- Knowledge Cards trigger pattern: Story 53.1 (analogous pattern)
- Audit client: `apps/lab-lite/src/lib/audit-client.ts`
- Dexie database: `apps/lab-lite/src/lib/db.ts`
- Patient-Lite app: `apps/patient-lite-mobile/`
- i18n locales: en, ar, prs, ps
- CLAUDE.md: "All AI-generated clinical content requires a physician confirmation gate" (N/A — no AI)
- CLAUDE.md Rule #7: Lab Portal data minimization (first name + age only)
