# Admin-Portal UI/UX Remediation Report

**Scope:** every non-auth page in `apps/admin-portal/`, brought to the Ultranos page-layout standard
(`docs/opd-list-page-remediation-guide.md` + `docs/statbox-page-remediation-guide.md`) and **verified live**
on the running dev server (`http://localhost:3003`, authenticated via the shared session) with the Playwright MCP.

**Branch:** `ui-design-v2.0` · **Working tree:** main (no worktree, per instruction) · **Not committed** — left in the working tree for review.

---

## 1. Outcome per page

Legend: **changed** = edited & re-verified · **conformed** = already met the standard (verified, untouched) ·
**blocked** = couldn't be screenshot-verified (no seeded record in the test org) but remediated by code.

| Route | Class | Outcome | Notes |
|---|---|---|---|
| `dashboard` | stat-box | **changed** | Fixed malformed sublabel "oldest: d ago" → gated on `pendingLabApprovals > 0` + coerced null. Stat cards already uniform. |
| `providers` | table | **changed** | search → `SearchInput`. Reference-conformant otherwise. |
| `providers/expiry` | table | **changed** | search → `SearchInput`; **backend query fixed** (see §3). |
| `patients` | search-first | **changed** | search → `SearchInput`. |
| `patients/merge` | form | **changed** | duplicate-search → `SearchInput`; result card `rounded-2xl`→`rounded-xl`. |
| `labs` | table | **changed** | search → `SearchInput`. |
| `labs/create` | form | **conformed** | boxed form, `w-fit` back button, semantic tokens. |
| `labs/[labId]` | detail | **conformed** | equal cards, `w-fit` back, `sm` EmptyState. Verified via row-click. |
| `labs/[labId]/staff` | table | **changed** | search → `SearchInput`; back button given `w-fit px-0`; amber banner → `warning` tokens. |
| `certifications` | table | **changed** | search → `SearchInput`; `ExpiryWarningWidget` red/orange/amber → `destructive`/`warning`; **backend query fixed** (§3). |
| `inventory` | hybrid | **changed** | **split header removed** — tabs + "Create PO" folded into a toolbar row; PO table `thead`→`bg-muted`, dropped `tbody bg-background`, added `bg-card shadow-card`. |
| `inventory/suppliers` | table | **changed** | search → `SearchInput`. |
| `alerts` | list | **conformed** | two-level pills + boxed EmptyState. |
| `alerts/configuration` | form | **changed** | **raw Zod-error banner fixed** (root cause + friendly-message helper, §3); lime `Save` button → primary; thresholds table cleanup. |
| `alerts/[alertId]` | detail | **blocked** | no alert records in org. Audited: `w-fit` back button present. |
| `audit` | stat-box | **conformed** | uniform stat cards, boxed EmptyState. |
| `audit` → Event Browser | list | **changed** | native `<input>` "Search actor name…" → `SearchInput` + new i18n key `audit.searchActorPlaceholder`. |
| `network` | hybrid | **changed** | **split header removed** — actions folded into filter-tab row (dropped `size="lg"`); Outbreak separator `pt-6`→`pt-4`; **backend query fixed** (§3). |
| `mentorship` | hybrid | **changed** | stat cards `rounded-2xl`→`rounded-xl`, `bg-popover`→`bg-card`; search → `SearchInput`. Status tints kept (semantic, meaningful). |
| `ai-models` | stat-box | **changed** | **split header removed** — "Publish New Version" folded into the MODEL MANIFEST section header; tables: dropped `tbody bg-background`, added `bg-card shadow-card`, `hover:bg-primary/10`→`hover:bg-muted/50`. |
| `subscriptions` | hybrid | **conformed** | section-level actions (allowed); `bg-muted` table header. |
| `subscriptions/billing` | action | **conformed** | back link + boxed warning + action. |
| `subscriptions/invoices` | list | **conformed** | `w-fit` back link, status pills, boxed EmptyState. |
| `users` (All Users) | table | **changed** | search → `SearchInput`. |
| `users` (Lab Assignments) | table | **conformed** | verified via tab. |
| `users/create` | form | **conformed** | boxed form. |
| `users/[userId]` | detail | **conformed** | equal cards, `w-fit` back, semantic `destructive` action. Verified via row-click. |
| `settings` | form (tabs) | **conformed** | boxed sections, full-width. |
| `staff/[practitionerId]/health` | detail | **changed (blocked visual)** | hardcoded red/amber status map → `destructive`/`warning`; `rounded-lg`→`rounded-xl` on the alert. No seeded record to screenshot. |
| `staff/[practitionerId]/certifications` | detail | **blocked** | no seeded record. |
| `patients/[patientId]` | detail | **blocked** | no seeded record (search-first, empty org). |
| `providers/[submissionId]` | detail | **blocked** | no KYC submission in org. |
| `providers/profile/[practitionerId]` | detail | **blocked** | no seeded record. |

**Skipped (per spec):** `login`, `register`, `forgot-password`, `reset-password`, `[locale]/page.tsx` (landing), `staff/page.tsx` (redirect → `/users?tab=lab-assignments`).

---

## 2. Cross-cutting change — `SearchInput` migration

The written standard (§2g) mandates the shared `SearchInput` (input + trailing circular magnifier button); admin-portal
used a plain `Input` everywhere, including the pages cited as "already remediated." Per the user's decision, all **11 search
fields** were migrated to `@ultranos/ui-kit/components/ui/search-input`:

`providers`, `providers/expiry`, `patients`, `patients/merge`, `labs`, `labs/[labId]/staff`, `certifications`,
`inventory/suppliers`, `mentorship`, `users/_components/AllUsersTab`, `audit/EventBrowser`.

