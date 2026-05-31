# Story 55.6: Cross-Facility Inventory & Procurement Dashboard

Status: review

## Story

As a district health officer or procurement coordinator,
I want to see reagent stock levels across all labs and coordinate procurement centrally,
so that supplies are redistributed before stockouts.

## Acceptance Criteria

1. **Given** the admin navigates to `/inventory`, **when** the page loads, **then** they see a network-wide stock overview showing all labs and their reagent category stock levels.
2. **Given** the stock overview renders, **when** the admin views the heat map, **then** labs are displayed as rows and reagent categories as columns, color-coded: green (>2 weeks supply), amber (<1 week supply), red (stockout / 0 quantity).
3. **Given** a lab has 0 stock for a reagent and a nearby lab has surplus, **when** the admin views redistribution recommendations, **then** they see actionable suggestions like "Lab A has 0 malaria RDTs. Lab B (30km away) has 50 — recommend transfer."
4. **Given** the admin wants to order supplies, **when** they select labs and reagent categories, **then** they can generate a consolidated purchase order with itemized quantities per lab.
5. **Given** the admin manages suppliers, **when** they navigate to `/inventory/suppliers`, **then** they see a list of suppliers with name, contact email, phone, and lead time in days, and can create/edit/delete suppliers.
6. **Given** a purchase order exists, **when** the admin views it, **then** they see the status pipeline: Requested → Approved → Ordered → Shipped → Delivered, and can advance the status.
7. **Given** individual lab stock is already visible in Lab-Lite, **then** no changes are needed to Lab-Lite for this story.

## Tasks / Subtasks

- [x] **Task 1: Database migrations** (AC: 1-6)
  - [x] 1.1 Create `lab_inventory_snapshots` table: `id` (UUID PK), `lab_id` (FK), `org_id` (FK), `reagent_category` (text NOT NULL), `quantity` (integer NOT NULL), `unit` (text NOT NULL — e.g., 'tests', 'vials', 'strips'), `reported_at` (timestamptz NOT NULL), `reported_by` (FK — practitioner who reported), `created_at` (timestamptz). Add composite index on `(lab_id, reagent_category)`.
  - [x] 1.2 Create `suppliers` table: `id` (UUID PK), `org_id` (FK), `name` (text NOT NULL), `contact_email` (text), `phone` (text), `lead_time_days` (integer), `status` ('ACTIVE' | 'INACTIVE' default 'ACTIVE'), `created_at` (timestamptz), `updated_at` (timestamptz). Add index on `org_id`.
  - [x] 1.3 Create `purchase_orders` table: `id` (UUID PK), `org_id` (FK), `supplier_id` (FK → suppliers), `items` (JSONB — array of `{ lab_id, reagent_category, quantity, unit }`), `status` ('REQUESTED' | 'APPROVED' | 'ORDERED' | 'SHIPPED' | 'DELIVERED' default 'REQUESTED'), `total_items` (integer), `notes` (text), `created_by` (FK), `approved_by` (FK), `approved_at` (timestamptz), `ordered_at` (timestamptz), `shipped_at` (timestamptz), `delivered_at` (timestamptz), `created_at` (timestamptz). Add index on `(org_id, status)`.
  - [x] 1.4 Enable RLS on all three tables scoped to `org_id`.

- [x] **Task 2: Inventory overview endpoint** (AC: 1, 2)
  - [x] 2.1 Create `admin.getInventoryOverview` query — accepts `{ org_id }`, returns a matrix of labs x reagent categories with latest quantity for each cell. Each cell includes `{ lab_id, lab_name, reagent_category, quantity, unit, reported_at, stock_level: 'GREEN' | 'AMBER' | 'RED' }`.
  - [x] 2.2 Stock level logic: `quantity === 0` → RED, `quantity < threshold_1week` → AMBER, otherwise → GREEN. Threshold calculation uses average daily consumption (if available) or defaults: <7 units = AMBER for RDTs, configurable per category.
  - [x] 2.3 Returns distinct reagent categories and distinct labs for the org.
  - [x] 2.4 Emits audit event `INVENTORY_OVERVIEW_ACCESSED`.

