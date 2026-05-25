# Audit Trail + Last Updated Display — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface audit trail data on the patient profile (role-tiered collapsible) and add "Last updated by" display to the patient header card and directory.

**Architecture:** New `updated_by` column on `patients` table stores practitioner UUID. `patient.read` resolves it to a display name via join to `practitioners` table. New `patient.auditTrail` tRPC endpoint queries `audit_log` with role-based limits. Frontend components use `formatRelativeTime` from `@ultranos/ui-kit`.

**Tech Stack:** PostgreSQL (Supabase), tRPC, React, TypeScript, Tailwind CSS, next-intl

**Spec:** `docs/superpowers/specs/2026-05-25-audit-trail-last-updated-design.md`

---

### Task 1: Database migration — add `updated_by` to patients

**Files:**
- Create: New Supabase migration via MCP tool

- [ ] **Step 1: Apply the migration**

Use the Supabase MCP tool to apply the migration:

```sql
ALTER TABLE patients ADD COLUMN IF NOT EXISTS updated_by UUID;
COMMENT ON COLUMN patients.updated_by IS 'Practitioner UUID who last modified this record';
```

Migration name: `add_updated_by_to_patients`

- [ ] **Step 2: Verify the column exists**

Use the Supabase MCP tool to run:

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'patients' AND column_name = 'updated_by';
```

Expected: one row showing `updated_by | uuid | YES`

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(db): add updated_by column to patients table"
```

---

### Task 2: Add `updatedByName` and `updatedByRole` to shared types

**Files:**
- Modify: `packages/shared-types/src/fhir/patient.ts:62-102`

- [ ] **Step 1: Add the new fields to the `_ultranos` type**

In the `_ultranos` block inside `FhirPatient`, add after `bloodGroup` (line 101):

```typescript
    /** Display name of practitioner who last updated this record (resolved at read time) */
    updatedByName?: string
    /** Role of practitioner who last updated (DOCTOR, NURSE, etc.) */
    updatedByRole?: string
```

- [ ] **Step 2: Commit**

```bash
git add packages/shared-types/src/fhir/patient.ts
git commit -m "feat(shared-types): add updatedByName and updatedByRole to FhirPatient._ultranos"
```

---

### Task 3: Update `patient.update` to write `updated_by`

**Files:**
- Modify: `apps/hub-api/src/trpc/routers/patient.ts` (the `update` mutation)

- [ ] **Step 1: Add `updated_by` to the update payload**

In the `patient.update` mutation, find the line where `updates.updatedAt` is set (around line 1124):

```typescript
      updates.updatedAt = new Date().toISOString()
```

Add immediately after:

```typescript
      updates.updatedBy = ctx.user.sub
```

- [ ] **Step 2: Commit**

```bash
git add apps/hub-api/src/trpc/routers/patient.ts
git commit -m "feat(patient): write updated_by on patient update"
```

---

### Task 4: Update `patient.read` to resolve updater name

**Files:**
- Modify: `apps/hub-api/src/trpc/routers/patient.ts` (the `read` query)

- [ ] **Step 1: Resolve `updated_by` to practitioner name after the main query**

In the `patient.read` query handler, after `const patient = db.fromRow(data)` (around line 736), add the practitioner name resolution:

```typescript
      // Resolve updated_by to practitioner display name
      let updatedByName: string | undefined
      let updatedByRole: string | undefined
      if (patient.updatedBy) {
        const { data: practitioner } = await ctx.supabase
          .from('practitioners')
          .select('given_name, family_name, role')
          .eq('id', patient.updatedBy)
          .single()
        if (practitioner) {
          updatedByName = `${practitioner.given_name} ${practitioner.family_name}`
          updatedByRole = practitioner.role
        }
      }
```

- [ ] **Step 2: Add the resolved fields to the return object**

In the return statement's `_ultranos` block (around line 810), add after `bloodGroup`:

```typescript
          updatedByName,
          updatedByRole,
```

- [ ] **Step 3: Commit**

