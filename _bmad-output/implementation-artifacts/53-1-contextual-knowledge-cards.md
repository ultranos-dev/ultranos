# Story 53.1: Contextual Knowledge Cards

Status: done

## Story

As a lab technician encountering an unfamiliar result pattern,
I want physician-curated reference cards to appear automatically based on my current result,
So that I have a textbook that opens to the right page without searching.

## Context

Lab technicians in low-resource settings often work alone without senior colleagues to consult. When an unusual result appears (e.g., WBC > 50,000 with blasts, critically low hemoglobin, dangerous electrolyte levels), the technician needs immediate contextual guidance. This story implements a pattern-matching engine that detects trigger conditions in structured result data and surfaces physician-authored reference cards in a non-intrusive side panel.

Critically, card content is **physician-authored only** — never AI-generated. This aligns with CLAUDE.md's safety rule: "All AI-generated clinical content requires a physician confirmation gate." Knowledge cards bypass AI entirely; they are static, versioned, human-written clinical references. The pattern-matching engine is deterministic (threshold-based), not AI/ML.

Cards are bundled offline in the PWA via Dexie, ensuring availability in disconnected environments. The trigger engine operates on the same structured result data used by Story 42.4 (Result Templates & Structured Data Entry) and integrates with the abnormal flagging engine from that story.