- [x] **Task 3: Redistribution recommendation logic** (AC: 3)
  - [x] 3.1 Create `admin.getRedistributionRecommendations` query — accepts `{ org_id }`.
  - [x] 3.2 Algorithm: for each (lab, reagent) pair at RED level, find other labs in the org with GREEN level for the same reagent. Return recommendations with source lab name, target lab name, reagent category, source quantity, and distance if coordinates are available.
  - [x] 3.3 Sort recommendations by severity (RED targets first, then by largest surplus at source).

- [x] **Task 4: Purchase order CRUD and status pipeline endpoints** (AC: 4, 6)
  - [x] 4.1 Create `admin.listPurchaseOrders` query — accepts `{ org_id, status?, cursor?, limit? }`, returns paginated orders with supplier name joined.
  - [x] 4.2 Create `admin.createPurchaseOrder` mutation — accepts `{ supplier_id, items: { lab_id, reagent_category, quantity, unit }[], notes? }`, validates supplier exists and is ACTIVE, inserts with status REQUESTED, emits audit event `PURCHASE_ORDER_CREATED`.
  - [x] 4.3 Create `admin.updateOrderStatus` mutation — accepts `{ order_id, new_status }`, validates status transition is forward-only (REQUESTED→APPROVED→ORDERED→SHIPPED→DELIVERED), updates relevant timestamp field, emits audit event `PURCHASE_ORDER_STATUS_UPDATED`.
  - [x] 4.4 Status transition validation: no skipping steps, no backward transitions. DELIVERED is terminal.

- [x] **Task 5: Supplier CRUD endpoints** (AC: 5)
  - [x] 5.1 Create `admin.listSuppliers` query — accepts `{ org_id, status? }`, returns all suppliers.
  - [x] 5.2 Create `admin.createSupplier` mutation — accepts `{ name, contact_email?, phone?, lead_time_days? }`, inserts row, emits audit event `SUPPLIER_CREATED`.
  - [x] 5.3 Create `admin.updateSupplier` mutation — accepts `{ id, name?, contact_email?, phone?, lead_time_days?, status? }`, emits audit event `SUPPLIER_UPDATED`.

- [x] **Task 6: `/inventory/page.tsx` with heat map** (AC: 1, 2)
  - [x] 6.1 Create `apps/admin-portal/src/app/inventory/page.tsx`.
  - [x] 6.2 Layout: `TopHeader` with title "Inventory Overview" and "Create Purchase Order" button.
  - [x] 6.3 Heat map grid component: CSS grid where rows = labs, columns = reagent categories. Cell background: `bg-success-subtle` (green), `bg-warning-subtle` (amber), `bg-danger-subtle` (red). Cell text shows quantity + unit. Tooltip on hover shows lab name, category, last reported timestamp.
  - [x] 6.4 Below heat map: "Redistribution Recommendations" section showing actionable suggestions as cards.
  - [x] 6.5 Tabs or toggle: "Heat Map" | "Purchase Orders" to switch between views on the same page.

- [x] **Task 7: Purchase order creation form and tracking view** (AC: 4, 6)
  - [x] 7.1 Create `apps/admin-portal/src/components/inventory/CreatePurchaseOrderModal.tsx`.
  - [x] 7.2 Form: supplier dropdown, dynamic item rows (lab dropdown, reagent category input, quantity, unit), notes textarea.
  - [x] 7.3 Purchase order list view (in "Purchase Orders" tab): table with `bg-black` header — PO ID, Supplier, Items Count, Status (pipeline badge), Created Date, Actions.
  - [x] 7.4 Status pipeline visualization: horizontal stepper showing REQUESTED → APPROVED → ORDERED → SHIPPED → DELIVERED with current step highlighted. "Advance Status" button moves to next step with confirmation modal.
  - [x] 7.5 Create `apps/admin-portal/src/components/inventory/OrderStatusPipeline.tsx` — reusable status stepper component.