```bash
git add apps/hub-api/src/trpc/routers/patient.ts
git commit -m "feat(patient): resolve updated_by to practitioner name in patient.read"
```

---

### Task 5: New `patient.auditTrail` endpoint

**Files:**
- Modify: `apps/hub-api/src/trpc/routers/patient.ts`

- [ ] **Step 1: Add the `auditTrail` query to the patient router**

Add this procedure inside `createTRPCRouter({})`, after the `unresolvedConflictCount` procedure (around line 1196):

```typescript
  // ── patient.auditTrail ──────────────────────────────────────
  auditTrail: protectedProcedure
    .use(enforceResourceAccess('Patient'))
    .input(
      z.object({
        patientId: z.string().uuid(),
        limit: z.number().int().min(1).max(50).default(10),
        cursor: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      // Role-based limit: clinical staff see max 10, admins get full pagination
      const maxLimit = ctx.user.role === 'ADMIN' ? input.limit : Math.min(input.limit, 10)

      let query = ctx.supabase
        .from('audit_log')
        .select('id, action, actor_id, actor_role, metadata, timestamp')
        .eq('resource_id', input.patientId)
        .eq('resource_type', 'PATIENT')
        .order('timestamp', { ascending: false })
        .limit(maxLimit)

      if (input.cursor) {
        query = query.lt('timestamp', input.cursor)
      }

      const { data, error } = await query

      if (error) {
        console.error('Audit trail query error:', { code: error.code })
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch audit trail',
        })
      }

      const rows = data ?? []

      // Batch-resolve actor names from practitioners table
      const actorIds = [...new Set(rows.map((r) => r.actor_id).filter(Boolean))]
      const actorMap = new Map<string, { name: string; role: string }>()

      if (actorIds.length > 0) {
        const { data: practitioners } = await ctx.supabase
          .from('practitioners')
          .select('id, given_name, family_name, role')
          .in('id', actorIds)

        for (const p of practitioners ?? []) {
          actorMap.set(p.id, {
            name: `${p.given_name} ${p.family_name}`,
            role: p.role,
          })
        }
      }

      // Audit the audit trail read itself (CLAUDE.md Rule #6)
      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: 'PHI_READ',
          resourceType: 'PATIENT',
          resourceId: input.patientId,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { operation: 'audit_trail_read', entryCount: rows.length },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'PHI_READ', resourceId: input.patientId })
      }

      return {
        entries: rows.map((r) => {
          const actor = actorMap.get(r.actor_id)
          const meta = (r.metadata ?? {}) as Record<string, unknown>
          return {
            id: r.id as string,
            action: r.action as string,
            actorName: actor?.name,
            actorRole: (actor?.role ?? r.actor_role) as string,
            fieldsUpdated: (meta.fieldsUpdated as string[]) ?? [],
            operation: (meta.operation as string) ?? r.action,
            timestamp: r.timestamp as string,
          }
        }),
        nextCursor: rows.length === maxLimit
          ? (rows[rows.length - 1].timestamp as string)
          : null,
        hasMore: rows.length === maxLimit,
      }
    }),
```

- [ ] **Step 2: Commit**

```bash
git add apps/hub-api/src/trpc/routers/patient.ts
git commit -m "feat(patient): add patient.auditTrail endpoint with role-based limits"
```

---

### Task 6: Add i18n keys

**Files:**
- Modify: `apps/opd-lite/messages/en.json`
- Modify: `apps/opd-lite/messages/ar.json`
- Modify: `apps/opd-lite/messages/prs.json`

- [ ] **Step 1: Add English keys**

In `en.json`, add to the `"patient"` section:

```json
"lastUpdatedBy": "Last updated by {name} ({role}), {time}",
"lastUpdated": "Last updated {time}",
"auditTrail": "Audit Trail",
"auditTrailCount": "{count, plural, one {1 entry} other {{count} entries}}",
"auditCreated": "created patient",
"auditUpdated": "updated {fields}",
"auditViewed": "viewed patient record",
"auditLoadMore": "Load more",
"auditLoading": "Loading audit trail...",
"auditEmpty": "No audit entries found"
```

