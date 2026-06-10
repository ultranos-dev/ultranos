# Story 51.5: RAG Readiness Board

Status: done

## Story

As a lab manager,
I want a single dashboard showing Red/Amber/Green status across all operational dimensions,
So that I can assess lab readiness at a glance.

## Context

Lab managers currently piece together operational readiness from multiple screens — staffing, equipment status, supply levels, QC results. This story consolidates everything into a single RAG (Red/Amber/Green) readiness board with four dimensions: Personnel, Equipment, Supplies, and QC. Each dimension has clear threshold-based RAG logic, drill-down navigation, and auto-refresh from local Dexie data. The board is designed to be wall-display friendly for continuous monitoring.

**PRD Requirements:** FR51 (brainstorm #47, #98)
**Dependencies:** Story 42.1 (RBAC) — provides staff/role data; Story 51.1 (Shift Handover) — provides shift session data for personnel status; Story 51.4 (Equipment Booking) — provides instrument status; Story 44.1 (Payment Collection) or supply tracking stories — supply data (may need stub/placeholder for v1)

## Acceptance Criteria

### AC 1: Four-Dimension RAG Display

**Given** operational data exists across multiple domains
**When** the manager opens the readiness board
**Then** four large cards are displayed, one per dimension, each with a RAG (Red/Amber/Green) status indicator:
- **Personnel:** staffing level relative to minimum
- **Equipment:** instrument operational status
- **Supplies:** reagent/consumable stock levels
- **QC:** quality control pass/fail status
**And** each card shows the dimension name, RAG color (full-card background or large indicator), and a one-line summary

### AC 2: RAG Calculation Logic — Personnel

**Given** the Personnel dimension is evaluated
**When** the board refreshes
**Then** the status is calculated as:
- **Green:** All scheduled techs present and on-shift
- **Amber:** 1 tech absent or on unplanned leave
- **Red:** Below minimum staffing threshold (configurable, default: 2 techs)
**And** the summary shows: "{present}/{total} techs on shift"
**And** drill-down shows individual tech status (on-shift, break, absent)

### AC 3: RAG Calculation Logic — Equipment

**Given** the Equipment dimension is evaluated
**When** the board refreshes
**Then** the status is calculated as:
- **Green:** All instruments in service, no maintenance overdue
- **Amber:** Maintenance due within 7 days on any instrument, or a non-critical instrument out of service
- **Red:** A critical instrument is out of service (test processing blocked)
**And** the summary shows: "{operational}/{total} instruments operational"
**And** drill-down shows each instrument's status, last maintenance date, and next due date

### AC 4: RAG Calculation Logic — Supplies

**Given** the Supplies dimension is evaluated
**When** the board refreshes
**Then** the status is calculated as:
- **Green:** All tracked supplies have >2 weeks of stock
- **Amber:** Any supply has <1 week of stock remaining
- **Red:** Any supply is at stockout (zero remaining)
**And** the summary shows the most critical supply status (e.g., "CBC reagent: 3 days remaining")
**And** drill-down shows all tracked supplies with current stock levels and estimated depletion dates

### AC 5: RAG Calculation Logic — QC

**Given** the QC dimension is evaluated
**When** the board refreshes
**Then** the status is calculated as:
- **Green:** All analyte QC checks passing within the current shift
- **Amber:** QC drift warning detected (Westgard rule violation warning)
- **Red:** QC check failed — results blocked for the affected analyte
**And** the summary shows: "{passing}/{total} analytes passing QC"
**And** drill-down shows each analyte's QC status, last run time, and any violations
**And** Red QC status includes a prominent "Results Blocked" warning

### AC 6: Drill-Down Navigation

**Given** a dimension card shows a RAG status
**When** the manager clicks/taps the card
**Then** a drill-down panel or page opens showing detailed status for that dimension
**And** the drill-down includes actionable items (e.g., "Contact absent tech", "Schedule maintenance", "Reorder reagent", "Re-run QC")
**And** the manager can navigate back to the board from the drill-down

### AC 7: Auto-Refresh and Wall Display Mode

**Given** the readiness board is displayed
**When** data changes in Dexie (new QC result, equipment status change, etc.)
**Then** the board auto-refreshes every 60 seconds from local Dexie data
**And** a "Wall Display" toggle switches to a large-font, high-contrast layout optimized for viewing from across the room
**And** wall display mode hides navigation chrome and shows only the four RAG cards with dimension names and summaries
**And** wall display mode auto-refreshes on the same 60-second interval

## Tasks / Subtasks

### Task 1: Dexie Schema — Supply Tracking (AC: 4)

- [ ] Add version increment to `apps/lab-lite/src/lib/db.ts` with new table:
  - `supply_inventory`: `&id, name, category, currentStock, unit`
- [ ] Define `SupplyItem` interface:
  - `id: string` (UUID)
  - `name: string`
  - `category: string` (e.g., "Reagent", "Consumable", "Control Material")
  - `currentStock: number`
  - `unit: string` (e.g., "tests", "mL", "kits")
  - `reorderThreshold: number` (stock level triggering Amber)
  - `criticalThreshold: number` (stock level triggering Red, default 0)
  - `dailyUsageEstimate: number` (for depletion date calculation)
  - `lastUpdated: string`
  - `updatedBy: string`

### Task 2: RAG Calculation Service (AC: 2, 3, 4, 5)

- [ ] Create `apps/lab-lite/src/lib/rag-service.ts`:
  - `calculatePersonnelRAG(): Promise<RAGDimensionResult>`:
    - Queries shift sessions and tech availability from Dexie
    - Counts present/absent techs
    - Compares against minimum staffing config
    - Returns `{ status: 'RED' | 'AMBER' | 'GREEN', summary: string, details: PersonnelDetail[] }`
  - `calculateEquipmentRAG(): Promise<RAGDimensionResult>`:
    - Queries instruments from Dexie
    - Checks operational status and maintenance dates
    - Returns RAG status with instrument details
  - `calculateSupplyRAG(): Promise<RAGDimensionResult>`:
    - Queries `supply_inventory` from Dexie
    - Checks stock against thresholds
    - Computes estimated depletion dates
    - Returns RAG status with supply details
  - `calculateQCRAG(): Promise<RAGDimensionResult>`:
    - Queries QC results from Dexie
    - Checks pass/fail status per analyte
    - Detects Westgard rule violations
    - Returns RAG status with QC details
  - `getFullRAGStatus(): Promise<RAGBoardState>`:
    - Calls all four calculators
    - Returns combined board state
    - Computes overall lab status (worst RAG across dimensions)
- [ ] Define `RAGDimensionResult` interface:
  - `dimension: 'PERSONNEL' | 'EQUIPMENT' | 'SUPPLIES' | 'QC'`
  - `status: 'RED' | 'AMBER' | 'GREEN'`
  - `summary: string`
  - `details: any[]` (dimension-specific detail array)
  - `updatedAt: string`

### Task 3: RAG Board UI (AC: 1, 7)

- [ ] Create `apps/lab-lite/src/components/readiness/RAGBoard.tsx`:
  - 2x2 grid of dimension cards (responsive: stack on mobile)
  - Each card: large RAG color indicator (background or left-border), dimension icon, name, summary text
  - Auto-refresh every 60 seconds via polling hook
  - "Wall Display" toggle button in header
  - Overall lab status indicator (worst RAG) at the top
  - Loading skeleton during initial calculation
  - Gated to SUPERVISOR+ via `useLabPermission`
- [ ] Create `apps/lab-lite/src/components/readiness/RAGDimensionCard.tsx`:
  - Individual dimension card component
  - Background color: green (#22c55e at 10% opacity), amber (#f59e0b at 10% opacity), red (#ef4444 at 10% opacity) — light backgrounds for readability
  - Large status dot (16px circle) with the RAG color
  - Dimension name (bold), summary (muted text)
  - Click handler to navigate to drill-down
  - RTL-safe layout with logical CSS properties

### Task 4: Wall Display Mode (AC: 7)

- [ ] Create `apps/lab-lite/src/components/readiness/RAGBoardWallDisplay.tsx`:
  - Full-screen layout, no sidebar or navigation
  - 2x2 grid with extra-large cards
  - Font sizes: dimension name 2xl, summary xl
  - High-contrast RAG colors (full saturation backgrounds with white text)
  - Clock display showing current time and last refresh time
  - Lab name in header
  - ESC key or tap to exit wall display mode
  - Auto-hides cursor after 5 seconds of inactivity

### Task 5: Drill-Down Views (AC: 6)

- [ ] Create `apps/lab-lite/src/components/readiness/PersonnelDrillDown.tsx`:
  - List of techs with status badges (On Shift, Break, Absent)
  - Shift start time and duration for on-shift techs
  - Action hints: "Contact absent tech" (informational, no click action for v1)
- [ ] Create `apps/lab-lite/src/components/readiness/EquipmentDrillDown.tsx`:
  - List of instruments with status and maintenance dates
  - Instruments sorted: out of service first, then by next maintenance date
  - Links to equipment page (Story 51.4)
- [ ] Create `apps/lab-lite/src/components/readiness/SupplyDrillDown.tsx`:
  - List of supplies with stock levels and estimated depletion dates
  - Color-coded stock levels (green/amber/red)
  - "Update Stock" button for each supply (editable stock count)
- [ ] Create `apps/lab-lite/src/components/readiness/QCDrillDown.tsx`:
  - List of analytes with QC status
  - Last QC run time and result
  - Westgard rule violation details if applicable
  - "Results Blocked" banner for failed analytes
  - Link to QC management (if available from Story 43.2)

### Task 6: Supply Inventory Management (AC: 4)

- [ ] Create `apps/lab-lite/src/components/readiness/SupplyManagement.tsx`:
  - CRUD for supply items (accessible from Supply drill-down or Settings)
  - Add supply: name, category, unit, current stock, reorder threshold, daily usage estimate
  - Update stock: quick edit for current stock count
  - Delete supply with confirmation
  - Gated to SUPERVISOR+ role
- [ ] Add supply management to Settings or as sub-page

### Task 7: Minimum Staffing Configuration (AC: 2)

- [ ] Add to `lab_config` table (from Story 51.3):
  - Key: `minimumStaffing`, default value: 2
  - Editable in Lab Settings by LAB_MANAGER
- [ ] Use in `calculatePersonnelRAG()` for Red threshold

### Task 8: Internationalization

- [ ] Add i18n keys to all 5 locale files (`apps/lab-lite/messages/{en,ar,prs,ps,fa}.json`):
  - `rag.readinessBoard`: "Lab Readiness Board"
  - `rag.personnel`: "Personnel"
  - `rag.equipment`: "Equipment"
  - `rag.supplies`: "Supplies"
  - `rag.qc`: "Quality Control"
  - `rag.green`: "Green — Operational"
  - `rag.amber`: "Amber — Attention Needed"
  - `rag.red`: "Red — Critical"
  - `rag.wallDisplay`: "Wall Display"
  - `rag.techsOnShift`: "{present}/{total} techs on shift"
  - `rag.instrumentsOperational`: "{operational}/{total} instruments operational"
  - `rag.analytePassing`: "{passing}/{total} analytes passing QC"
  - `rag.resultsBlocked`: "Results Blocked"
  - `rag.lastRefresh`: "Last refresh: {time}"
  - `rag.overallStatus`: "Overall Lab Status"
  - `rag.minimumStaffing`: "Minimum Staffing"
  - `rag.supplyManagement`: "Supply Management"

### Task 9: Testing

- [ ] Create `apps/lab-lite/src/__tests__/rag-service.test.ts`:
  - Test Personnel RAG: all present = Green, 1 absent = Amber, below minimum = Red
  - Test Equipment RAG: all operational = Green, maintenance due = Amber, critical down = Red
  - Test Supply RAG: all stocked = Green, low stock = Amber, stockout = Red
  - Test QC RAG: all passing = Green, drift warning = Amber, failed = Red
  - Test overall status uses worst dimension
  - Test depletion date calculation
- [ ] Create `apps/lab-lite/src/__tests__/rag-board.test.tsx`:
  - Test board renders four dimension cards
  - Test RAG colors applied correctly
  - Test auto-refresh polling interval
  - Test drill-down navigation on card click
  - Test wall display mode toggle
  - Test access control (SUPERVISOR+ only)
- [ ] Create `apps/lab-lite/src/__tests__/supply-management.test.tsx`:
  - Test add/edit/delete supply items
  - Test stock update
  - Test threshold-based RAG calculation

## Dev Notes

### Architecture Decisions

**All RAG calculations are performed locally from Dexie data.** No Hub API calls are needed — the board works entirely offline. This makes it reliable in the low-connectivity environments Lab-Lite targets.

**Supply tracking is introduced in this story as a simple inventory list.** A full procurement/ordering system is out of scope. Techs manually update stock counts. The `dailyUsageEstimate` field enables estimated depletion date calculations without requiring transaction-level consumption tracking.

**QC dimension requires QC data from Story 43.2 (QC Result Temporal Binding).** If that story is not yet implemented, the QC dimension should show "No QC data available" with a Grey/neutral indicator rather than Green (which would falsely imply QC is passing).

**Wall display mode is implemented as a separate component (`RAGBoardWallDisplay.tsx`).** When the toggle is activated, `RAGBoard` conditionally renders `RAGBoardWallDisplay` in place of the normal board (no separate route). The wall display component receives the current `boardState` as a prop and is read-only (no drill-down). This avoids CSS class toggling complexity and keeps the two layouts independently maintainable. The cursor auto-hides after 5 s of inactivity and is restored on exit. ESC exits wall display mode.

**The overall lab status is the worst RAG across all four dimensions.** If any dimension is Red, the overall status is Red. This is intentionally conservative — a single critical issue should be immediately visible.

### Files to Create

| File | Purpose |
|---|---|
| `apps/lab-lite/src/lib/rag-service.ts` | RAG calculation logic for all 4 dimensions |
| `apps/lab-lite/src/components/readiness/RAGBoard.tsx` | Main readiness board |
| `apps/lab-lite/src/components/readiness/RAGDimensionCard.tsx` | Individual dimension card |
| `apps/lab-lite/src/components/readiness/RAGBoardWallDisplay.tsx` | Wall display mode variant |
| `apps/lab-lite/src/components/readiness/PersonnelDrillDown.tsx` | Personnel detail view |
| `apps/lab-lite/src/components/readiness/EquipmentDrillDown.tsx` | Equipment detail view |
| `apps/lab-lite/src/components/readiness/SupplyDrillDown.tsx` | Supply detail view |
| `apps/lab-lite/src/components/readiness/QCDrillDown.tsx` | QC detail view |
| `apps/lab-lite/src/components/readiness/SupplyManagement.tsx` | Supply CRUD |
| `apps/lab-lite/src/app/[locale]/readiness/page.tsx` | Readiness board page route |
| `apps/lab-lite/src/__tests__/rag-service.test.ts` | RAG calculation tests |
| `apps/lab-lite/src/__tests__/rag-board.test.tsx` | Board UI tests |
| `apps/lab-lite/src/__tests__/supply-management.test.tsx` | Supply management tests |

### Files to Modify

| File | Change |
|---|---|
| `apps/lab-lite/src/lib/db.ts` | Add `supply_inventory` table |
| `apps/lab-lite/src/components/AppSidebar.tsx` | Add "Readiness Board" navigation item (SUPERVISOR+ only) |
| `apps/lab-lite/messages/en.json` | Add RAG i18n keys |
| `apps/lab-lite/messages/ar.json` | Arabic translations |
| `apps/lab-lite/messages/prs.json` | Dari translations |
| `apps/lab-lite/messages/ps.json` | Pashto translations |
| `apps/lab-lite/messages/fa.json` | Farsi translations |

### Patterns to Follow

1. **Dashboard pattern:** Follow `apps/lab-lite/src/components/dashboard/` — card grid, self-contained cards, polling refresh.
2. **Hook pattern:** Use `useEffect` with `setInterval` for auto-refresh. Return `{ data, isLoading }`.
3. **Color system:** Use Tailwind's color scale — green-500, amber-500, red-500 for indicators. Light backgrounds for cards (green-50, amber-50, red-50).
4. **Permission gating:** Use `useLabPermission(LabPermission.VIEW_STAFF)` for board access.

### Key Constraints from CLAUDE.md

- **PHI Rule:** The RAG board shows operational data only — tech names (practitioners, not patients), instrument names, supply names, QC analyte names. No patient data whatsoever.
- **Offline-First Rule:** Entire board works from Dexie. No network required.
- **RTL Rule:** 2x2 grid must reflow correctly in RTL. Drill-down lists must use logical CSS properties.
- **Data Minimization Rule #7:** No patient data appears anywhere on the RAG board.

### Review Findings

#### Decision-Needed

- [x] [Review][Decision] D1: Drill-down components created but not wired into RAGBoard — AC 6 requires drill-down content in this story, but RAGDrillDownPanel only renders summary text with comment "future story". Four drill-down components exist as files but are never imported.
- [x] [Review][Decision] D2: Wall display as separate component vs spec's CSS-only toggle — Dev Notes say "CSS-only transformation, no separate component tree" but implementation creates RAGBoardWallDisplay.tsx that replaces the board entirely.
- [x] [Review][Decision] D3: Equipment RAG ignores maintenance dates and critical/non-critical distinction — AC 3 requires Amber for "maintenance due within 7 days" and Red only for "critical instrument OOS". Implementation treats all OOS as Red with no maintenance date logic.
- [x] [Review][Decision] D4: Supply RAG uses numeric thresholds instead of spec's time-based thresholds — AC 4 defines Green >2wk, Amber <1wk, Red=zero. Implementation uses per-item reorderThreshold/criticalThreshold numbers.
- [x] [Review][Decision] D5: Personnel RAG logic deviates from scheduled/absent tracking — AC 2 specifies Green=all present, Amber=1 absent, Red=below minimum. Implementation uses Green=present>min, Amber=present==min, Red=present<min with no scheduled/absent concept.

#### Patch

- [x] [Review][Patch] P1: Missing db.ts changes — supply_inventory table, instruments helpers, getMinimumStaffing, SupplyItem type [db.ts]
- [x] [Review][Patch] P2: Missing i18n keys in all 5 locale files — ~50+ keys referenced in components but none defined [messages/*.json]
- [x] [Review][Patch] P3: Missing AppSidebar readiness nav item gated to SUPERVISOR+ [AppSidebar.tsx]
- [x] [Review][Patch] P4: Hardcoded English summary strings in rag-service.ts — should return i18n template keys [rag-service.ts]
- [x] [Review][Patch] P5: Wall display cursor mutation leaks globally on crash — needs safer cleanup guard [RAGBoardWallDisplay.tsx]
- [x] [Review][Patch] P6: No negative number validation for stock/threshold/usage form fields [SupplyManagement.tsx]
- [x] [Review][Patch] P7: QC z-score when targetSd=0 silently passes — should warn, not mask failures [rag-service.ts]
- [x] [Review][Patch] P8: Drill-down panel lacks focus trap — WCAG violation with aria-modal [RAGBoard.tsx]
- [x] [Review][Patch] P9: DeleteConfirmDialog lacks focus trap + escape key handler [SupplyManagement.tsx]
- [x] [Review][Patch] P10: Auto-refresh overwrites board state while drill-down panel is open [RAGBoard.tsx]
- [x] [Review][Patch] P11: No try/catch in SupplyManagement async handlers — unhandled promise rejections [SupplyManagement.tsx]
- [x] [Review][Patch] P12: Pencil icon wrapped in DirectionalIcon category="navigation" — should not mirror [SupplyManagement.tsx]
- [x] [Review][Patch] P13: Wrench icon wrapped in DirectionalIcon category="medical" — semantically wrong [EquipmentDrillDown.tsx]
- [x] [Review][Patch] P14: Tailwind class conflict — bg-white always wins over conditional bg-red-50/40 [EquipmentDrillDown.tsx]
- [x] [Review][Patch] P15: Wall display cards render as interactive buttons with no-op onClick [RAGBoardWallDisplay.tsx]
- [x] [Review][Patch] P16: Interval fires even when initialBoardState provided — confused intent [RAGBoard.tsx]
- [x] [Review][Patch] P17: ReadinessPage server component renders client component without Suspense [page.tsx]
- [x] [Review][Patch] P18: session.practitionerId has no fallback in formToItem [SupplyManagement.tsx]

### References

- Epic definition: `_bmad-output/planning-artifacts/epics.md` — Epic 51, Story 51.5 (line 6352)
- Story 42.1 (RBAC): `_bmad-output/implementation-artifacts/42-1-role-based-access-control.md`
- Story 51.1 (Shift Handover): `_bmad-output/implementation-artifacts/51-1-shift-handover-protocol.md`
- Story 51.4 (Equipment Booking): `_bmad-output/implementation-artifacts/51-4-equipment-booking-scheduling.md`
- Story 43.2 (QC Temporal Binding): `_bmad-output/implementation-artifacts/43-2-qc-result-temporal-binding.md`
- Dexie schema: `apps/lab-lite/src/lib/db.ts`
- Dashboard components: `apps/lab-lite/src/components/dashboard/`