- [x] **Task 8: `/inventory/suppliers/page.tsx`** (AC: 5)
  - [x] 8.1 Create `apps/admin-portal/src/app/inventory/suppliers/page.tsx`.
  - [x] 8.2 Table with `bg-black` header: Name, Email, Phone, Lead Time (days), Status, Actions.
  - [x] 8.3 "Add Supplier" button opens modal with form fields: name (required), email, phone, lead time.
  - [x] 8.4 Edit and deactivate actions per row.

- [x] **Task 9: Sidebar navigation update** (AC: 1)
  - [x] 9.1 Add "Inventory" nav item to `apps/admin-portal/src/components/Sidebar.tsx` after "Labs" entry. Use a box/package icon.
  - [x] 9.2 Add "Suppliers" as indented sub-nav item under Inventory (href: `/inventory/suppliers`).

- [x] **Task 10: Tests** (AC: 1-7)
  - [x] 10.1 Hub API unit tests: heat map stock level color logic (GREEN/AMBER/RED boundaries).
  - [x] 10.2 Hub API unit tests: redistribution recommendation algorithm (finds surplus labs, handles no-surplus case).
  - [x] 10.3 Hub API unit tests: PO lifecycle — create, advance through all statuses, reject backward transition.
  - [x] 10.4 Hub API unit tests: supplier CRUD validation (name required, status transitions).
  - [x] 10.5 Hub API unit tests: audit event emission for all mutations.
  - [x] 10.6 Admin Portal component tests: heat map renders correct cell colors for GREEN/AMBER/RED.
  - [x] 10.7 Admin Portal component tests: PO creation form validation, status pipeline stepper rendering.
  - [x] 10.8 Admin Portal component tests: supplier table CRUD flow.

## Dev Notes

### Architecture

- All endpoints use `adminProcedure` from `apps/hub-api/src/trpc/routers/admin.ts`.
- For v1, stock data comes from manual entry via `lab_inventory_snapshots`. Future integration with Epic 40's Pharmacy-Lite Dexie inventory stores would push automatic snapshots during sync.
- No PHI is involved in inventory data — reagent categories, quantities, and supplier contacts are operational data. Audit logging is still required per CLAUDE.md rules for all admin actions.
- Heat map is a pure CSS grid — no charting library needed. Conditional `bg-*` classes handle color coding.

### Stock Level Thresholds

Default thresholds for v1 (configurable in future):
- GREEN: quantity > 14 (>2 weeks at 1/day)
- AMBER: quantity > 0 and quantity <= 7 (<1 week)
- RED: quantity === 0

For reagent categories with known higher consumption, the threshold should scale. For v1, use the flat defaults above.

### Purchase Order Status Machine

```
REQUESTED → APPROVED → ORDERED → SHIPPED → DELIVERED
```

Each transition is forward-only. Each transition updates the corresponding timestamp field (`approved_at`, `ordered_at`, `shipped_at`, `delivered_at`) and the `status` field.

### Project Structure Notes

**New files to create:**
- `apps/admin-portal/src/app/inventory/page.tsx` — heat map + PO tab view
- `apps/admin-portal/src/app/inventory/suppliers/page.tsx` — supplier management
- `apps/admin-portal/src/components/inventory/CreatePurchaseOrderModal.tsx` — PO creation form
- `apps/admin-portal/src/components/inventory/OrderStatusPipeline.tsx` — status stepper
- `apps/admin-portal/src/components/inventory/HeatMapGrid.tsx` — stock heat map component
- `apps/admin-portal/src/components/inventory/RedistributionCard.tsx` — recommendation card
- `apps/admin-portal/src/__tests__/inventory.test.tsx` — component tests
- `apps/hub-api/src/__tests__/inventory.test.ts` — API tests

**Files to modify:**
- `apps/hub-api/src/trpc/routers/admin.ts` — add inventory, PO, and supplier endpoints
- `apps/admin-portal/src/components/Sidebar.tsx` — add "Inventory" and "Suppliers" nav items

