# Story 53.5: Confidence Inversion Principle

Status: review

## Story

As a lab system designer,
I want AI to be loudest when it's least certain,
So that false confidence is structurally impossible and uncertainty always triggers human review.

## Context

Traditional AI interfaces present high-confidence outputs prominently and suppress low-confidence outputs. In healthcare, this is dangerous — a quiet, uncertain AI output is more likely to be missed or assumed correct. The Confidence Inversion Principle flips this: the LESS confident the AI is, the LOUDER the alert. Low confidence triggers a full-screen red alert and mandatory human escalation. High confidence is presented subtly, because if the AI is very sure, there's less urgency for human attention.

This is a **cross-cutting concern** that applies to every AI feature in Lab-Lite:
- Story 53.3 (AI Anomaly Flagging)
- Story 53.4 (Tele-Consultation AI Formatter)
- Story 53.6 (AI Provenance Trail — confidence is a required field)
- Any future AI features

The principle is also **documented in the UI** — users see an explanation of why the system alerts more aggressively when less certain. This builds trust and sets correct expectations.

**PRD Requirements:** FR53 (brainstorm #17)
**Dependencies:** None (cross-cutting utility — should be implemented before or alongside Stories 53.3 and 53.4)

## Acceptance Criteria

1. [x] A `ConfidenceLevel` enum is defined with three values: `HIGH`, `MEDIUM`, `LOW`.
2. [x] UI treatment per confidence level is standardized:
   - HIGH confidence: subtle green indicator (small badge, no animation).
   - MEDIUM confidence: yellow banner with explanation text describing what the AI assessed and why confidence is moderate.
   - LOW confidence: red full-screen alert: "I cannot reliably assess this. Request human consultation." with a dismiss-requires-acknowledgment pattern.
3. [x] Below a configurable confidence threshold (default: `LOW`), the system auto-escalates to the ordering physician regardless of other notification rules.
4. [x] Every AI output in Lab-Lite includes a mandatory, visible confidence indicator. No AI output can be rendered without a confidence level.
5. [x] The principle is documented in the UI: a persistent info tooltip or section explaining "This system is designed to alert more aggressively when less certain."
6. [x] The confidence indicator component is reusable across all AI features (anomaly flags, consultation formatting, future AI features).
7. [x] Auto-escalation creates a priority notification for the ordering physician with the confidence level, AI output summary, and the escalation reason.
8. [x] The confidence threshold for auto-escalation is configurable via a settings constant (not hardcoded in components).
9. [x] All confidence-inverted displays are RTL-compatible and i18n-ready.
10. [x] Tests verify: correct UI treatment per confidence level, auto-escalation trigger at threshold, mandatory indicator enforcement.

## Tasks / Subtasks

- [x] **Task 1: Confidence Level Types & Configuration** (AC: 1, 8)
  - [x] Create `apps/lab-lite/src/lib/confidence.ts`:
    ```typescript
    export enum ConfidenceLevel {
      HIGH = 'HIGH',
      MEDIUM = 'MEDIUM',
      LOW = 'LOW',
    }

    /** Numeric score ranges for each confidence level */
    export const CONFIDENCE_THRESHOLDS = {
      HIGH: { min: 0.8, max: 1.0 },
      MEDIUM: { min: 0.5, max: 0.8 },
      LOW: { min: 0.0, max: 0.5 },
    } as const

    /** Confidence level at or below which auto-escalation is triggered */
    export const AUTO_ESCALATION_THRESHOLD: ConfidenceLevel = ConfidenceLevel.LOW

    /** Convert a numeric confidence score (0-1) to a ConfidenceLevel */
    export function scoreToLevel(score: number): ConfidenceLevel {
      if (score >= CONFIDENCE_THRESHOLDS.HIGH.min) return ConfidenceLevel.HIGH
      if (score >= CONFIDENCE_THRESHOLDS.MEDIUM.min) return ConfidenceLevel.MEDIUM
      return ConfidenceLevel.LOW
    }

    /** Check if a confidence level should trigger auto-escalation */
    export function shouldAutoEscalate(level: ConfidenceLevel): boolean {
      const order = { HIGH: 2, MEDIUM: 1, LOW: 0 }
      return order[level] <= order[AUTO_ESCALATION_THRESHOLD]
    }
    ```
  - [x] Unit tests for `scoreToLevel()` boundary values and `shouldAutoEscalate()`.

- [x] **Task 2: Confidence Indicator Component — Subtle (HIGH)** (AC: 2, 6, 9)
  - [x] Create `apps/lab-lite/src/components/ai/ConfidenceIndicator.tsx`.
  - [x] Props defined: `level`, `score?`, `context`, `onAcknowledge?`, `onEscalate?`, `showExplanation?`
  - [x] HIGH confidence rendering:
    - Small green badge with checkmark icon: "AI Confidence: High"
    - No animation, no prominent placement.
    - Expandable: click to see details (score, context).
  - [x] RTL-compatible, all text via `useTranslations('confidence')`.

- [x] **Task 3: Confidence Indicator — Warning (MEDIUM)** (AC: 2, 6, 9)
  - [x] MEDIUM confidence rendering:
    - Yellow banner spanning the full width of the AI output container.
    - Displays: "AI Confidence: Medium — [context explanation]".
    - Shows the AI's assessment context and why confidence is moderate.
    - Warning icon (triangle with exclamation).
    - Not dismissible without reading (scrolling past counts as reading).

- [x] **Task 4: Confidence Indicator — Full-Screen Alert (LOW)** (AC: 2, 3, 6, 7, 9)
  - [x] LOW confidence rendering:
    - Red full-screen overlay (z-index above all content except navigation).
    - Header: "Low AI Confidence — Human Review Required"
    - Body: "I cannot reliably assess this. Request human consultation."
    - Context: what the AI was attempting and why confidence is low.
    - Two action buttons:
      - "I Acknowledge — I Will Review Manually" (requires explicit click, dismisses overlay).
      - "Escalate to Physician Now" (triggers auto-escalation notification).
    - The overlay cannot be dismissed by clicking outside or pressing Escape — only via the acknowledge button.
  - [x] On render, automatically trigger `onEscalate` callback if auto-escalation threshold is met and `onEscalate` is provided.

- [x] **Task 5: Auto-Escalation Notification** (AC: 3, 7)
  - [x] Create `apps/lab-lite/src/lib/confidence-escalation.ts`.
  - [x] Implement `triggerAutoEscalation(payload: EscalationPayload): void`
  - [x] Creates a priority notification via Hub API with type `AI_ESCALATION`.
  - [x] Notification is marked as `critical` priority — surfaces at the top of the notification panel.
  - [x] Emits audit event: `AI_AUTO_ESCALATION` with `sourceFeature`, `confidence`, `sampleId` (no PHI in metadata).

- [x] **Task 6: Principle Documentation UI** (AC: 5)
  - [x] Create `apps/lab-lite/src/components/ai/ConfidencePrincipleInfo.tsx`.
  - [x] Renders as tooltip variant (inline info icon) and panel variant (settings page card).
  - [x] Displayed as a dedicated section in the Lab-Lite settings page under "AI Behavior."
  - [x] All text via `useTranslations('confidence')`.

- [x] **Task 7: Mandatory Confidence Indicator Enforcement** (AC: 4)
  - [x] Create `apps/lab-lite/src/components/ai/AiOutputWrapper.tsx`
  - [x] Renders the `ConfidenceIndicator` above the children content.
  - [x] If `confidence` prop is missing or undefined, renders error state: "AI confidence level missing — output cannot be displayed."
  - [x] JSDoc documents that ALL AI outputs must be wrapped in `AiOutputWrapper`.

- [x] **Task 8: i18n Keys** (AC: 9)
  - [x] Added `confidence` namespace to `messages/en.json`: all 12 keys including high, medium, low, principle, escalation, missing
  - [x] Added `confidence` namespace to `messages/ar.json` (Arabic)
  - [x] Added `confidence` namespace to `messages/prs.json` (Dari)
  - [x] Added `confidence` namespace to `messages/ps.json` (Pashto)
  - [x] Added `aiBehavior` key to `settings` namespace in `en.json`

- [x] **Task 9: Tests** (AC: 10)
  - [x] Unit tests for `ConfidenceIndicator`: renders correct treatment per level (green/yellow/red). 20 tests.
  - [x] Unit tests for LOW confidence: overlay is not dismissible without acknowledgment.
  - [x] Unit tests for auto-escalation: `shouldAutoEscalate()` returns true for LOW, false for HIGH/MEDIUM. 15 tests.
  - [x] Unit tests for `AiOutputWrapper`: renders error state when confidence is undefined.
  - [x] Snapshot tests for all three confidence levels in both LTR and RTL. 8 snapshots.
  - [x] Unit tests for `ConfidencePrincipleInfo`: tooltip and panel variants. 6 tests.

## Dev Notes

- **Cross-cutting concern.** This story produces shared utilities and components consumed by Stories 53.3 (anomaly flagging), 53.4 (consultation formatter), and 53.6 (provenance trail). Implement this story before or in parallel with those stories.
- **The full-screen overlay for LOW confidence is intentionally intrusive.** In healthcare AI, a quiet low-confidence output is more dangerous than no output at all. The overlay cannot be accidentally dismissed — the tech must explicitly acknowledge that they will review manually or escalate to a physician.
- **Auto-escalation is a safety net, not a replacement for tech judgment.** The notification to the ordering physician says "An AI output with low confidence requires physician review" — it does not imply the AI found something wrong. The physician decides whether to act.
- **Configurable threshold.** The `AUTO_ESCALATION_THRESHOLD` defaults to `LOW` but can be raised to `MEDIUM` for higher-sensitivity environments. This is a code constant, not a user-facing setting (changing it has safety implications and should be a deployment decision).
- **No PHI in escalation notifications.** The escalation payload includes `sampleId` (opaque identifier) and `aiOutputSummary` (a description like "Anomaly detection on CBC result set" — never raw values or patient identifiers).
- **RTL considerations:** The full-screen overlay must center correctly in both LTR and RTL. The yellow banner text should align to `inline-start`. The green badge should appear at `inline-end` of the AI output.

### References

- Epic 53 definition: `_bmad-output/planning-artifacts/epics.md` (Story 53.5)
- AI Anomaly Flagging: Story 53.3 (consumer of this story)
- Tele-Consultation AI Formatter: Story 53.4 (consumer of this story)
- AI Provenance Trail: Story 53.6 (confidence is a required field)
- Notification system: `apps/lab-lite/src/components/notifications/`
- Audit client: `apps/lab-lite/src/lib/audit-client.ts`
- i18n messages: `apps/lab-lite/messages/en.json`
- CLAUDE.md: "All AI-generated clinical content requires a physician confirmation gate"

## Dev Agent Record

### Implementation Plan

Implemented following strict red-green-refactor TDD cycle. Each task: tests written first (RED), implementation made tests pass (GREEN), then refactored.

Key decisions:
1. `ConfidenceLevel` enum and pure utility functions isolated in `lib/confidence.ts` — no UI dependencies, safe for server/client import.
2. `ConfidenceIndicator` is a single component handling all three variants (HIGH/MEDIUM/LOW) via conditional rendering — avoids prop-drilling complexity.
3. LOW confidence overlay uses `useState(dismissed)` — overlay begins visible and only disappears after explicit acknowledge button click. Escape key and click-outside are deliberately NOT wired.
4. Auto-escalation fires in `useEffect` on mount when `level === LOW && onEscalate` is provided — ensures it always fires on first render, not just on button click.
5. `triggerAutoEscalation` in `confidence-escalation.ts` is fire-and-forget (void, never throws) — escalation must never block the clinical UI.
6. Hub API escalation (`lab.escalateAiResult`) is best-effort; the audit event is the primary record.
7. `ConfidencePrincipleInfo` supports two variants: `tooltip` (inline ℹ icon, used next to indicators) and `panel` (full card, wired into Lab Settings page under "AI Behavior").
8. `AiOutputWrapper` renders error state when `confidence` is `undefined`/`null` — blocks AI output display entirely, preventing silent unchecked outputs.
9. All 4 language files updated (en, ar, prs, ps) with RTL-aware Dari/Pashto text.

### Completion Notes

- **49 new tests** passing across 4 test files: `confidence.test.ts` (15), `confidence-indicator.test.tsx` (20), `confidence-principle-info.test.tsx` (6), `confidence-snapshots.test.tsx` (8)
- **8 snapshots** generated for LTR and RTL variants of all three confidence levels
- All pre-existing test failures confirmed as pre-existing (not introduced by this story)
- `LabSettingsView.tsx` updated to include AI Behavior section with `ConfidencePrincipleInfo` panel variant
- All ACs satisfied: enum ✓, UI treatments ✓, auto-escalation ✓, mandatory wrapper ✓, principle docs ✓, reusable components ✓, i18n/RTL ✓, configurable threshold ✓

## File List

### New Files
- `apps/lab-lite/src/lib/confidence.ts`
- `apps/lab-lite/src/lib/confidence-escalation.ts`
- `apps/lab-lite/src/components/ai/ConfidenceIndicator.tsx`
- `apps/lab-lite/src/components/ai/AiOutputWrapper.tsx`
- `apps/lab-lite/src/components/ai/ConfidencePrincipleInfo.tsx`
- `apps/lab-lite/src/__tests__/confidence.test.ts`
- `apps/lab-lite/src/__tests__/confidence-indicator.test.tsx`
- `apps/lab-lite/src/__tests__/confidence-principle-info.test.tsx`
- `apps/lab-lite/src/__tests__/confidence-snapshots.test.tsx`

### Modified Files
- `apps/lab-lite/messages/en.json` — added `confidence` namespace (12 keys) + `settings.aiBehavior`
- `apps/lab-lite/messages/ar.json` — added `confidence` namespace (Arabic translations)
- `apps/lab-lite/messages/prs.json` — added `confidence` namespace (Dari translations)
- `apps/lab-lite/messages/ps.json` — added `confidence` namespace (Pashto translations)
- `apps/lab-lite/src/components/settings/LabSettingsView.tsx` — added AI Behavior section + `ConfidencePrincipleInfo` import

## Change Log

- 2026-05-30: Story 53.5 implemented — Confidence Inversion Principle cross-cutting utility. Created 5 new source files, 4 test files, updated 5 existing files. 49 tests passing, 8 snapshots generated. Status → review.