In the `"patients"` section, add:

```json
"lastUpdatedCol": "Last Updated"
```

- [ ] **Step 2: Add Arabic keys**

In `ar.json`, add to the `"patient"` section:

```json
"lastUpdatedBy": "آخر تحديث بواسطة {name} ({role})، {time}",
"lastUpdated": "آخر تحديث {time}",
"auditTrail": "سجل المراجعة",
"auditTrailCount": "{count, plural, one {سجل واحد} other {{count} سجلات}}",
"auditCreated": "تسجيل مريض",
"auditUpdated": "تحديث {fields}",
"auditViewed": "عرض سجل المريض",
"auditLoadMore": "تحميل المزيد",
"auditLoading": "جارٍ تحميل سجل المراجعة...",
"auditEmpty": "لم يتم العثور على سجلات"
```

In the `"patients"` section:

```json
"lastUpdatedCol": "آخر تحديث"
```

- [ ] **Step 3: Add Dari keys**

In `prs.json`, add to the `"patient"` section:

```json
"lastUpdatedBy": "آخرین بروزرسانی توسط {name} ({role})، {time}",
"lastUpdated": "آخرین بروزرسانی {time}",
"auditTrail": "گزارش تغییرات",
"auditTrailCount": "{count, plural, one {۱ مورد} other {{count} مورد}}",
"auditCreated": "ثبت بیمار",
"auditUpdated": "بروزرسانی {fields}",
"auditViewed": "مشاهده سوابق بیمار",
"auditLoadMore": "بارگذاری بیشتر",
"auditLoading": "در حال بارگذاری گزارش تغییرات...",
"auditEmpty": "هیچ موردی یافت نشد"
```

In the `"patients"` section:

```json
"lastUpdatedCol": "آخرین بروزرسانی"
```

- [ ] **Step 4: Commit**

```bash
git add apps/opd-lite/messages/en.json apps/opd-lite/messages/ar.json apps/opd-lite/messages/prs.json
git commit -m "feat(i18n): add audit trail and last updated translation keys (en, ar, prs)"
```

---

### Task 7: "Last updated by" on PatientHeaderCard

**Files:**
- Modify: `apps/opd-lite/src/components/patient/PatientHeaderCard.tsx`

- [ ] **Step 1: Import formatRelativeTime**

Add to the imports at the top of the file:

```typescript
import { formatRelativeTime } from '@ultranos/ui-kit/utils/format'
import { useLocale, useTranslations } from 'next-intl'
```

Note: Check if `useLocale`/`useTranslations` are already imported. If so, just add the `formatRelativeTime` import.

- [ ] **Step 2: Add the "Last updated by" line**

In the component body, get the locale and translations:

```typescript
const locale = useLocale()
const t = useTranslations('patient')
```

After the baseline vitals paragraph (the one showing Height, Weight, BMI, Blood — around line 222), add:

```tsx
            {/* Last updated by */}
            {patient._ultranos.updatedByName ? (
              <p className="mt-1 text-xs text-neutral-400">
                {t('lastUpdatedBy', {
                  name: patient._ultranos.updatedByName,
                  role: patient._ultranos.updatedByRole ?? '',
                  time: formatRelativeTime(patient.meta.lastUpdated, locale as 'en' | 'ar' | 'prs'),
                })}
              </p>
            ) : patient.meta.lastUpdated ? (
              <p className="mt-1 text-xs text-neutral-400">
                {t('lastUpdated', {
                  time: formatRelativeTime(patient.meta.lastUpdated, locale as 'en' | 'ar' | 'prs'),
                })}
              </p>
            ) : null}
```

- [ ] **Step 3: Commit**

```bash
git add apps/opd-lite/src/components/patient/PatientHeaderCard.tsx
git commit -m "feat(patient-card): add 'Last updated by' display"
```

---

### Task 8: "Last Updated" column in PatientDirectory

**Files:**
- Modify: `apps/opd-lite/src/components/patients/PatientDirectory.tsx`

- [ ] **Step 1: Import formatRelativeTime**

Add to the imports:

