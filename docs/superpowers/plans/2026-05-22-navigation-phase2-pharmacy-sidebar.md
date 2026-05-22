# Navigation Phase 2: Pharmacy-Lite Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade Pharmacy-Lite from the horizontal `AppShell` navbar to the new collapsible `Sidebar` component, add i18n nav keys, and create placeholder pages for `/controlled` and `/unverified` routes.

**Architecture:** Replace `AppShellWrapper`'s use of `AppShell` with the new `Sidebar` from `@ultranos/ui-kit`. Add two new route pages. The existing sign-out logic stays intact.

**Tech Stack:** React 18/19, TypeScript, Next.js 15, Vitest, next-intl, `@ultranos/ui-kit` Sidebar, Dexie.js

**Stories covered:** 37.4 (Sidebar upgrade), 37.5 (Controlled Substances — placeholder), 37.6 (Unverified Dispenses — placeholder)

**Note:** Stories 37.5 and 37.6 require dispense_reviews table queries and controlled substance data that may not exist yet. We create the page routes and basic UI structure; full data integration depends on the dispense schema having the required fields.

---

## File Structure

### New Files
- `apps/pharmacy-lite/src/app/[locale]/controlled/page.tsx` — Controlled substances page
- `apps/pharmacy-lite/src/app/[locale]/unverified/page.tsx` — Unverified dispenses page
- `apps/pharmacy-lite/src/components/pharmacy/ControlledSubstancesView.tsx` — Placeholder view
- `apps/pharmacy-lite/src/components/pharmacy/UnverifiedDispensesView.tsx` — Placeholder view

### Modified Files
- `apps/pharmacy-lite/src/components/AppShellWrapper.tsx` — Replace AppShell with Sidebar
- `apps/pharmacy-lite/messages/en.json` — Add sidebar nav keys + controlled/unverified keys
- `apps/pharmacy-lite/messages/ar.json` — Same
- `apps/pharmacy-lite/messages/prs.json` — Same

---

## Task 1: Add i18n Keys

**Files:** `apps/pharmacy-lite/messages/{en,ar,prs}.json`

- [ ] **Step 1: Add sidebar, controlled, and unverified keys to en.json**

Add to `en.json` top-level:
```json
"sidebar": {
  "dashboard": "Dashboard",
  "scanRx": "Scan Rx",
  "paperRx": "Paper Rx",
  "queue": "Queue",
  "history": "Dispensing History",
  "controlled": "Controlled Substances",
  "unverified": "Unverified Dispenses",
  "syncQueue": "Sync Queue",
  "settings": "Settings"
},
"controlled": {
  "title": "Controlled Substances Log",
  "noRecords": "No controlled substance dispenses recorded",
  "date": "Date/Time",
  "patient": "Patient",
  "medication": "Medication",
  "schedule": "Schedule",
  "prescriber": "Prescriber",
  "status": "Status",
  "dispensed": "Dispensed",
  "flagged": "Flagged",
  "underReview": "Under Review"
},
"unverified": {
  "title": "Unverified Dispenses",
  "noRecords": "No unverified dispenses pending",
  "pending": "Pending",
  "resolved": "Resolved",
  "date": "Date/Time",
  "patient": "Patient",
  "medication": "Medication",
  "reason": "Grace Reason",
  "supervisor": "Supervisor",
  "approve": "Approve",
  "flag": "Flag",
  "approved": "Approved",
  "flagged": "Flagged"
}
```

- [ ] **Step 2: Add Arabic translations to ar.json**
- [ ] **Step 3: Add Dari translations to prs.json**
- [ ] **Step 4: Commit**

```bash
git add apps/pharmacy-lite/messages/
git commit -m "feat(pharmacy-lite): add i18n keys for sidebar, controlled substances, unverified dispenses

Refs: Epic 37, Stories 37.4, 37.5, 37.6"
```

---

## Task 2: Upgrade AppShellWrapper to Use Sidebar

**Files:** `apps/pharmacy-lite/src/components/AppShellWrapper.tsx`

- [ ] **Step 1: Read existing AppShellWrapper.tsx**

Current state: Uses `AppShell` from `@ultranos/ui-kit` with 5 nav items (Home, Scan, Queue, History, Sync).

- [ ] **Step 2: Replace AppShell with Sidebar**

Change import from `AppShell` to `Sidebar, type SidebarNavItem`. Add `useTranslations('sidebar')` for i18n labels. Add inline SVG icons for each nav item (same pattern as OPD-Lite AppSidebar). Configure nav items:

| Group | Label | Icon | Route | Badge |
|-------|-------|------|-------|-------|
| primary | Dashboard | LayoutDashboard | `/` | — |
| primary | Scan Rx | ScanLine | `/scan` | — |
| primary | Paper Rx | FileText | `/paper-rx` | — |
| primary | Queue | ClipboardList | `/queue` | Active count from sync store |
| clinical | Dispensing History | History | `/history` | — |
| clinical | Controlled Substances | ShieldAlert | `/controlled` | — |
| clinical | Unverified Dispenses | AlertCircle | `/unverified` | — |
| system | Sync Queue | RefreshCw | `/sync` | Failed count from sync store |
| system | Settings | Settings | `/settings` | — |

Keep the existing sign-out logic, SyncPulse, and SyncCapacityBanner. Move SyncPulse to sidebar footer syncIndicator slot.

- [ ] **Step 3: Build to verify**

Run: `pnpm -F pharmacy-lite build`

- [ ] **Step 4: Commit**

```bash
git add apps/pharmacy-lite/src/components/AppShellWrapper.tsx
git commit -m "feat(pharmacy-lite): upgrade navigation to collapsible sidebar with badges

Replace horizontal AppShell navbar with collapsible Sidebar. Add
controlled substances and unverified dispenses nav items. Badge
counts from sync store drive urgency on Queue and Sync Queue items.

Refs: Epic 37, Story 37.4"
```

---

## Task 3: Create Controlled Substances and Unverified Dispenses Pages

**Files:**
- Create: `apps/pharmacy-lite/src/app/[locale]/controlled/page.tsx`
- Create: `apps/pharmacy-lite/src/app/[locale]/unverified/page.tsx`
- Create: `apps/pharmacy-lite/src/components/pharmacy/ControlledSubstancesView.tsx`
- Create: `apps/pharmacy-lite/src/components/pharmacy/UnverifiedDispensesView.tsx`

These are placeholder pages — they show the title, a table header structure, and an empty state message. Full data integration comes when the controlled substance schema and dispense_reviews queries are implemented.

- [ ] **Step 1: Create ControlledSubstancesView**

A client component showing the page title and an empty state. Uses `useTranslations('controlled')`.

- [ ] **Step 2: Create UnverifiedDispensesView**

A client component showing the page title and an empty state. Uses `useTranslations('unverified')`.

- [ ] **Step 3: Create page routes**

Both are thin wrappers rendering their respective view components.

- [ ] **Step 4: Commit**

```bash
git add apps/pharmacy-lite/src/app/[locale]/controlled/ apps/pharmacy-lite/src/app/[locale]/unverified/ apps/pharmacy-lite/src/components/pharmacy/ControlledSubstancesView.tsx apps/pharmacy-lite/src/components/pharmacy/UnverifiedDispensesView.tsx
git commit -m "feat(pharmacy-lite): add controlled substances and unverified dispenses pages

Placeholder pages for /controlled and /unverified routes with empty
state messaging. Full data integration pending dispense schema work.

Refs: Epic 37, Stories 37.5, 37.6"
```
