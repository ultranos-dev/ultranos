# Audit Trail + Last Updated Display — Design Spec

**Date:** 2026-05-25
**Status:** Draft

---

## Overview

Add audit trail visibility and "Last updated by" display to the patient profile and directory. With multiple organizations/individuals editing patient records, clinicians need to see who changed what and when.

## Motivation

Multiple practitioners across different facilities may create or edit the same patient record. Currently there is no UI visibility into who last touched a record or what changes were made. The audit data already exists in `audit_events` (CLAUDE.md Rule #6) — this feature surfaces it.

## Scope

**In scope:**
- "Last updated by [name] ([role]), [time ago]" on PatientHeaderCard
- "Last Updated" sortable column in PatientDirectory table
- Collapsible `PatientAuditTrail` section on patient profile page
- Role-tiered access (clinical staff: last 10 entries, admin: full paginated history)
- New `updated_by` column on patients table
- New `patient.auditTrail` tRPC endpoint
- Backend changes to `patient.update` and `patient.read`

**Out of scope:**
- Audit trail for non-patient resources (encounters, medications, allergies)
- Audit trail export/download
- Audit event value diffs (showing old/new field values — violates PHI safety)
- Real-time audit notifications

---

## 1. Database Changes

### New column: `updated_by`

Add `updated_by UUID` (nullable) to the `patients` table. Stores the practitioner's user ID (`sub` from JWT) who last modified the record. Existing rows have `NULL` — no backfill needed.

Migration:

```sql
ALTER TABLE patients ADD COLUMN updated_by UUID;
```

### Existing table: `audit_events`

Already captures PHI read/write events with:
- `action` — PHI_READ, PHI_WRITE, UPDATE
- `resource_type` — PATIENT
- `resource_id` — patient UUID
- `actor_id` — practitioner user ID
- `actor_role` — PHYSICIAN, NURSE, ADMIN, etc.
- `metadata` — JSONB with `operation`, `fieldsUpdated`, etc.
- `created_at` — timestamp
- SHA-256 hash chaining (append-only)

No schema changes needed to `audit_events`.

---

## 2. Backend Changes

### `patient.update` — Write `updated_by`

In the update mutation, add `ctx.user.sub` to the update payload alongside `updated_at`:

```typescript
updates.updatedAt = new Date().toISOString()
updates.updatedBy = ctx.user.sub
```

The `db.toRow()` call will snake_case this to `updated_by`.

### `patient.read` — Return updater identity

After fetching the patient row, resolve `updated_by` to a display name and role by querying the `practitioners` or `auth.users` table:

```typescript
// In the return object, add to _ultranos:
updatedByName: resolvedName ?? undefined,    // "Dr. Fatima"
updatedByRole: resolvedRole ?? undefined,    // "PHYSICIAN"
```

If `updated_by` is null (legacy records) or the practitioner can't be resolved, these fields are `undefined` and the UI shows just the timestamp.

### `patient.list` / `patient.search` — No updater name

These endpoints already return `updated_at`. Do NOT resolve `updated_by` to a name — too expensive for list queries. The directory table shows timestamp only.

### New endpoint: `patient.auditTrail`

```typescript
patient.auditTrail: protectedProcedure
  .use(enforceResourceAccess('Patient'))
  .input(z.object({
    patientId: z.string().uuid(),
    limit: z.number().int().min(1).max(50).default(10),
    cursor: z.string().datetime().optional(),
  }))
  .query(async ({ ctx, input }) => {
    // Role-based limit enforcement
    const maxLimit = ctx.user.role === 'ADMIN' ? input.limit : Math.min(input.limit, 10)

    let query = ctx.supabase
      .from('audit_events')
      .select('id, action, resource_id, actor_id, actor_role, metadata, created_at')
      .eq('resource_id', input.patientId)
      .eq('resource_type', 'PATIENT')
      .order('created_at', { ascending: false })
      .limit(maxLimit)

    if (input.cursor) {
      query = query.lt('created_at', input.cursor)
    }

    const { data, error } = await query

    // Resolve actor names in batch
    const actorIds = [...new Set((data ?? []).map(e => e.actor_id))]
    const actorNames = await resolveActorNames(ctx.supabase, actorIds)

    return {
      entries: (data ?? []).map(e => ({
        id: e.id,
        action: e.action,
        actorName: actorNames.get(e.actor_id) ?? undefined,
        actorRole: e.actor_role,
        fieldsUpdated: (e.metadata as Record<string, unknown>)?.fieldsUpdated ?? [],
        operation: (e.metadata as Record<string, unknown>)?.operation ?? e.action,
        timestamp: e.created_at,
      })),
      nextCursor: (data && data.length === maxLimit)
        ? data[data.length - 1].created_at
        : null,
      // Signal to UI whether "Load more" should be shown
      hasMore: (data?.length ?? 0) === maxLimit,
    }
  })
```

**Actor name resolution:** Batch-resolve `actor_id` values to display names via a single query to the practitioners/users table. Cache-friendly since the same few practitioners appear repeatedly.

**Audit of the audit:** This endpoint itself emits a PHI_READ audit event (reading audit trail = reading metadata about PHI access).

---

## 3. Frontend Components

### PatientHeaderCard — "Last updated by"

Add a line below the existing demographics row:

```tsx
{patient._ultranos.updatedByName && (
  <p className="text-xs text-neutral-500">
    Last updated by {patient._ultranos.updatedByName}
    {patient._ultranos.updatedByRole && ` (${patient._ultranos.updatedByRole})`}
    {patient.meta.lastUpdated && `, ${formatRelativeTime(patient.meta.lastUpdated)}`}
  </p>
)}
```

If `updatedByName` is not available (legacy records), fall back to just the timestamp:

```tsx
{!patient._ultranos.updatedByName && patient.meta.lastUpdated && (
  <p className="text-xs text-neutral-500">
    Last updated {formatRelativeTime(patient.meta.lastUpdated)}
  </p>
)}
```

### PatientDirectory — "Last Updated" column

Add a new sortable column after "Status":

```tsx
<td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
  {row.lastUpdated
    ? formatRelativeTime(row.lastUpdated)
    : '—'}
</td>
```

The `PatientRow` interface gains `lastUpdated: string | null` mapped from `meta.lastUpdated`. Sorting uses ISO string comparison.

### PatientAuditTrail — New collapsible component

**File:** `apps/opd-lite/src/components/patient/PatientAuditTrail.tsx`

**Placement:** After `PatientDetailsAccordion` on the patient profile page. Collapsed by default.

**Props:**
```typescript
interface PatientAuditTrailProps {
  patientId: string
  userRole: string  // from session — determines entry limit and "Load more" visibility
}
```

**Behavior:**
- Fetches from `patient.auditTrail` endpoint on expand (lazy-load, not on page load)
- Clinical staff: shows up to 10 entries, no "Load more"
- Admin: shows 10 entries initially, "Load more" button loads next 50 via cursor pagination
- Each entry rendered as a compact row:

```
Dr. Fatima (Physician) — updated nameGiven, addressOrigin — 2h ago
Nurse Ahmad (Nurse) — read patient chart — yesterday
System (Admin) — created patient — 24 May 2026
```

**Entry formatting rules:**
- **Create:** "[name] ([role]) — created patient — [time]"
- **Update/PHI_WRITE:** "[name] ([role]) — updated [field1, field2, ...] — [time]"
- **Read/PHI_READ:** "[name] ([role]) — viewed patient record — [time]"
- **Fields changed:** Display camelCase field names in human-readable form: `nameGiven` → "given name", `addressOrigin` → "origin address". A simple lookup map handles this.
- **Never show field values** — only field names (CLAUDE.md Rule #1)

**Visual treatment:**
- Same collapsible pattern as `PatientDetailsAccordion` (rounded card, chevron toggle)
- Header: "Audit Trail" with entry count badge
- Entries use a timeline-style layout with subtle left border
- Timestamps show relative time with full ISO datetime on hover (`title` attribute)

---

## 4. PHI Safety

Per CLAUDE.md Rule #1, the audit trail must never expose PHI:

- **Show:** actor name, actor role, action type, field names changed, timestamp
- **Never show:** field values (old or new), patient names, diagnoses, medication names
- The `audit_events.metadata.fieldsUpdated` array contains field names only (e.g. `["nameGiven", "addressOrigin"]`), not values — this is safe to display
- The audit trail endpoint itself is behind `enforceResourceAccess('Patient')` and emits its own audit event

---

## 5. Shared Types Changes

Add to `FhirPatient._ultranos`:

```typescript
updatedByName?: string
updatedByRole?: string
```

These are display-only fields populated by `patient.read` — not stored in the database directly. The database stores `updated_by` (UUID), and the API resolves it to name + role at read time.

---

## 6. i18n Keys

New keys for all three locales:

**English (`en`):**
```json
"patient.lastUpdatedBy": "Last updated by {name} ({role}), {time}",
"patient.lastUpdated": "Last updated {time}",
"patient.auditTrail": "Audit Trail",
"patient.auditTrailCount": "{count, plural, one {1 entry} other {{count} entries}}",
"patient.auditCreated": "created patient",
"patient.auditUpdated": "updated {fields}",
"patient.auditViewed": "viewed patient record",
"patient.auditLoadMore": "Load more",
"patient.auditLoading": "Loading audit trail...",
"patient.auditEmpty": "No audit entries found",
"patients.lastUpdated": "Last Updated"
```

**Arabic (`ar`) and Dari (`prs`):** Corresponding translations for all keys.

---

## 7. Files Summary

### Backend

| File | Change |
|------|--------|
| New migration | Add `updated_by UUID` column to `patients` table |
| `apps/hub-api/src/trpc/routers/patient.ts` | Update `patient.update` to write `updated_by`; update `patient.read` to resolve updater name; add `patient.auditTrail` endpoint |
| `packages/shared-types/src/fhir/patient.ts` | Add `updatedByName`, `updatedByRole` to `_ultranos` type |

### Frontend

| File | Change |
|------|--------|
| `apps/opd-lite/src/components/patient/PatientAuditTrail.tsx` | **New** — collapsible audit trail component |
| `apps/opd-lite/src/components/patient/PatientHeaderCard.tsx` | Add "Last updated by" line |
| `apps/opd-lite/src/components/patient/PatientChartPage.tsx` | Render PatientAuditTrail after PatientDetailsAccordion |
| `apps/opd-lite/src/components/patients/PatientDirectory.tsx` | Add "Last Updated" sortable column |
| `apps/opd-lite/messages/en.json` | Add audit trail + last updated i18n keys |
| `apps/opd-lite/messages/ar.json` | Arabic translations |
| `apps/opd-lite/messages/prs.json` | Dari translations |

### Future (shared package)

When `packages/patient-workflows/` is created (Sub-project A), `PatientAuditTrail` will move there with an adapter method `adapter.fetchAuditTrail(patientId, limit, cursor)`. The "Last updated by" display will be part of the shared header card pattern.