```typescript
import { formatRelativeTime } from '@ultranos/ui-kit/utils/format'
```

- [ ] **Step 2: Add `lastUpdated` to PatientRow and row builder**

Update the `PatientRow` interface to add:

```typescript
  lastUpdated: string | null
```

In the `rows` useMemo builder, add to the mapped object:

```typescript
      lastUpdated: (p.meta?.lastUpdated as string) ?? null,
```

- [ ] **Step 3: Add the sortable column header**

In the table header array (the `[SortField, string][]` array), add a new entry. First update the `SortField` type to include `'lastUpdated'`:

```typescript
type SortField = 'name' | 'age' | 'gender' | 'phone' | 'lastVisit' | 'status' | 'lastUpdated'
```

Then add to the header array, before the allergies `<th>`:

```typescript
['lastUpdated', t('lastUpdatedCol')],
```

- [ ] **Step 4: Add the table body cell**

After the status `<td>` and before the allergies `<td>`, add:

```tsx
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                      {row.lastUpdated
                        ? formatRelativeTime(row.lastUpdated, locale as 'en' | 'ar' | 'prs')
                        : '—'}
                    </td>
```

Note: Ensure `locale` is available — it's already imported via `useLocale()` at the top of the component.

- [ ] **Step 5: Commit**

```bash
git add apps/opd-lite/src/components/patients/PatientDirectory.tsx
git commit -m "feat(patient-list): add Last Updated sortable column"
```

---

### Task 9: Create PatientAuditTrail component

**Files:**
- Create: `apps/opd-lite/src/components/patient/PatientAuditTrail.tsx`

- [ ] **Step 1: Create the component**

Create `apps/opd-lite/src/components/patient/PatientAuditTrail.tsx`:

