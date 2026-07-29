# Pharmacy-Lite UI/UX Remediation Report

**Scope:** Bring every non-auth page of `apps/pharmacy-lite` up to the OPD-Lite "Notifications" design standard (per `docs/opd-list-page-remediation-guide.md`).
**Branch/worktree:** `pharmacy-lite-ux-v2` (isolated worktree `C:\tmp\pharm-ux`). **Not committed** — left in the working tree.
**Verification method:** live authenticated dev server on CORS-allowed port `:3007`, screenshotted + reviewed every non-auth page (Playwright), plus typecheck / test / lint / i18n-parity gates.

---

## Per-page outcome (21 non-auth pages — all screenshotted & reviewed)

| # | Route | Class | Outcome |
|---|-------|-------|---------|
| 1 | `/` (dashboard) | Dashboard | **Changed** — removed `mx-auto max-w-3xl` (now full-width), added standalone h1, made the 3 action tiles (Scan QR/Paper Rx/Walk-in) uniform (were amber/green/grey), made the 3 KPI cards uniform `bg-card` (Today's Dispensing & Inventory were green-tinted). |
| 2 | `/scan` | Form (QR scan) | **Changed** — standalone h1; content panels `rounded-2xl`→`rounded-xl` + box idiom. Scan/verify state machine untouched. |
| 3 | `/history` | Search-first | **Changed** — standalone h1; filter bar + "Shift Summary" folded into one toolbar row; table → single content box; centered boxed empty. |
| 4 | `/queue` | Hybrid (tabs+list) | **Changed** — added standalone h1; tabs → pill tab-bar + search toolbar; card list; boxed centered empty; **regression test added** (toolbar visible when empty). |
| 5 | `/inventory/catalog` | Search-first | **Changed** — h1 `font-semibold`; search in toolbar; each table in box idiom; centered boxed empty; hardcoded English → i18n keys. |
| 6 | `/inventory` (overview) | Hybrid | **Changed** — h1 `font-semibold`; "Receive Stock" folded into toolbar + search; `StockAlertPanel` cards made uniform; `StockTable` → box idiom. |
| 7 | `/inventory/count` | Form | **Changed** — h1 `font-semibold`; choice grid + recent-counts table in box idiom; centered EmptyState for no recent counts. |
| 8 | `/inventory/suppliers` | List/table | **Changed** — standalone h1; All/Active tabs + search + "Add Supplier" folded toolbar; one content box; filtered vs no-data empties; create/edit views made full-width. |
| 9 | `/inventory/transfers` | Card-grid list | **Changed** — h1 `font-semibold`; All/Active/Completed tabs + search toolbar (always visible; fixes early-return-hides-toolbar); boxed centered empties. Card affordances preserved (§5.8). |
| 10 | `/inventory/receive` | Form | **Changed** — h1 `font-semibold`; form + success card in box idiom; ad-hoc empty → EmptyState. |
| 11 | `/pos` | List + detail | **Changed** — h1 `font-semibold`; status pill tabs + invoice search; divide-y list in one box; detail "back to list" → `w-fit` ghost back button. |
| 12 | `/pos/accounts` | List + detail | **Changed** — standalone h1; account search toolbar; divide-y list in box; detail `w-fit` back button + box-idiom cards. |
| 13 | `/pos/cash-drawer` | Form/status | **Changed** — h1 `font-semibold`; drawer status + open-drawer form in box idiom; full-width. |
| 14 | `/reports` | Dashboard | **Changed** — h1 `text-2xl`; report cards → box idiom; discrepancy card keeps status-semantic tint. |
| 15 | `/settings` | Info cards | **Changed** — added standalone h1; 5 section cards `rounded-2xl`→box idiom; palette colors → semantic tokens. |
| 16 | `/settings/data-budget` | Dashboard | **Changed** — removed `mx-auto max-w-3xl`; back link → `w-fit` ghost; box-idiom cards; hardcoded `bg-red/yellow/green-500` → `destructive/warning/success`; thead `bg-muted`. |
| 17 | `/sync` | Dashboard | **Changed** — h1 `text-2xl`; status cards uniform; list sections in box idiom; centered EmptyState. |
| 18 | `/controlled` | Hybrid table | **Changed** — h1 `font-semibold`; From/To date filters + search in one toolbar; register table → box idiom; centered boxed empty. Columns/balances untouched (safety-critical). |
| 19 | `/unverified` | List/table (clinical) | **Changed** — h1 `font-semibold`; Pending/Resolved → pill tabs + search; table(s) → one box; centered empties. Every column preserved. |
| 20 | `/paper-rx` | Form (OCR) | **Changed** — standalone h1; content panels `rounded-2xl`→`rounded-xl`; palette → semantic tokens; **Rule #3 "no interaction check" banner recolored primary→warning** for correct caution semantics. Confirmation gate & "Manual Verification Required" banner preserved. |
| 21 | `/register-patient` | Form | **Changed** — removed `mx-auto max-w-3xl` (full-width); standalone h1. Form already used the Card box idiom; validation/MPI untouched. |

**Auth pages skipped (per spec):** `/login`, `/forgot-password`, `/reset-password`.

---

## i18n

- **44 new keys** added across namespaces `procurement, transfers, pos, unverified, controlled, inventory, queue` (search placeholders, tab/filter labels, filtered-empty title/description/clear, a few migrated hardcoded strings, `queue.title`).
- Added to **all four locales** (`en, ar, prs, ps`), preserving each file's **CRLF + trailing-newline** convention (round-trip injector).
- **Parity: missing 0 / extra 0** for ar, prs, ps (verified programmatically).
- ar/prs/ps values are **machine-translated** and flagged for native review in `apps/pharmacy-lite/messages/TRANSLATION_REVIEW.md` (44 keys × 3 locales).

---

## Verification gate (final numbers)

- **Typecheck:** `0` errors in any touched source file. 7 residual `error TS` all in pre-existing `src/__tests__/*.test.ts` (drug-catalog-trpc, krl-sync-worker, medication-dispense, phi-cleanup, prescription-verify) — unmodified by this work.
- **Tests:** **530 passed / 530 (59 files)**. Added regression test *"keeps the toolbar (tabs + search) visible when the list is empty"* (PrescriptionQueueView). Updated 2 paper-rx RTL snapshots (layout-only diff: h1 added, radii, blue→warning; both safety banners preserved — verified in the diff). 1 unhandled `HTMLCanvasElement.getContext` error is a pre-existing jsdom limitation (no test fails).
- **Lint:** touched files clean (removed 2 stale `eslint-disable` directives I'd otherwise surface). 4 residual errors are all in files never modified here (2 pre-existing test files + `ClientErrorBoundary.tsx`), git-confirmed unchanged.
- **i18n parity:** missing 0 / extra 0 (ar/prs/ps).
- **Visual:** every one of the 21 non-auth pages rendered on the live authed server and reviewed (before/after where applicable).

---

## Pitfall sweep (guide §6) — worktree results

- Black/inverted table headers: **0** (all `bg-black`/`bg-foreground` hits are modal-overlay backdrops, legitimate).
- `rounded-3xl`: **0**. Content-card `rounded-2xl` normalized to `rounded-xl` on remediated pages (banners/pills intentionally left `rounded-2xl`).
- `bg-popover` / `bg-background` on table bodies: **0**.
- Nested `<main>`: **0**. Hex/oklch in tsx: **0**. Direct `lucide-react` imports: **0**.
- `mx-auto`/`max-w-*` on page/delegate roots: **0** remaining (3 removed: dashboard, data-budget, register-patient; suppliers create/edit).
- RTL: no `text-left/right`, `pl/pr/ml/mr` on content (only sidebar, excluded).
- Back buttons: detail/back controls given `w-fit px-0` (pos, accounts, data-budget).

---

## Escalations / notes (not silently changed)

1. **Pre-existing hardcoded Tailwind palette colours** (NOT introduced here, left as-is to avoid focus-state regressions): `border-blue-400 ring-blue-400` focus rings and `bg-blue-50` highlights across `registration/*` (NameInputSection, GeographySection, ConsentSection, PatientRegistrationForm), `shared/ProvinceAutocomplete`/`DistrictAutocomplete`, `patient/PatientEditModal`, plus status-badge tints in `TransferCard` (purple/teal), `QueueItemCard` (`border-red-300`), `MedicationLabel`, `OfflineGraceForm`, `ManualRxEntry`, `MpiResultModal`, and the `DataBudgetIndicator` header widget. These are semantic-token debt outside the layout sweep — recommend a dedicated token pass.
2. **paper-rx Rule #3 banner** recoloured `primary`(green)→`warning`(amber): green read as reassuring for a "no interaction check performed" caution. Prominence unchanged; the non-dismissible destructive "Manual Verification Required" banner is untouched.
3. **PosPage line ~61** pre-existing dead code `t('unknown' as never) ?? 'Unknown'` (flagged by subagent, not touched — behavioural).
4. **DrawerStatusCard** has a hardcoded `"Open since {time}"` string (no i18n key) — flagged for a future i18n pass.
5. **3 snapshot files** (FulfillmentChecklist, LabelPreviewPanel, MedicationLabel) get rewritten with CRLF by `vitest run` on Windows — **content identical to HEAD** (`git diff --ignore-cr-at-eol` = empty); they normalise away on commit via autocrlf. Reverted in the tree; will re-appear only if the suite is re-run.

## Addendum — search-bar magnifier button (2026-07-29)

Added a **circular magnifier button at the inline-end of every search bar** (clickable to execute search), built from the design system.

- **New shared component:** `packages/ui-kit/src/components/ui/search-input.tsx` → `SearchInput` composes the ui-kit `Input` + a trailing circular `Button` (`variant="default"`, `size="icon-sm"`, base `rounded-full`) with the `Search` icon. Button sits at `end-1.5` (RTL-safe — right in LTR, left in RTL); input gets `pe-11` so text never runs under it. Registered as `@ultranos/ui-kit/components/ui/search-input` and ui-kit rebuilt. Additive — no impact on other apps.
- **`onSearch`** optional: called on click and on Enter. Live-filter bars omit it (button focuses the field; results already update as you type); fetch/typeahead bars wire it to run the search immediately.
- **Adopted on every search bar:** SuppliersPage, TransfersPage, PosPage, PatientAccountsPage, UnverifiedDispensesView, ControlledSubstancesView, PrescriptionQueueView, CatalogBrowsePage, StockOverviewPage, HistoryFilterBar (medication), CatalogSearchInput (typeahead used by Receive Stock + Stock Count — also upgraded from a native `<input>` to the ui-kit styling), and PatientSearchBar (dashboard "Find or Register Patient"; its loading spinner moved `end-3`→`end-11` to clear the button). Province/District autocompletes intentionally left alone (dropdown pickers, not search bars).
- **No new i18n keys** — button aria-labels auto-derive from each field's existing `aria-label`/`placeholder`.
- **Verified:** typecheck 0 new errors; tests 530/530; lint clean on touched files (`search-input.tsx` clean); screenshots reviewed on suppliers (toolbar), dashboard (patient search), receive (typeahead), history (compact filter-bar) — consistent circular magnifier, no crowding.

## Clinical-safety confirmation

No confirmation gate, drug-interaction check, allergy display, controlled-substance register column, or dispense/validation logic was modified. All changes are layout containers, headings, spacing, semantic-token colours, and toolbar/empty-state structure.
