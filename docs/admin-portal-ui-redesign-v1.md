# Admin Portal — UI/UX Redesign v1 (Design Spec)

**Status:** Mockups approved (2026-09-30). Awaiting spec review → implementation planning.
**Scope:** `apps/admin-portal/` (~41 routes). Establishes a redesign design-language across six screen archetypes, to be rolled out page-by-page.
**Method:** Grounded in verified Playwright screenshots of the live app (`localhost:3003`), the redesigned **OPD Lite** reference (`localhost:3001`), the list-page remediation guide, and Mobbin research. Every mockup was rendered as real HTML wired to the actual ui-kit oklch tokens/fonts and screenshotted before approval.

> **Reframe (important):** the admin portal already passed a **list-page structural remediation sweep** (see `docs/opd-list-page-remediation-guide.md` §11 — merged to `ux-v1.5`). List pages already follow the standalone-h1 → search-first toolbar → one content box → pagination template, and the dashboard already uses uniform stat cards. This redesign is a **visual/UX elevation** on top of that, focused on the gaps that remediation did not address: a task-centric dashboard, power-user tables, richer detail/profile pages, sectioned forms with photo upload, token-based modals (retiring the green-header modal), and an enriched app shell.

---

## 1. Design language (applies to every archetype)

Consistent-sibling of OPD Lite — **same tokens/components/layout rules, adapted for admin's denser data**. Source of truth: `packages/ui-kit/src/tokens.css`.

- **Color:** oklch semantic tokens only (`bg-card`, `text-muted-foreground`, `ring-border/50`, `bg-primary`, `text-destructive`, `bg-warning/10`, `text-success`). Wise-green primary `oklch(0.527 0.154 150.069)`. No hardcoded hex / raw oklch in components.
- **Elevation:** content surfaces = `rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50`. `shadow-card` = `0 1px 3px oklch(0.145 0 0 / 0.06)` (light) / `none` (dark).
- **Typography:** Manrope (sans) + Public Sans (`font-heading`). **Mono numerals** app-wide via the "Space Mono Numeric" digit-only `@font-face` unicode-range trick (numbers render mono; letters fall through) — preserve it.
- **Status semantics:** Active/OK = `success`; pending/warning = `warning`; suspended/neutral = `muted`; critical/danger/allergy = `destructive` (red). Badges = `rounded-full bg-<sem>/10 text-<sem>`.
- **Shape/spacing:** page root `flex flex-col gap-4`, shell `<main>` provides `p-4` + `gap-4`; controls `h-9` (`rounded-full`) in toolbars, `h-10 rounded-lg` for form inputs; pill tabs `rounded-full`.
- **Layout rules (unchanged, non-negotiable):** full-width pages (no `mx-auto`/`max-w-*` on roots), one `BreadcrumbHeader`/`PageHeader` per page (shell-provided), no nested `<main>`, `gap-4` spacing.
- **Icons:** `@ultranos/ui-kit/icons` (lucide) subpath; `DirectionalIcon category="navigation"` mirrors in RTL, `category="medical"` never.
- **RTL:** logical properties only (`ps-*/pe-*`, `ms-*/me-*`, `text-start/end`, `end-*`). Every archetype must pass LTR + RTL snapshots.
- **ui-kit discipline:** shared changes go in `packages/ui-kit/src/` (rebuild for barrel/icons/hooks/utils; component subpaths are live). App files are composition + thin proxies only.

---

## 2. Approved archetype decisions