```tsx
'use client'

import { useState, useCallback } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { formatRelativeTime } from '@ultranos/ui-kit/utils/format'
import { getSupabaseBrowserClient } from '@/lib/supabase'

const HUB_API_URL =
  process.env.NEXT_PUBLIC_HUB_API_URL ?? 'http://localhost:3000'

/** Map camelCase field names to human-readable labels */
const FIELD_LABELS: Record<string, string> = {
  nameGiven: 'given name',
  nameFather: "father's name",
  nameGrandfather: "grandfather's name",
  nameLocal: 'display name',
  nameLatin: 'latin name',
  gender: 'gender',
  birthDate: 'date of birth',
  birthYear: 'birth year',
  birthYearOnly: 'birth year mode',
  telecomPhone: 'phone',
  nationalId: 'national ID',
  addressProvinceOrigin: 'origin province',
  addressDistrictOrigin: 'origin district',
  addressVillageOrigin: 'origin village',
  addressProvinceCurrent: 'current province',
  addressDistrictCurrent: 'current district',
  addressVillageCurrent: 'current village',
  isNomadic: 'nomadic status',
  preferredLanguage: 'preferred language',
  bloodGroup: 'blood group',
  photoUrl: 'photo',
  consentVersion: 'consent',
}

function humanizeFields(fields: string[]): string {
  if (fields.length === 0) return ''
  return fields.map((f) => FIELD_LABELS[f] ?? f).join(', ')
}

interface AuditEntry {
  id: string
  action: string
  actorName?: string
  actorRole: string
  fieldsUpdated: string[]
  operation: string
  timestamp: string
}

interface PatientAuditTrailProps {
  patientId: string
  userRole: string
}

export function PatientAuditTrail({
  patientId,
  userRole,
}: PatientAuditTrailProps) {
  const t = useTranslations('patient')
  const locale = useLocale()

  const [isOpen, setIsOpen] = useState(false)
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [cursor, setCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)

  const isAdmin = userRole === 'ADMIN'

  const fetchEntries = useCallback(
    async (nextCursor?: string) => {
      setLoading(true)
      try {
        const supabase = getSupabaseBrowserClient()
        const { data: sessionData } = await supabase.auth.getSession()
        const token = sessionData.session?.access_token
        if (!token) return

        const input: Record<string, unknown> = {
          patientId,
          limit: isAdmin ? 50 : 10,
        }
        if (nextCursor) input.cursor = nextCursor

        const params = encodeURIComponent(JSON.stringify({ json: input }))
        const res = await fetch(
          `${HUB_API_URL}/api/trpc/patient.auditTrail?input=${params}`,
          { headers: { Authorization: `Bearer ${token}` } },
        )

        if (!res.ok) return

        const body = (await res.json()) as {
          result: {
            data: {
              json: {
                entries: AuditEntry[]
                nextCursor: string | null
                hasMore: boolean
              }
            }
          }
        }

        const result = body.result.data.json
        setEntries((prev) =>
          nextCursor ? [...prev, ...result.entries] : result.entries,
        )
        setCursor(result.nextCursor)
        setHasMore(result.hasMore)
        setLoaded(true)
      } catch {
        // Silently fail — audit trail is non-critical UI
      } finally {
        setLoading(false)
      }
    },
    [patientId, isAdmin],
  )

  const handleToggle = useCallback(() => {
    const willOpen = !isOpen
    setIsOpen(willOpen)
    if (willOpen && !loaded) {
      fetchEntries()
    }
  }, [isOpen, loaded, fetchEntries])

  const handleLoadMore = useCallback(() => {
    if (cursor) fetchEntries(cursor)
  }, [cursor, fetchEntries])

  function formatEntry(entry: AuditEntry): string {
    const fields = humanizeFields(entry.fieldsUpdated)
    if (entry.operation === 'create') return t('auditCreated')
    if (
      entry.operation === 'update' ||
      entry.action === 'PHI_WRITE' ||
      entry.action === 'UPDATE'
    ) {
      return fields ? t('auditUpdated', { fields }) : t('auditUpdated', { fields: 'record' })
    }
    return t('auditViewed')
  }

  return (
    <div className="rounded-xl bg-card-bg shadow-sm ring-[0.65px] ring-gray-400/40">
      {/* Toggle header */}
      <button
        type="button"
        className="flex w-full items-center justify-between px-5 py-4 text-start"
        onClick={handleToggle}
        aria-expanded={isOpen}
        aria-controls="patient-audit-trail-content"
      >
        <span className="text-sm font-semibold text-neutral-700">
          {t('auditTrail')}
          {loaded && (
            <span className="ms-2 inline-flex rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600">
              {entries.length}{hasMore ? '+' : ''}
            </span>
          )}
        </span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
          className={`h-4 w-4 text-neutral-400 transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="m19.5 8.25-7.5 7.5-7.5-7.5"
          />
        </svg>
      </button>

      {/* Content */}
      {isOpen && (
        <div id="patient-audit-trail-content" className="px-5 pb-5">
          {loading && entries.length === 0 && (
            <p className="text-sm text-neutral-500">{t('auditLoading')}</p>
          )}

          {loaded && entries.length === 0 && (
            <p className="text-sm text-neutral-500">{t('auditEmpty')}</p>
          )}

          {entries.length > 0 && (
            <ul className="space-y-2 border-s-2 border-neutral-200 ps-4">
              {entries.map((entry) => (
                <li key={entry.id} className="text-sm text-neutral-700">
                  <span className="font-medium">
                    {entry.actorName ?? entry.actorRole}
                  </span>
                  {entry.actorName && (
                    <span className="text-neutral-500">
                      {' '}({entry.actorRole})
                    </span>
                  )}
                  <span className="text-neutral-500"> — </span>
                  <span>{formatEntry(entry)}</span>
                  <span className="text-neutral-500"> — </span>
                  <time
                    className="text-xs text-neutral-400"
                    dateTime={entry.timestamp}
                    title={entry.timestamp}
                  >
                    {formatRelativeTime(
                      entry.timestamp,
                      locale as 'en' | 'ar' | 'prs',
                    )}
                  </time>
                </li>
              ))}
            </ul>
          )}

          {isAdmin && hasMore && (
            <button
              type="button"
              onClick={handleLoadMore}
              disabled={loading}
              className="mt-3 text-sm font-medium text-blue-600 hover:text-blue-700 disabled:text-neutral-400"
            >
              {loading ? t('auditLoading') : t('auditLoadMore')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/opd-lite/src/components/patient/PatientAuditTrail.tsx
git commit -m "feat(patient): add PatientAuditTrail collapsible component"
```

---

### Task 10: Wire PatientAuditTrail into PatientChartPage

**Files:**
- Modify: `apps/opd-lite/src/components/patient/PatientChartPage.tsx`

- [ ] **Step 1: Import the component**

Add to the imports (after the existing patient component imports):

```typescript
import { PatientAuditTrail } from '@/components/patient/PatientAuditTrail'
```

- [ ] **Step 2: Get userRole from session context**

The component needs the user's role to pass to `PatientAuditTrail`. Check if a session/auth context is already available in the component. If not, add a simple state that reads from the Supabase session:

After the existing state declarations, add:

```typescript
  const [userRole, setUserRole] = useState<string>('DOCTOR')

  useEffect(() => {
    async function loadRole() {
      const supabase = getSupabaseBrowserClient()
      const { data } = await supabase.auth.getSession()
      const role = (data.session?.user?.app_metadata?.role as string) ?? 'DOCTOR'
      setUserRole(role)
    }
    loadRole()
  }, [])
```

Note: Check how `role` is stored in the existing auth flow. It may be in `user_metadata` or `app_metadata`. Adapt accordingly. If a `useSession` or similar hook already provides the role, use that instead.

- [ ] **Step 3: Render PatientAuditTrail after PatientDetailsAccordion**

In the JSX, after `<PatientDetailsAccordion patient={patient} />` and before `<ActiveMedicationsList>`, add:

```tsx
      {/* Audit trail — who modified this record */}
      <PatientAuditTrail patientId={patientId} userRole={userRole} />
```

- [ ] **Step 4: Commit**

```bash
git add apps/opd-lite/src/components/patient/PatientChartPage.tsx
git commit -m "feat(patient-chart): wire PatientAuditTrail into profile page"
```

---

### Task 11: Update normalizeFhirPatient for new fields

**Files:**
- Modify: `apps/opd-lite/src/components/patient/PatientChartPage.tsx`

- [ ] **Step 1: Add updatedByName and updatedByRole to the normalizer**

In the `normalizeFhirPatient` function, in the `_ultranos` block of the return object (after `bloodGroup`), add:

```typescript
      updatedByName: (existingExt.updatedByName as string) ?? undefined,
      updatedByRole: (existingExt.updatedByRole as string) ?? undefined,
```

- [ ] **Step 2: Commit**

```bash
git add apps/opd-lite/src/components/patient/PatientChartPage.tsx
git commit -m "feat(normalize): add updatedByName and updatedByRole to normalizeFhirPatient"
```

---

### Task 12: Manual verification

- [ ] **Step 1: Start Hub API and OPD Lite**

```bash
pnpm -F hub-api dev
pnpm -F opd-lite dev
```

- [ ] **Step 2: Edit a patient and verify "Last updated by"**

1. Navigate to a patient profile
2. Click "Edit Profile" and save a change
3. Refresh the page
4. Verify the header card shows "Last updated by [Your Name] ([Role]), just now"

- [ ] **Step 3: Verify Patient Directory "Last Updated" column**

1. Navigate to the patient directory
2. Verify the new "Last Updated" column appears with relative timestamps
3. Click the column header and verify sorting works

- [ ] **Step 4: Verify Audit Trail (clinical role)**

1. Open a patient profile as a PHYSICIAN/NURSE
2. Expand the "Audit Trail" collapsible
3. Verify up to 10 entries appear
4. Verify no "Load more" button is shown
5. Verify entries show action, actor name/role, fields changed (names only), and relative time

- [ ] **Step 5: Verify Audit Trail (admin role)**

1. Open a patient profile as ADMIN
2. Expand the "Audit Trail" collapsible
3. Verify "Load more" button appears (if >10 entries exist)
4. Click "Load more" and verify additional entries load