**PRD Requirements:** FR53 (brainstorm #13, #14)
**Dependencies:** Story 42.4 (Lab Result Templates — structured result data model), Story 12.3 (upload workflow)

## Acceptance Criteria

1. [ ] Given a tech enters or reviews a result, when the result matches a trigger pattern (e.g., WBC > 50,000 with blasts, severely low hemoglobin, critical electrolyte values), then a reference card appears in a side panel.
2. [ ] Each card displays: condition description, recommended actions (e.g., "IMMEDIATE referral required"), clinical context, author name, and version number.
3. [ ] All cards are physician-authored, named, and versioned — NOT AI-generated content. Cards include an `author` field with the physician's name/credentials and a `version` field in semver format.
4. [ ] Cards are bundled offline in the PWA via Dexie and available without network connectivity.
5. [ ] The card display is non-intrusive — appears as a collapsible side panel, not a modal blocker. The tech can dismiss or pin the card.
6. [ ] Multiple cards can match simultaneously (e.g., critical WBC + critical hemoglobin) — all matching cards are shown in a scrollable list.
7. [ ] Card content is i18n-ready with translations for all supported locales (en, ar, prs, ps).
8. [ ] The trigger pattern engine is deterministic (threshold-based rules), not AI/ML.
9. [ ] A "No cards matched" state is never shown — the panel simply remains hidden when no triggers fire.
10. [ ] All card views emit an audit event via `@ultranos/audit-logger` with card ID, trigger reason, and technician ID (no PHI in the audit payload).

## Tasks / Subtasks

- [x] **Task 1: Knowledge Card Data Model** (AC: 2, 3, 7)
  - [x] Create `apps/lab-lite/src/lib/knowledge-cards.ts` with type definitions:
    ```typescript
    interface KnowledgeCard {
      id: string                    // unique card identifier (e.g., 'KC-WBC-BLAST-001')
      title: string                 // i18n key for card title
      condition: string             // i18n key for condition description
      actions: string[]             // i18n keys for recommended actions
      clinicalContext: string       // i18n key for clinical context paragraph
      author: {
        name: string                // physician name (e.g., 'Dr. Ahmad Karimi')
        credentials: string         // e.g., 'MD, Hematopathologist'
        institution: string         // authoring institution
      }
      version: string               // semver (e.g., '1.0.0')
      lastReviewedAt: string        // ISO 8601 date of last physician review
      severity: 'critical' | 'warning' | 'informational'
      tags: string[]                // searchable tags for manual lookup
    }
    ```
  - [ ] Define the `TriggerRule` type:
    ```typescript
    interface TriggerRule {
      id: string                    // unique rule identifier
      cardId: string                // references KnowledgeCard.id
      conditions: TriggerCondition[] // all conditions must match (AND logic)
      description: string           // human-readable rule description (for debugging, no PHI)
    }

    interface TriggerCondition {
      fieldCode: string             // LOINC field code from result template
      operator: 'gt' | 'lt' | 'gte' | 'lte' | 'eq' | 'between' | 'present'
      value?: number                // threshold value
      valueRange?: { min: number; max: number } // for 'between' operator
    }
    ```
  - [x] Export a `KNOWLEDGE_CARD_REGISTRY` map keyed by card ID.
  - [x] Export a `TRIGGER_RULES` array of all trigger rules.

- [x] **Task 2: Seed Knowledge Cards** (AC: 2, 3, 4)
  - [x] Create initial card set covering critical patterns across the 8 LOINC categories:
    - CBC: WBC > 50,000 with blast-like differential (possible leukemia referral), Hemoglobin < 5 g/dL (severe anemia — immediate transfusion), Platelet < 20,000 (critical thrombocytopenia).
    - Electrolytes: Potassium > 6.5 mEq/L (hyperkalemia — cardiac risk), Sodium < 120 mEq/L (severe hyponatremia).
    - Liver panel: ALT > 10x ULN (acute hepatic injury).
    - Renal panel: Creatinine > 10 mg/dL (possible dialysis).
    - Malaria: Parasitemia > 5% (severe malaria — WHO protocol).
  - [x] Each card fully populated with author, version, clinical context, and action items.
  - [x] Add i18n keys to `messages/en.json` under a `knowledgeCards` namespace.

- [x] **Task 3: Trigger Pattern Engine** (AC: 1, 6, 8, 9)
  - [x] Create `apps/lab-lite/src/lib/trigger-engine.ts`.
  - [x] Implement `evaluateKnowledgeCardTriggers(resultValues: Record<string, number | string | null>, templateLoincCode: string): KnowledgeCard[]`. _(D1: ratified over spec name `evaluateTriggers` to avoid naming collision with Story 46.2's `learning-trigger-engine.ts`)_
  - [x] Filter trigger rules by template LOINC code compatibility.
  - [x] Evaluate each rule's conditions against the result values using the specified operators.
  - [x] Return all matching cards (may be empty array — no "no results" card).
  - [x] Unit tests: single trigger match, multiple simultaneous matches, no match (empty array), boundary values, null field handling.

- [x] **Task 4: Dexie Schema Update for Knowledge Cards** (AC: 4)
  - [x] Add `knowledge_cards` table to Dexie schema: `&id, version, severity, *tags`.
  - [x] Add `trigger_rules` table: `&id, cardId`.
  - [x] Create migration to next Dexie version (v41).
  - [x] Implement `seedKnowledgeCards()` function that populates cards and rules on first load.
  - [x] Version-check logic: if bundled card version > stored version, update the stored card.

- [x] **Task 5: Knowledge Card Side Panel Component** (AC: 1, 5, 6, 9)
  - [x] Create `apps/lab-lite/src/components/KnowledgeCardPanel.tsx`.
  - [x] Props: `cards: KnowledgeCard[]`, `onDismiss: () => void`, `onPin: (cardId: string) => void`.
  - [x] Renders as a right-side (or inline-end) collapsible panel, 320px wide.
  - [x] Each card renders: severity badge (color-coded), title, condition description, numbered action list, clinical context (collapsible), author attribution, version.
  - [x] Critical severity cards have a red left border and pulsing indicator.
  - [x] Panel auto-opens when cards are present, can be collapsed by the tech.
  - [x] RTL-compatible using logical CSS properties (`margin-inline-start`, `padding-inline-end`, etc.).
  - [x] All text via `useTranslations('knowledgeCards')`.

- [x] **Task 6: Integration with Result Entry** (AC: 1, 6)
  - [x] In the result entry form (Story 42.4), invoke `evaluateKnowledgeCardTriggers()` on every field change (debounced at 500ms).
  - [x] Pass matching cards to `KnowledgeCardPanel`.
  - [ ] Also evaluate triggers when viewing a completed result in read-only mode. _(deferred: read-only result view not yet identified; wire in the same pattern when that view is implemented)_

- [x] **Task 7: Audit Integration** (AC: 10)
  - [x] Add `reportKnowledgeCardView()` to `apps/lab-lite/src/lib/audit-client.ts`.
  - [x] Emit audit event when a card is displayed: action `KNOWLEDGE_CARD_VIEWED`, resource type `KNOWLEDGE_CARD`, metadata includes `cardId`, `triggerRuleId`, `severity` (no PHI — no patient identifiers, no result values).
  - [x] Follow existing pattern: never throw, fire-and-forget via `void emitClientAudit(input)`.

## Dev Notes

- **Physician-authored content only.** Cards are static clinical references, not AI-generated. The pattern-matching engine is deterministic threshold logic, not ML inference. This is explicitly outside the AI confirmation gate requirement because there is no AI involvement.
- **Trigger engine operates on structured numeric data only.** It receives `Record<string, number | string | null>` from the result entry form — never raw PHI, never patient identifiers.
- **Card content i18n:** Card titles, conditions, actions, and clinical context are stored as i18n keys, not raw text. Translations live in `messages/{locale}.json` under the `knowledgeCards` namespace.
- **Dexie versioning:** Cards are bundled in the app build and seeded into Dexie on first load. Version-check logic ensures updated cards replace older versions without losing user-pinned preferences.
- **Side panel placement:** Use logical CSS (`inset-inline-end`) so the panel appears on the correct side in both LTR and RTL layouts.
- **No PHI in audit:** Card view audit events log `cardId`, `triggerRuleId`, and `severity` — never patient ID, result values, or sample references.
- **Performance:** Trigger evaluation is O(rules * conditions) — with ~20 rules and ~3 conditions each, this is negligible. Debounce at 500ms during data entry to avoid re-evaluation on every keystroke.

### References

- Epic 53 definition: `_bmad-output/planning-artifacts/epics.md` (Story 53.1)
- Result template data model: Story 42.4
- Abnormal flagging engine: `apps/lab-lite/src/lib/abnormal-flags.ts` (Story 42.4)
- Audit client: `apps/lab-lite/src/lib/audit-client.ts`
- Dexie database: `apps/lab-lite/src/lib/db.ts`
- i18n messages: `apps/lab-lite/messages/en.json`
- CLAUDE.md safety rules: "All AI-generated clinical content requires a physician confirmation gate" (N/A here — no AI involved)

---

### Review Findings

> Code review conducted 2026-06-10. diff: `ux-v1.5 vs main` scoped to 53-1 files. 3 layers: Blind Hunter, Edge Case Hunter, Acceptance Auditor.

#### Decision Needed

- [x] [Review][Decision] **D1 — RESOLVED (A):** `evaluateKnowledgeCardTriggers` name ratified; spec updated to match. `learning-trigger-engine.ts` exports `evaluateTriggers`; both names now coexist without conflict.
- [x] [Review][Decision] **D2 — RESOLVED (A):** Wildcard `'*'` in TRIGGER_RULES is intentional. Field codes are the real clinical discriminant; wildcard provides a safety net for unknown/custom template LOINCs in low-resource environments.

#### Patch

- [x] [Review][Patch] Missing `knowledgeCards` i18n namespace in all 4 locales — `messages/en.json`, `ar.json`, `prs.json`, `ps.json` have 0 keys under `knowledgeCards`; every card title, condition, action, and UI chrome string will produce missing-translation errors at runtime [AC7, Task 2]
- [x] [Review][Patch] Task 4 entirely absent — no `knowledge_cards` or `trigger_rules` Dexie tables, no migration, no `seedKnowledgeCards()` function; cards exist only as in-memory constants, not bundled offline [AC4, Task 4] [apps/lab-lite/src/lib/db.ts]
- [x] [Review][Patch] Task 7 entirely absent — no `reportKnowledgeCardView()` in `audit-client.ts`, no `KNOWLEDGE_CARD_VIEWED` audit action; all card views are unaudited (CLAUDE.md Rule 6 violation) [AC10, Task 7] [apps/lab-lite/src/lib/audit-client.ts]
- [x] [Review][Patch] Task 6 entirely absent — `KnowledgeCardPanel` is never mounted in any result entry form or read-only result view; `evaluateKnowledgeCardTriggers` is never called from UI; no debounced trigger evaluation on field change [AC1, AC6]
- [x] [Review][Patch] `enteredAt` null poisons `.sort()` → `dateDiffInDays` receives `NaN` → skill_decay trigger silently never fires (Story 46.2 code in this diff) [apps/lab-lite/src/lib/learning-trigger-engine.ts:1049-1054]
- [x] [Review][Patch] `parseFloat("50abc")` returns `50` — malformed unit-suffixed strings (e.g. `"51k/uL"`) silently cross clinical alert thresholds; use `Number()` instead [apps/lab-lite/src/lib/trigger-engine.ts:40]
- [x] [Review][Patch] `between` operator has zero test coverage and zero production rules — inclusivity semantics (inclusive on both ends) are unverified and undocumented [apps/lab-lite/src/__tests__/trigger-engine.test.ts]
- [x] [Review][Patch] `present` operator has zero test coverage and no rule uses it — interaction with numeric `0` in composite rules is unvalidated [apps/lab-lite/src/__tests__/trigger-engine.test.ts]
- [x] [Review][Patch] `KC-CREAT-RENAL-001` author credentials are `MD, Hepatology` — copy-paste error from adjacent liver card; renal card requires nephrology/internal medicine specialty [apps/lab-lite/src/lib/knowledge-cards.ts:230]
- [x] [Review][Patch] Collapsed panel `max-h-12 overflow-hidden` can clip the collapse button itself on translated/long-label locales — no height transition defined, causing layout jump; no `aria-hidden` concern but visual regression risk [apps/lab-lite/src/components/KnowledgeCardPanel.tsx:509]
- [x] [Review][Patch] Misleading test name — `'returns empty array when template LOINC does not match and no wildcard'` asserts the opposite of what it tests; the wildcard always fires and the test only passes because values are below thresholds [apps/lab-lite/src/__tests__/trigger-engine.test.ts:161]
- [x] [Review][Patch] Hardcoded Tailwind color scale utilities (`bg-red-100 text-red-800`, `bg-amber-100`) in `SeverityBadge` — CLAUDE.md requires semantic oklch token classes (`bg-destructive/10 text-destructive` for critical); warning/informational variants need semantic equivalents [apps/lab-lite/src/components/KnowledgeCardPanel.tsx:344]
- [x] [Review][Patch] `key={idx}` used for card action list items — unstable key; use `actionKey` string as key instead [apps/lab-lite/src/components/KnowledgeCardPanel.tsx:440]

#### Deferred

- [x] [Review][Defer] Story 46.2 `learning-trigger-engine.ts` reads `db.lab_results` (PHI) with no audit event — CLAUDE.md Rule 6 violation; deferred to Story 46.2 review [apps/lab-lite/src/lib/learning-trigger-engine.ts:1029]
- [x] [Review][Defer] Story 46.2 `learning-trigger-engine.ts` `evaluateTriggers()` parameters are untyped (implicit `any`) — deferred to Story 46.2 review [apps/lab-lite/src/lib/learning-trigger-engine.ts:1019]