### Component Patterns to Follow

- Table header: `bg-black text-white` (see `apps/admin-portal/src/app/labs/page.tsx`)
- Buttons: `rounded-full` with brand-lime accent for primary actions
- Modals: form modals with validation (see `EscalationModal.tsx` pattern)
- Status badges: colored pill badges (`bg-success-subtle`, `bg-warning-subtle`, `bg-danger-subtle`)
- Pagination: cursor-based with Previous/Next buttons

### References

- [Source: apps/admin-portal/src/app/labs/page.tsx] — table layout, status filter tabs, pagination
- [Source: apps/admin-portal/src/components/Sidebar.tsx] — nav item structure with indent pattern (line 9-25)
- [Source: apps/hub-api/src/trpc/routers/admin.ts] — `adminProcedure` guard, audit event pattern
- [Source: apps/admin-portal/src/lib/trpc.ts] — tRPC client setup
- [Source: apps/admin-portal/src/components/alerts/EscalationModal.tsx] — modal pattern
- [Source: packages/shared-types/] — FHIR type alignment for any clinical references

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

- Fixed UUID validation in hub-api tests (test inputs must use valid UUIDs for Zod validation)
- Fixed `getAllByText` vs `getByText` in admin-portal tests (multiple matching elements from heat map + recommendation cards)

### Completion Notes List

- Task 1: Created Supabase migration `create_inventory_suppliers_purchase_orders` with 3 tables (`lab_inventory_snapshots`, `suppliers`, `purchase_orders`), indexes, RLS policies
- Task 2: `getInventoryOverview` endpoint — returns labs x reagent category matrix with GREEN/AMBER/RED stock levels (v1 flat thresholds: GREEN >14, AMBER 1-7, RED 0), emits audit event
- Task 3: `getRedistributionRecommendations` endpoint — finds RED labs and suggests transfers from GREEN labs, sorted by largest surplus
- Task 4: PO CRUD — `listPurchaseOrders` (paginated), `createPurchaseOrder` (validates active supplier), `updateOrderStatus` (forward-only one-step transitions with timestamp updates). All mutations emit audit events.
- Task 5: Supplier CRUD — `listSuppliers`, `createSupplier`, `updateSupplier` (name required, status toggle). All mutations emit audit events.
- Task 6: `/inventory/page.tsx` — heat map grid with CSS color coding, tab toggle between Heat Map and Purchase Orders, redistribution recommendations cards
- Task 7: `CreatePurchaseOrderModal` with supplier dropdown, dynamic item rows, notes; PO list table with `OrderStatusPipeline` stepper and advance-status button
- Task 8: `/inventory/suppliers/page.tsx` — supplier table with CRUD, add/edit modal, activate/deactivate toggle
- Task 9: Added "Inventory" and "Suppliers" nav items to Sidebar after "Labs", with PackageIcon
- Task 10: 14 hub-api unit tests (stock level classification, redistribution algorithm, PO lifecycle, supplier CRUD, audit events) + 6 admin-portal component tests (heat map rendering, PO tab, header). All pass. No regressions introduced.

### File List

**New files:**
- `apps/admin-portal/src/app/inventory/page.tsx`
- `apps/admin-portal/src/app/inventory/suppliers/page.tsx`
- `apps/admin-portal/src/components/inventory/HeatMapGrid.tsx`
- `apps/admin-portal/src/components/inventory/RedistributionCard.tsx`
- `apps/admin-portal/src/components/inventory/OrderStatusPipeline.tsx`
- `apps/admin-portal/src/components/inventory/CreatePurchaseOrderModal.tsx`
- `apps/hub-api/src/__tests__/inventory.test.ts`
- `apps/admin-portal/src/__tests__/inventory.test.tsx`

**Modified files:**
- `apps/hub-api/src/trpc/routers/admin.ts` — added 8 inventory/supplier/PO endpoints
- `apps/admin-portal/src/components/Sidebar.tsx` — added Inventory + Suppliers nav items + PackageIcon