A thin proxy `apps/admin-portal/src/components/ui/search-input.tsx` was added (matching the app's ui-proxy convention).
Form inputs and the merge "type-to-confirm" field were intentionally left as `Input`.

---

## 3. Functional bugs fixed (user opted into "fix everything I can")

1. **`alerts/configuration` raw Zod-error banner** (documented §11 bug). **Root cause:** `SurveillanceConfigForm` called
   `listLabs.query({ limit: 500 })` but the endpoint caps `limit` at 100 → a server Zod error whose stringified issue-array
   was dumped into the UI (and it also made "Monitored Labs" show "No labs found"). **Fix:** `limit: 100`, plus a
   `toFriendlyMessage()` helper that extracts issue messages from any future Zod-array error. Verified: banner gone, real lab
   now lists, `Save` button is primary green.
2. **`dashboard` "oldest: d ago"** — `oldestPendingLabDays` is null when 0 pending → empty interpolation. Gated the sublabel
   on `pendingLabApprovals > 0` and coerced `?? 0`.
3. **`audit/EventBrowser`** hardcoded English `"Search actor name..."` → i18n key.
4. **Three backend `INTERNAL_SERVER_ERROR` endpoints** in `apps/hub-api/src/trpc/routers/admin.ts` (diagnosed by tagging the
   caught error with the real Postgres message and reading the live tRPC response):
   - `listExpiringProviders` (+ `exportExpiringProviders`): selected phantom `name`/`identifier`/`_ultranos` columns —
     the table uses flat `given_name`/`family_name`/`kyc_status`/`license_expiry`. **Real error:**
     `column practitioners._ultranos does not exist`. Rewrote select/order/filter/mapping to flat columns; added `org_id`
     scoping. (licenseNumber/issuingBody left blank — that data lives on `kyc_submissions`, not joined here.) **Verified.**
   - `getNetworkOverview`: selected `labs.last_sync_at` which doesn't exist. **Real error:**
     `column labs.last_sync_at does not exist`. Dropped the column, `lastSyncAt: null`. **Verified.**
   - `getExpiringCredentials`: used a PostgREST FK embed `practitioners!…_fkey(...)` with no cached relationship. **Real error:**
     `Could not find a relationship between 'certification_credentials' and 'practitioners' in the schema cache`. Rewrote to
     fetch scalar credential rows, then resolve pathway + practitioner names via separate `.in()` lookups joined in JS. **Verified.**

All three "Failed to load" banners are gone on screen.

---

## 4. Pitfalls encountered (mapped to guide §6)

- **#8 split header** on `inventory`, `network`, `ai-models` — folded actions into the toolbar / section header.
- **#6 radius / bg drift** — `rounded-2xl`/`rounded-lg` on content cards → `rounded-xl`; `bg-popover`→`bg-card`; `tbody bg-background` removed.
- **#2/#5 non-semantic colour** — amber/red/orange/lime hardcodes → `destructive`/`warning`/`primary` tokens.
- **#7 back button** without `w-fit` on `labs/[labId]/staff` → `w-fit px-0`.
- **SearchInput test gotcha** (guide §2g): field + magnifier share the accessible name → `getByLabelText` matched two
  elements. Updated `suppliers-toolbar.test.tsx` to `getByPlaceholderText` (design change kept, test aligned).

---

## 5. Verification numbers (vs baseline)

- **Typecheck** (`pnpm -F @ultranos/admin-portal run typecheck`): **315 errors = 315 baseline**, **0 new signatures**
  (line-stripped diff empty); admin-portal own-file errors **6 = 6**. The 26 shifted lines are identical pre-existing
  `../hub-api/*` errors moved by my edits.
- **Tests** (`pnpm -F @ultranos/admin-portal test`): **271 passed / 271 (43 files)** — green. One transient failure
  (`suppliers-toolbar`, the SearchInput accessible-name gotcha) fixed.
- **Lint**: **12 errors, all pre-existing** `no-unused-vars` (`locationId`, `RoleBadge`, `email` args, `formatDate`, `isRtl`)
  in files I did/didn't touch — **0 introduced by these changes** (attributed each error to its file/line).
- **i18n parity**: `ar / prs / ps` all **missing 0 / extra 0**; CRLF + trailing-newline preserved; new key flagged in
  `messages/TRANSLATION_REVIEW.md`.
- **Visual**: every non-auth top-level route reviewed before & after; changed pages re-screenshotted and confirmed
  against the reference spec. Data-empty detail routes could not be rendered (noted **blocked** above).

---

## 6. Escalations / open items (not changed here)

- **Data-empty detail pages** (`alerts/[alertId]`, `patients/[patientId]`, `providers/[submissionId]`,
  `providers/profile/[practitionerId]`, `staff/[practitionerId]/certifications` & `/health`): remediated by code but need
  a seeded record to screenshot-verify.
- **Pre-existing English-only strings** not part of the layout standard: the full `SurveillanceConfigForm` body, the
  `ExpiryWarningWidget` "Expiring in N days" labels, and a few modal warnings in `labs/[labId]/staff` are not i18n'd. Left
  as-is (out of the layout-remediation scope) — flag if full localization is wanted.
- **`listExpiringProviders` licenseNumber/issuingBody** now render blank because that data lives on `kyc_submissions`; wire a
  join if those columns are required in the expiry table.
- **hub-api typecheck baseline** (~cross-package errors, missing modules) is pre-existing and untouched.

**Files changed:** 23 source/test files + 4 message files + 1 new proxy (see `git status`). The hub-api change is in
`apps/hub-api/src/trpc/routers/admin.ts`.