Mockup sources live in `c:\tmp\admin-mockups\` (disposable scaffold, served at `:8091`); screenshots in repo `admin-mockups-shots/`. Current-state evidence in `admin-current/`; OPD refs in `opd-ref/`.

### 2.1 Dashboard — **Option B "Triage / Focus"** (approved)
`admin-mockups-shots/dashboard-b.png`
- **Greeting hero** (date + "Welcome back, <name>" + role · org) borrowing OPD Lite's calm dashboard.
- **Needs Attention band** — a card of severity-colored actionable tiles (count + label): Pending invites (warning), Licenses expiring (destructive), Lab approvals, Active alerts, KYC submissions, Sync conflicts. Each links to the relevant page.
- **Compact KPI row** (4 cards, no charts): Total users, Active modules, Audit events 24h (Healthy), Providers.
- **Recent activity feed** (icon-dot rows) + **Quick actions** panel (Create user, Add module, Review KYC, View audit log).
- Maps to: `apps/admin-portal/src/app/[locale]/dashboard/page.tsx` + dashboard delegate components.

### 2.2 List / table — **Power table + stat strip on key directories** (approved)
`admin-mockups-shots/list-b.png` (+ stat strip from `list-a.png`)
- Keeps the list-page standard: standalone h1 → **search-first toolbar** (wide `SearchInput` → pill tabs → filter select(s) → folded primary action) → **one content box** → pagination below.
- **Power-table default:** row-selection checkboxes + a **floating bottom bulk-action bar** (`bg-foreground` pill: "N selected · <actions> · ✕"), plus a **"Columns"** show/hide control. Bulk actions per page (e.g. Users: Suspend / Assign role / Export / Delete).
- **Stat strip** (4 cards) added **only on primary directories** (Users, Providers, Patients, Labs); omitted on minor lists (invoices, suppliers).
- Table: `<thead class="bg-muted">` muted-uppercase headers, `<tbody>` transparent, rows `hover:bg-muted/50` (selected `bg-primary/5`), avatar cells, `rounded-full` role/status/MFA badges, per-row kebab.
- Bulk bar must be RTL-safe and offset for the sidebar. Reference impl to copy structure: `…/providers/page.tsx`.

### 2.3 Detail / profile — **Option B revised "OPD chart-inspired"** (approved)
`admin-mockups-shots/detail-b-v3-summary.png`, `…-sessions.png`
- **Tabs are part of the shadowed header card** (identity row + tab bar share one `rounded-xl … shadow-card` section, divided by a border) — matches OPD Lite's patient chart.
- Header identity row: avatar + name + meta line + a **text action ("Edit Profile") + a primary pill (e.g. "Manage Access")**.
- **"Summary" is the first/default tab**; grouped sections (Activity, Permissions, Sessions, Documents) live in their **own tabs and render only when clicked**.
- Summary content = contextual alert banner (e.g. "License expires in 21 days → View license", amber) + **main + right rail**; rail uses **UPPERCASE section labels** + right-aligned key-value rows (ROLE & ACCESS with status badge top-right, DETAILS key-value), mirroring OPD's ALLERGIES/DETAILS.
- **Patient-detail variant:** the **red allergy banner renders first**, above the header card (safety rule #4), replacing/preceding the contextual banner.
- Maps to: `users/[userId]`, `providers/profile/[practitionerId]`, `providers/[submissionId]`, `labs/[labId]`, `patients/[patientId]`, `staff/[practitionerId]/*`.

### 2.4 Create / edit form — **Sectioned + summary rail + clickable-avatar photo modal** (approved; minor tweaks later)
`admin-mockups-shots/form-revised.png`, `form-photo-modal.png`
- Full-width, **boxed section cards** (Profile, Role & access), **2-column field grid** (fixes the current 1200px-wide inputs), inputs `h-10 rounded-lg`.
- **Role picker = radio cards with descriptions + module tags** (Gorgias/Jobber style); selected = `border-2 border-primary bg-primary/5`.
- **Summary / help rail** (right, 1/3): live "New user summary" (name/role/module/dept/invite) + primary Create/Cancel + a "Secure onboarding" help card. Rail reserved for richer creation flows.
- **Clickable avatar** (hover "Edit" overlay + corner pencil badge) opens a **photo upload/edit dialog** (drag-&-drop zone, Choose file, Save/Cancel). No separate upload button.
- Maps to: `users/create`, edit forms, `settings`, `patients/merge`, `alerts/configuration`, `labs/create`, etc.
- **Minor tweaks noted for later** (per approval).

### 2.5 Modal / dialog — **Both by purpose; green-header retired** (approved)
`admin-mockups-shots/modal-a.png` (centered dialog), `modal-b.png` (side sheet)
- Token surface: `bg-popover`, `ring-[0.65px] ring-border/50`, soft shadow, dimmed `bg-foreground/40` backdrop, header (title + description + X), footer (Cancel + primary). **No custom green header.**
- **Centered `Dialog`** = confirmations + short forms (Add module, Suspend user, photo upload).
- **Side `Sheet`** (slides from inline-end, RTL-aware) = longer / context-preserving forms.
- Both already exist in ui-kit — composition, not new components. **Action item: replace the green-header `AddModuleDialog` and any similar custom modals.**

### 2.6 App shell — **Option A "Light + enriched topbar"** (approved)
`admin-mockups-shots/shell-a-final.png`
- **Light sidebar** retained (cross-app cohesion with OPD Lite): grouped nav, org switcher header, trial card, **profile menu in the footer**.
- **Enriched topbar:** sidebar toggle + breadcrumb + **global ⌘K search** ("users, patients, labs, invoices…") + **Synced** connectivity pill + **notification bell with badge** + language selector. **No avatar in the topbar** (it would duplicate the sidebar-footer profile — removed per review).
- Global search implies a command-palette (⌘K) — new shared component, likely in ui-kit.
- Maps to: `apps/admin-portal/src/components/AuthGuard.tsx` shell + `AppSidebar` + topbar/BreadcrumbHeader.

---

## 3. Rollout plan (post-approval)

1. Land the **shell** (topbar enrichment + ⌘K search) first — it frames every page.
2. **Dashboard** (Triage/Focus).
3. **List pages** — apply power-table + stat strip (primary directories first: Users, Providers, Patients, Labs), then remaining lists.
4. **Detail pages** — tabbed header + Summary-first (start with Users, Providers; patient variant gets allergy-first banner).
5. **Forms** — sectioned + rail + photo modal (Users create/edit first).
6. **Modals** — retire green-header; adopt Dialog/Sheet by purpose across the app.
7. Each page: verify LTR + RTL, light + dark, i18n 4-locale parity (en/ar/prs/ps), typecheck + tests, and **render + screenshot every page** (don't claim from code).

## 4. Constraints & guardrails
- **Healthcare safety:** allergy-first on any patient-facing detail; never reduce allergy prominence; drug-interaction "check unavailable" warnings preserved; consent enforcement + audit on PHI reads unchanged (UI redesign must not remove them); no PHI in logs.
- **No autonomous commits.** ui-kit changes are source-level (+ rebuild for barrel). Parallel file-mutating agents each need their own worktree.
- **Verify before claiming** — every "done" backed by a render/test.

## 5. Open items
- Minor form tweaks (deferred, per approval).
- Exact ⌘K command-palette scope (entities searchable, keyboard nav) — define during shell implementation.
- Whether bulk actions apply to every list or a curated set — decide per page during rollout.
