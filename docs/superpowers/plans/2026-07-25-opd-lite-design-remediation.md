# OPD-Lite Design Remediation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development to execute batch-by-batch with review gates. Steps use `- [ ]` checkboxes.

**Goal:** Remediate the full design/UX audit of the OPD-lite PWA (~100 findings) to meet the Ultranos design system and best-practice bar, fixing 10 verified real bugs, the shared-primitive root causes, systemic token/type/radius/glassmorphism/side-stripe debt, per-screen UX, and i18n/RTL — with zero change to clinical logic or safety behavior.

**Architecture:** Fix shared primitives + tokens FIRST (one change cascades across pages), then the 10 verified bugs, then systemic sweeps, then per-cluster UX, then i18n/RTL, then verify. Shared-component changes go in `packages/ui-kit/src/` (rebuild after); app changes in `apps/opd-lite/src/`.

**Tech Stack:** Next.js 15, TypeScript, Tailwind v3 + oklch semantic tokens, ShadCN (ui-kit), next-intl (en/ar/prs/ps), Vitest, fake-indexeddb.

## Global Constraints (verbatim from design.md / CLAUDE.md — every batch obeys these)

- **Working tree only — no autonomous git commits.** Human commits. No `git add/commit/stash/reset`.
- **Source-level shared changes in `packages/ui-kit/src/`**, then `pnpm --filter @ultranos/ui-kit build`. App `@/components/ui/*` are thin proxies only.
- **Buttons:** ShadCN `Button` (pill radius baked in). No raw `<button>` except the sanctioned pill tab-bar (`type="button"`). No `rounded-md` on buttons.
- **Radius:** `rounded-xl` for containers/inputs/panels; `rounded-pill` for text buttons; `rounded-full` for icon buttons/avatars/badges-that-are-pills. Never `rounded-md`/`rounded-lg` on cards or inputs.
- **Cards:** one canonical `Card`. Never hand-roll a card div. No nested cards.
- **Color:** semantic oklch tokens ONLY (`bg-primary`, `text-destructive`, `bg-muted`, `text-*-foreground`, `bg-warning`, `text-success`, ...). NO hex, NO `red-500`/`amber-400`/`primary-600`-scale, NO `text-white`, NO `hsl()`, NO undefined tokens. Foreground text on a colored fill uses the `-foreground` pair (never same-color-on-same-color).
- **Type:** Manrope body / Public Sans heading. Weight 600 headings/values, 400 labels/body, **700 (`font-bold`) only for vital numbers**. **NO `font-black`, no billboard type** (cap ~text-2xl / 26px). Label-above-value. `tabular-nums` on all numbers/vitals/scores/dates/times.
- **States:** `EmptyState` for empty/no-results/zero-data; `Skeleton` for loading; `Alert` for warnings/errors. Never hand-roll these.
- **Bans:** side-stripe borders (`border-s-4`/`border-l-4` colored accents), gradient text, decorative glassmorphism (`backdrop-blur` where nothing to blur), hero-metric template, identical card grids, modal-as-first-thought, em dashes in UI copy, emoji-as-icon.
- **Safety (never change behavior):** Allergies FIRST/red/uncollapsed (Rule #4). Interaction "check unavailable" must be explicit, never silent "no interactions" (Rule #3). Tier-1 append-only + prescription-block (Rule #5). Audit every PHI access (Rule #6). Lab Portal name+age only (Rule #7). PHI never in logs.
- **i18n:** all user-facing strings via `useTranslations`, keys added to en/ar/prs/ps. RTL: logical props (`ms/me/ps/pe/start/end`), never `ml/mr/left/right`; `ps` (Pashto) is RTL.
- **Verify before done:** every batch runs `pnpm --filter opd-lite test`, `pnpm --filter opd-lite exec tsc --noEmit` (no NEW errors), and `npx impeccable --json apps/opd-lite/src` where relevant (expect 0 side-stripes at the end). Snapshot changes must be eyeballed as design-only before `-u`.

**Verification commands:**
- `pnpm --filter opd-lite test -- <filter>` / full `pnpm --filter opd-lite test`
- `pnpm --filter opd-lite exec tsc --noEmit`
- `pnpm --filter @ultranos/ui-kit build`
- `npx impeccable --json apps/opd-lite/src` (AI-slop detector; 0 findings = clean)

---

## ✅ EXECUTION STATUS (updated 2026-07-25) — read this first

Durable ledger: `.superpowers/sdd/progress.design-remediation.md` (per-batch record, deviations, deferrals).

**Verified green at last checkpoint:** full opd-lite suite **1132 pass + 1 todo / 125 files**; ui-kit **302 pass**. **HEAD unchanged — zero autonomous commits** (working-tree only). 9 snapshot files regenerated (all button/font/radius/glass/badge class-only diffs, each audited).

**COMPLETE:**
- **Phase A (foundations) — ALL DONE.** A1 Button consolidated onto ui-kit ShadCN (deviation: made opd-lite `Button.tsx` a compat **adapter**, not a thin re-export — 50 callsites use `primary/danger/warning/icon`+`fullWidth` that ui-kit doesn't expose; added `warning` variant to ui-kit button). A2 `conflict-red`→`destructive`. A3 appointment status colors de-duped (WalkInQueue imports shared map) + invisible `booked` fixed. Card kept as the app-local canonical (ui-kit has no Card).
- **Phase C sweeps — C1, C2, C3, C4, C5 DONE.** C1 26 `font-black`→semibold/bold (16 files). C2 92 `rounded-lg`→`rounded-xl` on inputs/containers (36 files; icons/skeletons/dots left). C3 (core): ResultTrendChart hex→`oklch(var(--token))` via inline style (dark-mode adaptive), `themeColor` blue→brand-green, **added missing `--destructive-foreground` token** (light+dark+preset; fixed pre-existing broken usages), 5 more invisible `bg-primary text-primary` badges + 7 `text-white` misuses fixed. C4 all colored side-stripes removed (+ raw `amber-400` killed). C5 decorative glass removed from 8 cards (CommandPalette scrim kept as purposeful overlay).
- **Phase B verified bugs — PARTIAL** (see per-batch STATUS below): B1 (invisible badges) DONE. B5 (register button) DONE. B7 (CLAUDE.md copy) DONE. B3 (interaction chip truthfulness) DONE via a safety fix — but a SIMPLER form than the plan text (see B3 note). B2/B4/B6/B8 NOT done.

**DEFERRED (flagged, not faked — do NOT treat as done):**
- **Consent-expiry banner (B4):** no per-patient consent-*expiry-date* source exists client-side (`useNavBadges` has only a count). Wiring needs new data plumbing = functionality change. Re-scope in D2 with a real source or leave banner unrendered; do NOT fabricate a date.
- **ActiveMedicationsList dosage/frequency `'--'` (B8):** genuine data limitation (dosage lives on linked `MedicationRequest`, not stored here). Address in D2 alongside the `'--'` banned-placeholder copy fix.
- **ALLERGY_MATCH severity styling (B8):** not started.
- **Legacy `primary-NNN` HSL scale (~37 usages):** renders fine (opd-lite local `tailwind.config` maps a primary 50–900 scale to `--color-primary-*`), so NOT a bug — but it's a parallel color system. Migrate to semantic tokens per-cluster in Phase D (shade→token needs judgment).

**RE-SEQUENCED — C6 is NOT a standalone sweep** (avoids double work):
- C6 **copy** half (em-dash `—` ~59, banned `'--'` placeholders, emoji-as-icon) → **fold into Phase E2**: these are mostly hardcoded English that E2 rewrites into message catalogs; write clean copy (no `—`/`--`) at extraction time.
- C6 **component-adoption** half (hand-rolled `role="alert"` divs, `animate-pulse`/`Loading...` → `Alert`/`Skeleton`/`EmptyState`; ~20 files, 14 already use `Alert`) → **fold into the Phase D per-cluster passes**, done in-context.

**REMAINING (in order):** finish the open Phase B items (B2, B4-as-scoped, B6, B8) → **Phase D1–D7** (per-cluster UX — the bulk; absorbs C6 component adoption + primary-scale migration) → **Phase E1–E2** (RTL correctness + i18n; absorbs C6 copy) → **Phase F** (verify + re-score).

**Known pre-existing (NOT introduced here, out of design scope):** `tsc --noEmit` has pre-existing type errors in `PatientResultTimeline`/`result-grouper` (`_ultranos` on `LocalDiagnosticReport`), `sync-queue`, `sync-pull`, `trpc.token`, `encounter-dashboard:909`. None are from these batches. Decide separately whether to fix.

---

# PHASE A — Foundations (shared primitives + tokens). Highest leverage.

### Batch A1 — Consolidate the Button onto ui-kit ShadCN (kills `rounded-md` app-wide)
**STATUS: ✅ COMPLETE** — done as a compat ADAPTER (not thin re-export; 50 callsites use variant vocab ui-kit lacks). Added `warning` variant to ui-kit button. Every `rounded-md`→pill. `components.test.tsx` assertion updated `rounded-pill`→`rounded-full`.
**Root cause:** `apps/opd-lite/src/components/ui/Button.tsx:18-23` — only `primary` is `rounded-pill`; `secondary/danger/warning/ghost/outline` are `rounded-md`.
- [ ] Verify the ui-kit ShadCN `button` (`packages/ui-kit/src/components/ui/button.tsx`) exposes the variants opd-lite uses (`primary`→map to `default`, `secondary`, `destructive`(=danger), `outline`, `ghost`, plus a `warning` and `icon`). If any are missing (esp. `warning`, `danger` alias, `success`, a destructive-ghost), ADD them to the ui-kit button CVA (all `rounded-full`/pill), rebuild ui-kit.
- [ ] Convert `apps/opd-lite/src/components/ui/Button.tsx` into a **thin re-export** of the ui-kit Button (map the app's variant names to ui-kit variants if names differ), OR change every local variant to `rounded-pill`/`rounded-full` and keep the API. Prefer the re-export.
- [ ] Run the full opd-lite test suite + tsc. Fix any variant-name mismatches. Snapshot diffs expected (radius on many buttons) — eyeball as radius-only, regenerate.
- [ ] `npx impeccable --json apps/opd-lite/src` to confirm no new findings.

### Batch A2 — Fix/replace the undefined `conflict-red` token + add any missing semantic tokens
**STATUS: ✅ COMPLETE** — `conflict-red`→`bg-destructive/20 text-destructive` (tinted, matches app convention); grep confirms `conflict-red` gone app-wide.
- [ ] `UnresolvedConflictsCard.tsx:44,52,58` — replace `bg-conflict-red`/`text-conflict-red` with `bg-destructive`/`text-destructive` and `text-white`→`text-destructive-foreground`. (B2)
- [ ] Grep the whole app for other undefined/non-semantic tokens introduced by drift: `grep -rnE "conflict-red|bg-\[#|text-\[#" apps/opd-lite/src`. Replace each with a semantic token.
- [ ] Run tests + tsc.

### Batch A3 — Reconcile Card + extract a shared status/interaction chip
**STATUS: ✅ CORE COMPLETE** — canonical Card = app-local `@/components/Card` (ui-kit has none). Appointment status-color maps de-duplicated (WalkInQueue now imports `appointment-colors.ts`); invisible `booked` fixed; `hover:bg-primary` full-opacity → `/20`. NOTE: a dedicated shared `<InteractionStatusChip>` was NOT extracted — instead the rail chip was made null-safe in place (see B3). Ad-hoc-card→`Card` sweep folded into Phase D/C6.
- [ ] Decide the canonical card: keep the app-local `@/components/Card` (`rounded-xl bg-card p-5 shadow-card ring-[0.65px] ring-border/50`) as the one true card OR adopt a ui-kit Card. Document the decision. Delete/redirect the third impl (`DashboardCustomizePanel` inline glass div → use `Card`).
- [ ] Extract a shared `<InteractionStatusChip status>` (tokens: CLEAR=`bg-success/20 text-success`, WARNING=`bg-warning/20 text-foreground`, BLOCKED=`bg-destructive/20 text-destructive`, UNAVAILABLE=`bg-muted text-muted-foreground`) used by BOTH `EncounterContextRail` and the encounter-dashboard pending-rx list (removes the duplicated inline maps). Give it `role="status"` + `aria-label`.
- [ ] Extract a shared status-pill helper if it reduces duplication (patients, appointments, walk-in, duplicate-review all hand-roll pills).
- [ ] Run tests + tsc + ui-kit build.

---

# PHASE B — The 10 verified bugs (many are one-liners once A1-A3 land)

### Batch B1 — Invisible `bg-primary text-primary` text (B1)
**STATUS: ✅ COMPLETE** — `booked` fixed in A3; 5 more (`LabReportDetail:214`, `LabResultsList:36`, `PatientResultTimeline:73,209`, `EncounterDetail:95`) → `bg-primary/20 text-primary` in C3. Grep clean (word-boundary excludes `text-primary-foreground`). NOTE: `ProfileCard.tsx:34` in the plan list was not found as an invisible pair — verify if it exists.
Replace `text-primary`→`text-primary-foreground` wherever it sits on a `bg-primary` fill:
- [ ] `apps/opd-lite/src/lib/appointment-colors.ts:29` (`booked`) and delete the duplicate map in `WalkInQueue.tsx:20-26` (import the shared one).
- [ ] `ProfileCard.tsx:34` (avatar initials).
- [ ] `EncounterDetail.tsx:95` (AI Generated badge).
- [ ] `LabResultsList.tsx:36` (amended/corrected badge).
- [ ] `DuplicateReviewTable` decision badge if same-color (verify).
- [ ] grep sweep: `grep -rn "bg-primary[^-/].*text-primary[^-]" apps/opd-lite/src` — fix any remaining.
- [ ] Tests + tsc.

### Batch B2 — Broken `bg-warning/10/50` class (B3)
**STATUS: ⬜ NOT DONE** — re-verify the exact broken token first (grep `grep -rnE "bg-warning/[0-9]+/[0-9]+|/10/50" apps/opd-lite/src`); the line numbers below are pre-edit and have shifted after C1/C2.
- [ ] `PatientResultTimeline.tsx:197` and `MpiResultModal.tsx:155` — `bg-warning/10/50` → `bg-warning/10`. Tests + tsc.

### Batch B3 — Pinned interaction-status chip truthfulness (B4, safety-legibility)
**STATUS: ✅ DONE (simpler scope than plan text).** Fixed the false-`UNAVAILABLE` bug: `encounter-dashboard.tsx` now passes `interactionModal.checkResult?.result ?? null`; `EncounterContextRail` prop is `InteractionStatus | null` and renders `null` as a neutral "none recorded" chip (NOT the rule-#3 UNAVAILABLE failure signal). +2 regression tests in `encounter-context-rail.test.tsx`. NOT done: deriving the chip from the WORST-of pending-prescription stored results (`pendingPrescriptions[]._ultranos.interactionCheckResult`). If that richer behavior is still wanted, do it here — otherwise mark this closed.
- [ ] (optional, richer) `encounter-dashboard.tsx` — derive `railInteractionStatus` from the WORST-of the pending prescriptions' stored interaction results (e.g. `pendingPrescriptions[]._ultranos.interactionCheckResult`), not the transient `interactionModal.checkResult`. When there are no pending prescriptions, show a neutral state (not `UNAVAILABLE`). Preserve Rule #3 (a genuine failed check still surfaces UNAVAILABLE).
- [ ] Add/adjust a test asserting the rail chip = CLEAR after a clean add and BLOCKED/UNAVAILABLE per the real per-rx state. Tests + tsc.

### Batch B4 — Dead consent-expiry banner + banner order (B5)
**STATUS: ⬜ DEFERRED-NEEDS-DATA + banner-reorder NOT done.** Do NOT fabricate a consent-expiry date — no per-patient expiry source exists client-side. Either (a) find/derive a real source (patient consent record) and wire it, or (b) leave the banner unrendered and note it. The banner REORDER + spacing cleanup is a safe design task that can proceed independently in D2.
- [ ] `PatientChartPage.tsx:170` — pass the real `consentExpiryDate` (derive from the patient consent data) to `PatientBannerStack`.
- [ ] `PatientBannerStack.tsx` — reorder to Allergy → Conflict → **Consent** → MPI → NID → Biometric; move stack spacing to `flex flex-col gap-4` on the wrapper and drop each banner's self `mb-4`.
- [ ] Verify allergy still first/red/uncollapsed (Rule #4) and the consent banner renders when a date is present. Tests + tsc.

### Batch B5 — Register button always visible (B6)
**STATUS: ✅ COMPLETE** — `showRegisterButton = sorted.length < 3` removed; Register CTA renders unconditionally. `patient-directory.test.tsx` 19 pass.
- [x] `PatientDirectory.tsx:348` — delete `showRegisterButton = sorted.length < 3`; render the Register button unconditionally in the header. Update the test. Tests + tsc.

### Batch B6 — Mount SwUpdateNotification (B7)
**STATUS: ⬜ NOT DONE.**
- [ ] `apps/opd-lite/src/app/[locale]/(app)/layout.tsx` — mount `<SwUpdateNotification />` alongside `<InstallPrompt />`. Also move the skip-to-content link to be the first focusable element in `SidebarInset`. Tests + tsc.

### Batch B7 — Remove "CLAUDE.md" from UI copy (B8)
**STATUS: ✅ COMPLETE** — the confirm-dialog copy now reads "Keeping both versions is recommended for allergies, active medications, and critical diagnoses." (no CLAUDE.md). Still hardcoded English → E2 will translate.
- [x] `ConflictDiffView.tsx:304` — rewrite the string to remove "CLAUDE.md" (e.g. "Keep Both is recommended for Tier-1 safety data (both versions are preserved)."). Route through i18n (Phase E will translate). Tests + tsc.

### Batch B8 — ALLERGY_MATCH severity + active-meds dose (B9, B10)
**STATUS: ⬜ NOT DONE.** ALLERGY_MATCH severity styling untouched. Active-meds dose is a real data limitation (see DEFERRED in status header) — address in D2, and replace the banned `'--'` placeholder there.
- [ ] `InteractionWarningModal.tsx:15-39` — add a distinct highest-severity style entry for `ALLERGY_MATCH` (strongest destructive treatment + a clear "ALLERGY" label), don't let it fall through to MAJOR. Verify the title branch already covers it.
- [ ] `ActiveMedicationsList.tsx:87-88` — wire real dosage/frequency from the medication data (remove the hardcoded `'--'`); if the data genuinely isn't available, render the med without a dead dose block and note the data gap in the report rather than showing empty `'--'` dose UI.
- [ ] Tests + tsc.

---

# PHASE C — Systemic sweeps (each is a scripted grep + review across the app)

### Batch C1 — `font-black` → weight scale (16 files)
**STATUS: ✅ COMPLETE** — 26 replacements/16 files (metric numbers→`font-bold`, headings/labels/badges→`font-semibold`); grep `font-black` = 0. (Note: `text-3xl`→`text-2xl` cap and `tabular-nums` additions in the sub-bullet were NOT applied — pick these up in the D per-cluster passes if wanted.)
- [x] For each of the 16 files (dashboard cards, `vitals-form`, `PrescriptionEntry`, `AllergyEntry`, `diagnosis-search`, `InteractionWarningModal`, `MpiResultModal`, `ConsentTextModal`, `RecentEncountersList`, `DashboardCustomizePanel`): replace `font-black` with `font-semibold` on headings/labels and `font-bold` on vital NUMBERS only; cap any `text-3xl`→`text-2xl`. Add `tabular-nums` to numeric values. grep-verify `font-black` count is 0.
- [ ] Tests + tsc (snapshots expected; eyeball type-only).

### Batch C2 — Inputs `rounded-lg`/`rounded-md` → `rounded-xl` (forms/vitals/SOAP/autocompletes)
**STATUS: ✅ COMPLETE (radius only)** — 92 `rounded-lg`→`rounded-xl` across 36 files (inputs + containers + alert boxes + selectable rows); icons/skeletons/dots left as `rounded-lg`. NOTE: routing raw inputs through the ShadCN `Input`/`Select` COMPONENTS (first sub-bullet) was NOT done — that is a D-cluster (D4/D6) component-adoption task.
- [x] Route registration fields through ShadCN `Input`/`Select` where feasible (PatientRegistrationForm, Name/Geography/Social/Emergency/Consent sections, KYC review inputs); otherwise change the raw input/select `rounded-lg`→`rounded-xl`.
- [ ] `vitals-form.tsx:22,104`, `soap-note-entry.tsx` AI-diff textareas + alert blocks, `InteractionWarningModal` textarea, Province/District autocomplete chip+input, LabResultsList rows, AppointmentSlot, WeekView cells, BookingModal chips → `rounded-xl` on containers/inputs (keep `rounded-full` for pills/chips-as-pills).
- [ ] grep-verify no `rounded-md`/`rounded-lg` remain on inputs/cards. Tests + tsc.

### Batch C3 — Non-semantic color scale + hardcoded colors → tokens
**STATUS: 🟡 CORE DONE, scale-migration DEFERRED to Phase D.** DONE: all hardcoded hex removed (ResultTrendChart→`oklch(var(--token))` inline style, dark-mode adaptive; `themeColor`→brand green); added missing `--destructive-foreground` token (fixed pre-existing broken usages); `text-white` on colored badges→semantic (`-foreground`/tinted); `PatientAvatar`/`bg-black` scrims LEFT (functional). STILL TO DO: the `primary-NNN` HSL scale migration (~37 usages) — renders fine, migrate per-cluster in Phase D. (`PatientAvatar` `hsl(<hash>)` palette + `EncounterHistoryList`/`PatientResultTimeline` `hover:bg-black/5`→`hover:bg-muted` also not yet done.)
- [ ] Replace `primary-50/100/200/400/500/600/700/800/900` scale usages with semantic tokens (`bg-primary/5|10|20`, `text-primary`, `bg-accent`, `focus:ring-ring`, `focus:border-primary`) across: appointments (WeekView, DayView, BookingModal, WalkInQueue, AppointmentSlot), encounter (`PrescriptionEntry`, `soap-note-entry`, `diagnosis-search`, `autosave-indicator`, CommandPalette), `RecentEncountersList`.
- [ ] Replace hardcoded `text-white`→`text-*-foreground` (WeekView:315,469; BookingModal:407; LabResultsList:199; NotificationPanel:82; dashboard cards).
- [ ] `PatientAvatar.tsx:19,59,64` — replace `hsl(<hash>)` bg + `text-white` + `bg-black/40` with a tokenized palette approach (a small set of semantic avatar tints, or `bg-muted text-foreground`); `EncounterHistoryList` `hover:bg-black/5`→`hover:bg-muted`; `PatientResultTimeline:125` same.
- [ ] `ResultTrendChart.tsx:32-36` FLAG_COLORS (`#16a34a/#d97706/#dc2626`) — this is data-viz (a sanctioned inline-SVG exception per CLAUDE.md), BUT they are generic tailwind hexes not brand colors. Replace with brand-aligned values read from CSS custom properties (`getComputedStyle` on `--success/--warning/--destructive`) or documented brand hex; keep the SVG. (Only if the timeline is wired in Phase D; else defer with the orphan decision.)
- [ ] grep-verify. Tests + tsc.

### Batch C4 — Side-stripe borders → bg-tint + icon/pill (4 sites)
**STATUS: ✅ COMPLETE** — `PatientResultTimeline` flagBorderClass→full border+tint (killed raw `amber-400`); `NotificationCenter` + `NotificationPanel` escalation→`ring-1 ring-inset ring-destructive/40`; `PatientAuditTrail` `border-s-2` KEPT (neutral timeline spine, not a colored accent). Grep: 0 colored side-stripes.
- [x] `NotificationCenter.tsx:247` + `NotificationPanel.tsx:198` — escalation `border-s-4 border-s-destructive` → `bg-destructive/10` row tint + a leading `AlertTriangle` (destructive) or a destructive pill. Unread: keep the dot, drop the heavy full-row `bg-primary/10` OR keep a subtle tint — not both at full strength.
- [ ] `PatientResultTimeline.tsx:40-41` — replace `border-s-4 border-s-destructive` / `border-s-4 border-s-amber-400` with a leading flag dot/pill + `bg-destructive/10`/`bg-warning/10` row tint (the component already has `flagDot`). Replace `border-s-amber-400`→`warning` token.
- [ ] `PatientAuditTrail.tsx:188` `border-s-2` timeline spine — if kept as a deliberate timeline rail, it's defensible; otherwise convert to icon+timestamp rows (Phase D covers the timeline redesign).
- [ ] `npx impeccable --json apps/opd-lite/src` → expect 0 `side-tab` findings. Tests + tsc.

### Batch C5 — Remove decorative glassmorphism
**STATUS: ✅ COMPLETE** — 8 cards made opaque (`ConflictList` ×2, `DashboardCustomizePanel`, `CandidateComparisonCard`, `NotificationPanel`, `NotificationCenter`, `EncounterHistoryList`, `PatientRegistrationForm` save-bar, + `UserDropdown` found during sweep). Only `CommandPalette` scrim retains `backdrop-blur` (purposeful overlay — kept intentionally).
- [x] `NotificationCenter.tsx:209`, `NotificationPanel.tsx:147`, `CommandPalette.tsx:100-109`, `EncounterHistoryList.tsx:330` (`bg-card/70 backdrop-blur-md`→`bg-card`), `ConflictList.tsx:99,116`, `CandidateComparisonCard.tsx:50`, `PatientRegistrationForm` save bar (`bg-background/95 backdrop-blur`→`bg-background` + `border-t`). Keep glass ONLY where a real overlay sits over content (none of these qualify).
- [ ] Tests + tsc.

### Batch C6 — Hand-rolled cards/alerts/loading/empty → Card/Alert/EmptyState/Skeleton + em-dash removal
**STATUS: 🔀 RE-SEQUENCED — do NOT run as one sweep.** Component-adoption bullets (alerts/loading/empty→`Alert`/`Skeleton`/`EmptyState`, cards→`Card`) → fold into the matching **Phase D** cluster. Copy bullets (em-dash `—`, banned `'--'`, emoji-as-icon) → fold into **Phase E2** (write clean copy when extracting to catalogs). The checkboxes below remain the authoritative CONTENT list for those two destinations.
- [ ] Replace hand-rolled alert boxes (`border-warning/30 bg-warning/10 ...` etc.) with `<Alert variant=...>`: `vitals-form` BMI box, `soap-note-entry` loading/error blocks, `DrugSafetyPanel`, `PrescriptionQR` error, `MfaManagementCard` offline/error, `login/reset` error boxes, `SyncAwareStaleDataBanner`, `ConflictBanner` (`rounded-lg border-2`→`Alert variant="destructive"`), `DataBudgetDashboard` cards→`<Card>`, `ConflictList`/`duplicate-review` loading/error.
- [ ] Replace bare `<p>Loading...</p>` with `<Skeleton>` and empty `<p>`/ad-hoc divs with `<EmptyState>`: dashboard cards (`RecentEncountersList`, count cards), `PatientChartPage` loading/not-found, `EncounterHistoryList`, `ActiveMedicationsList`, `PatientAuditTrail`, `LabResultsList` loading, `MfaManagementCard`, `reset-password` skeleton, `PatientDirectory` loading.
- [ ] Remove em dashes from UI copy everywhere (grep `grep -rn "—" apps/opd-lite/src --include=*.tsx` in JSX text/strings): replace with `·`, comma, colon, or `--` placeholder consistently. Replace emoji-as-icon (`⚠`,`✦`,`📋`,`ⓘ`,`✓`,`↑`,`↓`,`←`,`•`) with lucide icons from `@ultranos/ui-kit/icons`.
- [ ] Tests + tsc.

---

# PHASE D — Per-cluster UX improvements

**STATUS: ⬜ NOT STARTED — this is the bulk of the remaining work.** Each cluster ALSO absorbs: (a) the C6 component-adoption items for its files (`Alert`/`Skeleton`/`EmptyState`/`Card`), (b) the C3 `primary-NNN`→semantic-token migration for its files, (c) `tabular-nums` on its numbers. Use Mobbin (`mcp__Mobbin__search_screens`/`search_flows`) to benchmark each cluster before editing. Re-verify every `file:line` below against current source first — C1/C2/C3 shifted line numbers.

### Batch D1 — Dashboard
- [ ] `ClinicalDashboard.tsx:57-64` — remove the second `<h1>` welcome header (BreadcrumbHeader is the page header); if a greeting is wanted, make it a small non-heading line. Remove `mt-1`/`mt-2` direct-child margins.
- [ ] Rework the 4-up stat grid (`:92-97`) away from the identical hero-metric template: give each stat a lucide icon + differentiate the **Unresolved Conflicts** (Tier-1 safety) tile with destructive emphasis and order it first/prominently; quiet Fresha-style stats (weight ≤700, `tabular-nums`).
- [ ] Distinguish loading (Skeleton) vs zero (EmptyState) vs offline (Alert) in the count cards (currently all show `'—'`).
- [ ] Relabel/repurpose "Start Encounter" (it only focuses search) → "Find patient" or wire a real start-encounter flow.
- [ ] Reconcile `DashboardWidgetLayout` (unused parallel 3-col layout) — delete or wire.
- [ ] Tests + tsc.

### Batch D2 — Patient Chart
- [ ] Decide the orphaned lab timeline: WIRE `PatientResultTimeline`/`ResultTrendChart` into the chart (replacing/augmenting the flat `LabResultsList`) after Phase C strips its side-stripes/hex, OR delete them if the flat list is intended. If wired, re-skin per C3/C4.
- [ ] Redesign `PatientAuditTrail` as a real timeline (icon + label-above / timestamp) per the Clay/WorkOS benchmark; remove em-dash run-on rows; `Load more` → `Button`.
- [ ] `PatientHeaderCard` — "Start New Encounter" hand-rolled `<Link>` → `Button`/`buttonVariants`; baseline vitals label-above-value with `tabular-nums`; unify the name separator to `·`.
- [ ] `EncounterHistoryList` — drop the decorative glass (C5), add optional date grouping/time-rail; loading/empty via Skeleton/EmptyState; remove the stray `console.warn` (`:265`).
- [ ] Mobile rail-order: keep identity card on top below `lg`, drop meds/details/audit below the clinical flow (optional order tweak in `DetailLayout` consumers).
- [ ] Consider making the AllergyBanner genuinely sticky (its comment claims sticky but it scrolls) — a deliberate decision given Rule #4.
- [ ] Tests + tsc.

### Batch D3 — Encounter
- [ ] Rebuild `InteractionWarningModal` and `CommandPalette` on the ui-kit `Dialog` (remove hand-rolled focus-trap/`bg-black/50`/inline `<style>` keyframes; get focus-restore + a11y for free). Move keyframes to global CSS.
- [ ] Fix CommandPalette broken `assessment` target (no `id="assessment"`/`data-section="assessment"` exists → map to `soap-assessment`).
- [ ] Pending-rx rows: use the shared status chip (A3) and a list-row (not nested card).
- [ ] Drop the redundant in-flow identity card (rail already pins identity) OR make one the source.
- [ ] vitals out-of-range: add `aria-invalid` + a text/hidden "high/critical" label (not color-only).
- [ ] SOAP: stronger section grouping (S/O/A/P) per Heidi; keep the AI confirm gate (Rule #2) — reduce the AI button's visual dominance vs the note.
- [ ] Tests + tsc.

### Batch D4 — Patients + list surfaces
- [ ] `PatientDirectory` — use ShadCN `Input`/`Select` (retire raw ones; the `search-input` component exists); table wrapper `border`→`rounded-xl ring-[0.65px] ring-border/50`; sort `↑↓` glyphs → lucide `ChevronUp/Down` + `aria-sort`; allergy signal: lone 3px dot → destructive pill/`AlertTriangle`+label; name-segment ring-dots → plain space; stat strip icons + `tabular-nums` (from D-style de-hero-metric); remove `mt-4` on pagination; consider collapsing the 4 filter controls (status tab-bar + search on row 1; allergy/visit in a Filters popover).
- [ ] `patient-result-list` dashed `rounded-lg`→system; already uses EmptyState (keep).
- [ ] Tests + tsc.

### Batch D5 — Appointments
- [ ] Enlarge calendar cells (`WeekScheduleView:458` `h-7`→`min-h-11`, more padding) for legibility + 44px touch.
- [ ] `hover:bg-primary` full-solid → `hover:bg-primary/20` (colors + WeekView + AppointmentSlot).
- [ ] Fix the double empty-render: when `cellDataMap.size===0` render EmptyState INSTEAD of the full slot grid (WeekView mobile+desktop, DayView).
- [ ] Add a top-level "Book appointment" action (quick-book): a Sheet or an inline cell popover for the common path, keeping the full modal for "more options".
- [ ] `PatientSummaryPopup` status "dropdown" → ShadCN `DropdownMenu`; allergy prominence on day-schedule slots.
- [ ] Tests + tsc.

### Batch D6 — Register + KYC + Settings + Data-budget
- [ ] `PatientRegistrationForm` — add a page `<h1>`+description; reorder sections (Name → Demographics → Contact → Geography → then optional Photo/Social/Emergency grouped/collapsible → Consent); progressive-disclose the HMIS/social block; sticky save bar: add a secondary/Cancel action + on validate-fail scroll to first error + show error count; map raw transport errors to friendly localized copy; nested `EmergencyContact`/`PhotoSection` cards → sub-panels not bordered boxes; raw remove-`<button>`→`Button variant="icon"`.
- [ ] `MpiResultModal` → ui-kit Dialog; fix `bg-warning/10/50` (done B2); `tabular-nums` on score.
- [ ] KYC — fix shell violation (remove `mb-6`/`mb-8`, use `flex flex-col gap-4`); inputs `rounded-xl`; Select-File `<label>` styled as button → `Button`; loading→Skeleton; a real step/progress component; em dashes + i18n (Phase E).
- [ ] Settings — add a page title; move the disabled "Coming soon" PreferencesCard last; data-budget mini progress bar → `role="progressbar"`; `ProfileCard` avatar fixed in B1; `SessionInfoCard` countdown `tabular-nums`.
- [ ] `DataBudgetDashboard` hand-rolled cards → `<Card>`.
- [ ] Tests + tsc.

### Batch D7 — Conflicts + Duplicate-review + Notifications + Auth
- [ ] `ConflictDiffView` — strengthen safe/destructive hierarchy: keep "Keep Both" primary; visually demote/segregate Prefer-Local/Remote (secondary + warn affordance, or a separate "Advanced" group); humanize raw FHIR field keys (`medicationCodeableConcept`→friendly label); avoid `JSON.stringify` PHI blobs; add per-field "differs" label (not color-only); "CLAUDE.md" removed (B7).
- [ ] `ConflictList`/`duplicate-review` — glassmorphism removed (C5), loading/error/empty via Skeleton/Alert/EmptyState (C6).
- [ ] `DuplicateReviewTable` — consider WorkOS two-pane (list | detail) over expand-in-place; `tabular-nums` on scores.
- [ ] Reconcile the two notification UIs: make `NotificationPanel` (bell) reuse `NotificationCenter`'s i18n row + a single `notificationLabel` source; side-stripes done in C4.
- [ ] Auth — hoist the split-screen shell + brand panel into `(auth)/layout.tsx` (dedupe ~120 lines across login/forgot/reset); tone down decorative blobs + reduce the full-bleed primary panel (accent ≤10%); error boxes → `Alert`; `expiring-consents`/`kyc` silent-failure → `Alert` on fetch error (not "all clear").
- [ ] Tests + tsc.

---

# PHASE E — i18n + RTL (translate all hardcoded strings + fix RTL correctness)

**STATUS: ⬜ NOT STARTED.** E2 ALSO absorbs the C6 COPY cleanup: when extracting each hardcoded string to `messages/{en,ar,prs,ps}.json`, write clean copy — no em dashes (`—`), no `'--'` placeholders, no emoji-as-icon. Update next-intl test mocks/assertions that matched old English.

### Batch E1 — RTL correctness bugs (layout defects)
- [ ] `ProvinceAutocomplete.tsx:66` + `DistrictAutocomplete.tsx:30` — `isRtl` includes `'ps'` (currently omits Pashto → wrong script/side).
- [ ] `AppSidebar.tsx:25` — use `getDirection(locale)==='rtl'` instead of the hardcoded `['ar','prs','ps']` list; `nav-user.tsx:100,123,131,140` physical `ml-auto`/`mr-2`→`ms-auto`/`me-2`; dropdown `side` computed from direction not hardcoded `'right'`.
- [ ] Autocomplete chip/input `rounded-lg`→`rounded-xl` (done C2); confirm mixed-radius fixed.
- [ ] Tests + tsc (RTL snapshots).

### Batch E2 — Translate hardcoded English (all 4 locales) — clinical/safety components first
- [ ] Route ALL user-facing strings through `useTranslations` and add keys to `messages/{en,ar,prs,ps}.json` for: `ConflictBanner`, `ConflictList`, `ConflictDiffView`, `ActiveMedicationsList`, `PatientDetailsAccordion`, `PatientAuditTrail`, `EncounterHistoryList`, `EncounterDetail(Modal)`, `LabResultsList`, `LabResultDetail`, `LabReportDetail`, `BiometricStaleBanner`, `ConsentExpiryBanner`, `vitals-form`, `soap-note-entry`, `PrescriptionEntry`/`AllergyEntry`/`DrugSafetyPanel`/`DrugMonographSheet`/`PrescriptionQR`/`autosave-indicator`, `NotificationPanel`, `PatientSummaryPopup`, KYC page, `MfaManagementCard`, `SessionInfoCard`, `PatientPhotoSection` alt text, sidebar "Overview", auth footer/labels.
- [ ] `ConsentTextModal` — add the Pashto (`ps`) tab so a `ps`-consent patient can read it.
- [ ] Do this in sub-batches by cluster; each: add keys, wire `t()`, run that cluster's tests. Follow the suite's next-intl test mock (keys) — update assertions that matched old English to the keys.
- [ ] Full tests + tsc.

---

# PHASE F — Final verification + re-score

**STATUS: ⬜ NOT STARTED.** Note: `tsc --noEmit` has PRE-EXISTING errors unrelated to this work (see status header) — "no NEW errors" is the bar, not zero. `npx impeccable` may not be wired as an npm script; if `npx impeccable --json` fails, use the `/impeccable critique` skill or the grep sweeps below as the slop gate.
- [ ] `pnpm --filter @ultranos/ui-kit build` → `rm -rf apps/opd-lite/.next`.
- [ ] Full `pnpm --filter opd-lite test` green; `tsc --noEmit` no new errors; `pnpm --filter opd-lite lint`.
- [ ] `npx impeccable --json apps/opd-lite/src` → **0 findings** (no side-stripes, no slop).
- [ ] grep sweeps prove 0 remaining: `font-black`, `rounded-md`/`rounded-lg` on inputs/cards, `bg-primary[^-/].*text-primary[^-]`, `conflict-red`, `/10/50`, em dashes in JSX copy, `primary-[0-9]00` scale, `text-white`, `bg-black/`, `backdrop-blur` (except sanctioned).
- [ ] Re-run the 5-cluster critique (or the detector + a spot LLM pass) and confirm heuristic scores improved (target ≥32/40 per page).
- [ ] Walk every page LTR + RTL at desktop and `<lg`; confirm allergy-first/red, safety chips truthful, no invisible text.
- [ ] Summarize before/after.

## Self-Review
- Every audit finding maps to a batch: bugs B1-B10 (Phase B + A2/A3), systemic (Phase C), per-screen (Phase D), i18n/RTL (Phase E). Primitives (Phase A) precede everything so their cascade lands first.
- No clinical/safety logic is changed — only presentation, wiring of already-computed data (consent date, rail status source, active-med dose), and copy. Rules #3/#4/#5/#6/#7 preserved and re-verified in F.
- Batches are independently testable and reviewable; snapshot/test updates are design-only and eyeballed before `-u`.
