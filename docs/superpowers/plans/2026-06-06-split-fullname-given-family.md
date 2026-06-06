# Split Full Name → Given Name + Family Name Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every combined "Full Name" field across all forms with separate Given Name and Family Name (Last Name) inputs.

**Architecture:** Three touch-points: (1) Admin Portal user-creation form + Hub API `createUser` procedure, (2) CHW Enrollment modal + Hub API `enrollChw` procedure, (3) OPD Lite patient registration — which adds `nameFamily` as a new optional field alongside the existing patronymic chain (nameGiven / nameFather / nameGrandfather). The patient change requires a DB migration, shared-types update, Hub API router update, and UI/i18n update.

**Tech Stack:** Next.js 15, tRPC, Zod, Vitest, Supabase MCP, next-intl (4 locales), TypeScript

---

## File Map

| File | Change |
|------|--------|
| `apps/hub-api/src/trpc/routers/admin.ts` | `createUser` input: `name` → `givenName + familyName`; `enrollChw` input: `fullName` → `givenName + familyName` |
| `apps/admin-portal/src/app/[locale]/users/create/page.tsx` | Split `name` state → `givenName` + `familyName`; update form + submit call |
| `apps/admin-portal/src/components/network/ChwEnrollmentModal.tsx` | Split `fullName` state → `givenName` + `familyName`; update form + submit call |
| `packages/shared-types/src/fhir/patient.ts` | Add `nameFamily?: string` to `FhirPatient._ultranos` and `CreatePatientInput` |
| `packages/shared-types/src/fhir/patient.schema.ts` | Add `nameFamily: z.string().max(200).optional()` to Zod schemas |
| `packages/shared-types/src/__tests__/patient.schema.test.ts` | Tests for `nameFamily` field |
| DB migration (Supabase MCP) | Add `name_family VARCHAR(300)` + `name_family_enc TEXT` to `patients` table |
| `apps/hub-api/src/trpc/routers/patient.ts` | Add `name_family` / `name_family_enc` to SELECT, mappers, toRow (list, read, create, sync) |
| `apps/opd-lite/src/components/registration/NameInputSection.tsx` | Add Family Name input field; update preview |
| `apps/opd-lite/src/components/registration/PatientRegistrationForm.tsx` | Add `nameFamily` state; pass to `NameInputSection`; include in `buildPayload`, `validate`, `savePatientLocally` dependency arrays |
| `apps/opd-lite/messages/en.json` | Add `nameFamily`, `nameFamilyPlaceholder` keys |
| `apps/opd-lite/messages/ar.json` | Arabic translations for same keys |
| `apps/opd-lite/messages/prs.json` | Dari translations for same keys |
| `apps/opd-lite/messages/ps.json` | Pashto translations for same keys |
| `apps/hub-api/src/__tests__/admin-router.test.ts` | Tests for `createUser` and `enrollChw` with split-name inputs |

---

### Task 1: Hub API — `createUser` split-name input

**Files:**
- Modify: `apps/hub-api/src/trpc/routers/admin.ts:2163-2334`
- Test: `apps/hub-api/src/__tests__/admin-router.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `apps/hub-api/src/__tests__/admin-router.test.ts` — append a new `describe` block at the end of the file:

```typescript
describe('Admin Router — createUser split name', () => {
  it('rejects input with legacy `name` field', async () => {
    const caller = createCallerFactory(adminRouter)(
      makeCtx({ sub: 'admin-1', role: 'ADMIN', sessionId: 's1', orgId: 'org-1' }),
    )
    // @ts-expect-error intentionally passing old shape
    await expect(caller.createUser({ name: 'Ahmad Shah', email: 'a@b.com', role: 'DOCTOR', password: 'pass1234' }))
      .rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('accepts givenName + familyName and calls supabase.auth.admin.createUser', async () => {
    const createUserMock = vi.fn().mockResolvedValue({
      data: { user: { id: 'auth-uuid-1' } },
      error: null,
    })
    const generateLinkMock = vi.fn().mockResolvedValue({ data: { properties: { action_link: null } }, error: null })
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
    const single = vi.fn()
      .mockResolvedValueOnce({ data: null, error: null })  // adminPractitioner lookup
      .mockResolvedValueOnce({ data: { id: 'pract-uuid-1' }, error: null })  // insert practitioner

    const selectChain = { eq: vi.fn().mockReturnValue({ maybeSingle, single }) }
    const insertChain = { select: vi.fn().mockReturnValue({ single }) }
    const fromMock = vi.fn((table: string) => {
      if (table === 'practitioners') return { select: vi.fn().mockReturnValue(selectChain), insert: vi.fn().mockReturnValue(insertChain) }
      if (table === 'org_subscriptions') return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ in: vi.fn().mockReturnValue({ maybeSingle }) }) }) }) }
      return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle }) }) }
    })

    const ctx = {
      supabase: {
        from: fromMock,
        auth: { admin: { createUser: createUserMock, generateLink: generateLinkMock } },
      } as never,
      user: { sub: 'admin-1', role: 'ADMIN', sessionId: 's1', orgId: 'org-1', status: null },
      headers: new Headers(),
    }

    const caller = createCallerFactory(adminRouter)(ctx)
    const result = await caller.createUser({
      givenName: 'Ahmad',
      familyName: 'Shah',
      email: 'ahmad@clinic.af',
      role: 'DOCTOR',
      password: 'securePass1',
    })

    expect(createUserMock).toHaveBeenCalledWith(expect.objectContaining({
      user_metadata: expect.objectContaining({ given_name: 'Ahmad', family_name: 'Shah' }),
    }))
    expect(result.name).toBe('Ahmad Shah')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm -F hub-api test --reporter=verbose admin-router
```

Expected: FAIL — `createUser` still takes `name` not `givenName`/`familyName`, and the TypeScript @ts-expect-error test won't work as expected yet.

- [ ] **Step 3: Update `createUser` in `admin.ts`**

In `apps/hub-api/src/trpc/routers/admin.ts`, find `createUser: adminProcedure` (line 2163). Make these changes:

**Input schema** — replace lines 2164-2171:
```typescript
    .input(
      z.object({
        email: z.string().email(),
        givenName: z.string().min(1).max(200),
        familyName: z.string().max(200).default(''),
        role: z.string().min(1),
        password: z.string().min(8).max(128),
      }),
    )
```

**Remove name-split logic** — delete lines 2216-2219 (the `nameParts` split block):
```typescript
      // REMOVED: Split name into given_name / family_name
      // const nameParts = input.name.trim().split(/\s+/)
      // const familyName = nameParts.length > 1 ? nameParts.pop()! : ''
      // const givenName = nameParts.join(' ')
```

**Update `createUser` auth call** — in the `user_metadata` block (lines ~2227-2231), `givenName` and `familyName` are now directly from input:
```typescript
        user_metadata: {
          role: input.role,
          org_id: ctx.user.orgId,
          given_name: input.givenName,
          family_name: input.familyName,
        },
```

**Update practitioner insert** (lines ~2262-2265):
```typescript
          given_name: input.givenName,
          family_name: input.familyName,
```

**Update return value** (line ~2327):
```typescript
        name: [input.givenName, input.familyName].filter(Boolean).join(' '),
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm -F hub-api test --reporter=verbose admin-router
```

Expected: PASS — all admin-router tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/hub-api/src/trpc/routers/admin.ts apps/hub-api/src/__tests__/admin-router.test.ts
git commit -m "feat(hub-api): split createUser name into givenName + familyName"
```

---

### Task 2: Admin Portal — User creation page UI

**Files:**
- Modify: `apps/admin-portal/src/app/[locale]/users/create/page.tsx`

- [ ] **Step 1: Write the failing test**

This is a UI-only change with no testable unit logic. Proceed to implementation.

- [ ] **Step 2: Update `create/page.tsx` state and form**

Replace the `name` state and form field with two new fields. Apply all changes below:

**State** — replace line 29:
```typescript
  const [givenName, setGivenName] = useState('')
  const [familyName, setFamilyName] = useState('')
```

**Submit handler** — replace `trpc.admin.createUser.mutate(...)` call (line 87):
```typescript
      const result = await trpc.admin.createUser.mutate({ givenName, familyName, email, role: selectedRole, password })
```

**Submit button disabled condition** — replace `!name` with `!givenName` (line 287):
```typescript
      disabled={submitting || !selectedRole || !givenName || !email || !password || password !== confirmPassword}
```

**Reset on "Create Another"** — replace `setName('')` (line 266) with:
```typescript
                  setGivenName('')
                  setFamilyName('')
```

**Form fields** — replace the entire `{/* Name Field */}` block (lines 114-127) with:
```tsx
          {/* Given Name */}
          <div>
            <label htmlFor="given-name" className="block text-sm font-medium text-muted-foreground">
              Given Name
            </label>
            <Input
              id="given-name"
              type="text"
              required
              value={givenName}
              onChange={(e) => setGivenName(e.target.value)}
              className="mt-1.5"
            />
          </div>

          {/* Family Name (Last Name) */}
          <div>
            <label htmlFor="family-name" className="block text-sm font-medium text-muted-foreground">
              Family Name / Last Name
            </label>
            <Input
              id="family-name"
              type="text"
              value={familyName}
              onChange={(e) => setFamilyName(e.target.value)}
              className="mt-1.5"
            />
          </div>
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
pnpm -F admin-portal typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/admin-portal/src/app/[locale]/users/create/page.tsx
git commit -m "feat(admin-portal): split Full Name into Given Name + Family Name in user creation form"
```

---

### Task 3: Hub API — `enrollChw` split-name input

**Files:**
- Modify: `apps/hub-api/src/trpc/routers/admin.ts:6859-6926`
- Test: `apps/hub-api/src/__tests__/admin-router.test.ts`

- [ ] **Step 1: Write the failing test**

Append to the `describe('Admin Router — createUser split name')` block in `apps/hub-api/src/__tests__/admin-router.test.ts`:

```typescript
describe('Admin Router — enrollChw split name', () => {
  it('rejects input with legacy `fullName` field', async () => {
    const caller = createCallerFactory(adminRouter)(
      makeCtx({ sub: 'admin-1', role: 'ADMIN', sessionId: 's1', orgId: 'org-1' }),
    )
    // @ts-expect-error intentionally passing old shape
    await expect(caller.enrollChw({ fullName: 'Fatima Noori', phone: '+93700000001', assignedLabId: '00000000-0000-0000-0000-000000000001' }))
      .rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('accepts givenName + familyName and stores both encrypted columns separately', async () => {
    const labSingle = vi.fn().mockResolvedValue({ data: { id: 'lab-1' }, error: null })
    const insertSingle = vi.fn().mockResolvedValue({ data: null, error: null })
    const fromMock = vi.fn((table: string) => {
      if (table === 'labs') return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: labSingle }) }) }) }
      if (table === 'practitioners') return { insert: vi.fn().mockImplementation((row: Record<string, unknown>) => {
        // Verify both given_name and family_name are set (encrypted strings, not empty)
        expect(typeof row.given_name).toBe('string')
        expect((row.given_name as string).length).toBeGreaterThan(0)
        expect(typeof row.family_name).toBe('string')
        expect((row.family_name as string).length).toBeGreaterThan(0)
        return { then: insertSingle }
      }) }
      return { select: vi.fn() }
    })

    const ctx = {
      supabase: { from: fromMock } as never,
      user: { sub: 'admin-1', role: 'ADMIN', sessionId: 's1', orgId: 'org-1', status: null },
      headers: new Headers(),
    }

    const caller = createCallerFactory(adminRouter)(ctx)
    const result = await caller.enrollChw({
      givenName: 'Fatima',
      familyName: 'Noori',
      phone: '+93700000001',
      assignedLabId: '00000000-0000-0000-0000-000000000001',
    })
    expect(result.success).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm -F hub-api test --reporter=verbose admin-router
```

Expected: FAIL — `enrollChw` still takes `fullName`.

- [ ] **Step 3: Update `enrollChw` in `admin.ts`**

Find `enrollChw: adminProcedure` (line 6859).

**Input schema** — replace `fullName: z.string().min(1).max(255)` with:
```typescript
        givenName: z.string().min(1).max(200),
        familyName: z.string().max(200).default(''),
```

**Encryption block** — replace the `encryptedName` block (lines 6881-6888) with:
```typescript
      // Encrypt given_name and family_name (PHI) before storage
      let encryptedGivenName: string
      let encryptedFamilyName: string
      try {
        const key = await getCachedEncryptionKey()
        encryptedGivenName = encryptField(input.givenName, key)
        encryptedFamilyName = input.familyName ? encryptField(input.familyName, key) : ''
      } catch {
        encryptedGivenName = input.givenName
        encryptedFamilyName = input.familyName
      }
```

**Insert** — replace `given_name: encryptedName, family_name: ''` (lines 6896-6897) with:
```typescript
          given_name: encryptedGivenName,
          family_name: encryptedFamilyName,
```

- [ ] **Step 4: Run tests**

```bash
pnpm -F hub-api test --reporter=verbose admin-router
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/hub-api/src/trpc/routers/admin.ts apps/hub-api/src/__tests__/admin-router.test.ts
git commit -m "feat(hub-api): split enrollChw fullName into givenName + familyName"
```

---

### Task 4: Admin Portal — CHW Enrollment modal UI

**Files:**
- Modify: `apps/admin-portal/src/components/network/ChwEnrollmentModal.tsx`

- [ ] **Step 1: Implementation**

**State** — replace `const [fullName, setFullName] = useState('')` (line 29) with:
```typescript
  const [givenName, setGivenName] = useState('')
  const [familyName, setFamilyName] = useState('')
```

**Validation** — replace `const isValid = fullName.trim().length > 0 && phoneValid && assignedLabId` (line 37) with:
```typescript
  const isValid = givenName.trim().length > 0 && phoneValid && assignedLabId
```

**Submit call** — replace `fullName: fullName.trim()` (line 44) with:
```typescript
        givenName: givenName.trim(),
        familyName: familyName.trim(),
```

**Reset on "Enroll Another"** — replace `setFullName('')` (line 80) with:
```typescript
              setGivenName('')
              setFamilyName('')
```

**Form fields** — replace the `{/* Full Name */}` block (lines 94-106) with:
```tsx
            {/* Given Name */}
            <div>
              <label htmlFor="chw-given-name" className="block text-sm font-medium text-foreground">
                Given Name <span className="text-destructive">*</span>
              </label>
              <Input
                id="chw-given-name"
                type="text"
                value={givenName}
                onChange={(e) => setGivenName(e.target.value)}
                className="mt-1"
              />
            </div>

            {/* Family Name */}
            <div>
              <label htmlFor="chw-family-name" className="block text-sm font-medium text-foreground">
                Family Name / Last Name
              </label>
              <Input
                id="chw-family-name"
                type="text"
                value={familyName}
                onChange={(e) => setFamilyName(e.target.value)}
                className="mt-1"
              />
            </div>
```

- [ ] **Step 2: TypeScript check**

```bash
pnpm -F admin-portal typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/admin-portal/src/components/network/ChwEnrollmentModal.tsx
git commit -m "feat(admin-portal): split CHW enrollment Full Name into Given Name + Family Name"
```

---

### Task 5: Shared-types — add `nameFamily` to patient types

**Files:**
- Modify: `packages/shared-types/src/fhir/patient.ts`
- Modify: `packages/shared-types/src/fhir/patient.schema.ts`
- Test: `packages/shared-types/src/__tests__/patient.schema.test.ts`

- [ ] **Step 1: Write the failing test**

In `packages/shared-types/src/__tests__/patient.schema.test.ts`, find the describe block for `CreatePatientInputSchema` and add:

```typescript
  it('accepts nameFamily as optional string', () => {
    const base = {
      nameLocal: 'Ahmad',
      gender: 'male',
      birthDate: '1990-01-01',
      birthYearOnly: false,
      consent: { method: 'WRITTEN', language: 'en', version: '1.0' },
    }
    expect(CreatePatientInputSchema.safeParse({ ...base, nameFamily: 'Ahmadzai' }).success).toBe(true)
    expect(CreatePatientInputSchema.safeParse({ ...base, nameFamily: '' }).success).toBe(true)
    expect(CreatePatientInputSchema.safeParse(base).success).toBe(true)
  })

  it('rejects nameFamily longer than 200 chars', () => {
    const base = {
      nameLocal: 'Ahmad',
      gender: 'male',
      birthDate: '1990-01-01',
      birthYearOnly: false,
      consent: { method: 'WRITTEN', language: 'en', version: '1.0' },
    }
    const result = CreatePatientInputSchema.safeParse({ ...base, nameFamily: 'A'.repeat(201) })
    expect(result.success).toBe(false)
  })
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm -F shared-types test
```

Expected: FAIL — `nameFamily` not in schema yet.

- [ ] **Step 3: Update `patient.ts` types**

In `packages/shared-types/src/fhir/patient.ts`:

In `FhirPatient._ultranos`, after line `nameGrandfather?: string` (line 148), add:
```typescript
    nameFamily?: string       // optional family/last name (FHIR name[0].family)
```

In `CreatePatientInput`, after `nameGrandfather?: string` (line 203), add:
```typescript
  nameFamily?: string
```

- [ ] **Step 4: Update `patient.schema.ts`**

In `packages/shared-types/src/fhir/patient.schema.ts`, find where `nameGrandfather` is defined and add `nameFamily` immediately after it in both the `FhirPatientSchema._ultranos` shape and the `CreatePatientInputSchema` shape.

Example for `CreatePatientInputSchema`:
```typescript
  nameGrandfather: z.string().max(200).optional(),
  nameFamily: z.string().max(200).optional(),
```

- [ ] **Step 5: Run tests**

```bash
pnpm -F shared-types test
```

Expected: PASS — all schema tests green.

- [ ] **Step 6: Build shared-types**

```bash
pnpm --filter @ultranos/shared-types build
```

Expected: no TypeScript errors, dist updated.

- [ ] **Step 7: Commit**

```bash
git add packages/shared-types/src/fhir/patient.ts packages/shared-types/src/fhir/patient.schema.ts packages/shared-types/src/__tests__/patient.schema.test.ts
git commit -m "feat(shared-types): add nameFamily field to FhirPatient and CreatePatientInput"
```

---

### Task 6: DB migration — add `name_family` to `patients` table

**Files:**
- Supabase MCP migration

- [ ] **Step 1: Apply migration via Supabase MCP**

Use `mcp__plugin_supabase_supabase__apply_migration` with:

```sql
-- Add name_family (plain-text search index) and name_family_enc (encrypted PHI)
-- to match the existing name_given / name_given_enc pattern.
ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS name_family VARCHAR(300),
  ADD COLUMN IF NOT EXISTS name_family_enc TEXT;

COMMENT ON COLUMN patients.name_family IS 'Family/last name (plain text for search, no PHI content after MPI phase)';
COMMENT ON COLUMN patients.name_family_enc IS 'Encrypted family name (PHI)';
```

Migration name: `add_patient_name_family`

- [ ] **Step 2: Verify migration applied**

Use `mcp__plugin_supabase_supabase__list_migrations` and confirm `add_patient_name_family` appears.

Use `mcp__plugin_supabase_supabase__execute_sql` to verify columns exist:
```sql
SELECT column_name, data_type, character_maximum_length
FROM information_schema.columns
WHERE table_name = 'patients'
  AND column_name IN ('name_family', 'name_family_enc');
```

Expected: 2 rows.

- [ ] **Step 3: Commit**

The migration is tracked by Supabase. No files to commit here.

---

### Task 7: Hub API — add `nameFamily` to patient router

**Files:**
- Modify: `apps/hub-api/src/trpc/routers/patient.ts`

Context: The pattern in `patient.ts` for the three existing name fields is:
- SELECT includes both `name_given` and `name_given_enc` columns
- `toRow()` writes both `name_given: nameGiven` and `name_given_enc: nameGiven ?? null`
- Mapper reads `nameGiven: row.name_given`
- `_ultranos.nameFamily` is new; treat it identically to `nameGrandfather`

- [ ] **Step 1: Update SELECT queries**

There are **4 places** in `patient.ts` where the SELECT string lists `name_grandfather, name_grandfather_enc`. Find each one (lines ~52, ~200, ~776, ~814) and append `, name_family, name_family_enc` immediately after `name_grandfather_enc`:

Pattern to find (appears 4 times):
```
'name_grandfather, name_grandfather_enc, '
```

Replace each with:
```
'name_grandfather, name_grandfather_enc, name_family, name_family_enc, '
```

- [ ] **Step 2: Update row mappers**

Find every mapper that reads `nameGrandfather: row.name_grandfather` (lines ~124, ~264) and add immediately after:
```typescript
nameFamily:          row.name_family ?? undefined,
```

In `_ultranos` mapper blocks, find `nameGrandfather: row.name_grandfather` and add after:
```typescript
nameFamily:       row.name_family ?? undefined,
```

- [ ] **Step 3: Update `toRow()` function(s)**

Find every `name_grandfather_enc:` assignment in `toRow` (lines ~503, ~648) and add after:
```typescript
        name_family:            nameFamily ?? null,
        name_family_enc:        nameFamily ?? null,
```

Where `nameFamily` is destructured from the input. Add `nameFamily` to the destructuring at the top of `toRow`:

Find:
```typescript
const { ..., nameGrandfather, ... } = input
```
Add `nameFamily` to that destructuring.

- [ ] **Step 4: Update `patient.create` input schema**

In `patient.ts`, find the Zod schema for `patient.create` input and add `nameFamily: z.string().max(200).optional()` after `nameGrandfather`.

- [ ] **Step 5: TypeScript check**

```bash
pnpm -F hub-api typecheck
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/hub-api/src/trpc/routers/patient.ts
git commit -m "feat(hub-api): add nameFamily field to patient router SELECT, mappers, and toRow"
```

---

### Task 8: OPD Lite — NameInputSection, PatientRegistrationForm, i18n

**Files:**
- Modify: `apps/opd-lite/src/components/registration/NameInputSection.tsx`
- Modify: `apps/opd-lite/src/components/registration/PatientRegistrationForm.tsx`
- Modify: `apps/opd-lite/messages/en.json`
- Modify: `apps/opd-lite/messages/ar.json`
- Modify: `apps/opd-lite/messages/prs.json`
- Modify: `apps/opd-lite/messages/ps.json`

- [ ] **Step 1: Add i18n keys to all 4 locale files**

In `apps/opd-lite/messages/en.json`, inside the `"registration"` object, add after the `"nameGrandfatherPlaceholder"` entry:
```json
"nameFamily": "Family Name / Last Name",
"nameFamilyPlaceholder": "Optional family name"
```

In `apps/opd-lite/messages/ar.json`, same location:
```json
"nameFamily": "اسم العائلة",
"nameFamilyPlaceholder": "اسم العائلة (اختياري)"
```

In `apps/opd-lite/messages/prs.json`, same location:
```json
"nameFamily": "نام فامیل",
"nameFamilyPlaceholder": "نام فامیل (اختیاری)"
```

In `apps/opd-lite/messages/ps.json`, same location:
```json
"nameFamily": "د کورنۍ نوم",
"nameFamilyPlaceholder": "د کورنۍ نوم (اختیاري)"
```

- [ ] **Step 2: Update `NameInputSection.tsx` interface and component**

**Add `nameFamily` and handler to the props interface** (after `nameGrandfather`):
```typescript
interface NameInputSectionProps {
  nameGiven: string
  nameFather: string
  nameGrandfather: string
  nameFamily: string
  onNameGivenChange: (value: string) => void
  onNameFatherChange: (value: string) => void
  onNameGrandfatherChange: (value: string) => void
  onNameFamilyChange: (value: string) => void
  errors?: {
    nameGiven?: string
    nameFather?: string
    nameGrandfather?: string
    nameFamily?: string
  }
}
```

**Add `nameFamily` to destructuring** in the function signature.

**Update the nameLocal preview** — add `nameFamily` to the joined parts:
```typescript
  const nameParts = [nameGiven, nameFather, nameGrandfather, nameFamily].filter(Boolean)
```

**Add Family Name input field** — after the grandfather block and before the preview block:
```tsx
        {/* Family Name (Last Name) */}
        <div>
          <label
            htmlFor="name-family"
            className="mb-1 block text-sm font-semibold text-foreground"
          >
            {t('nameFamily')}
          </label>
          <input
            id="name-family"
            type="text"
            dir="auto"
            aria-invalid={!!errors?.nameFamily}
            aria-describedby={errors?.nameFamily ? 'name-family-error' : undefined}
            className={`w-full min-h-[44px] rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1 ${
              errors?.nameFamily
                ? 'border-destructive focus:border-destructive focus:ring-destructive'
                : 'border-border focus:border-primary focus:ring-ring'
            }`}
            placeholder={t('nameFamilyPlaceholder')}
            value={nameFamily}
            onChange={(e) => onNameFamilyChange(e.target.value)}
          />
          {errors?.nameFamily && (
            <p id="name-family-error" className="mt-1 text-sm text-destructive" role="alert">
              {errors.nameFamily}
            </p>
          )}
        </div>
```

- [ ] **Step 3: Update `PatientRegistrationForm.tsx`**

**Add state** (line ~171, after `nameGrandfather`):
```typescript
  const [nameFamily, setNameFamily] = useState('')
```

**Add `nameFamily` to `ClientRegistrationSchema`** (after `nameGrandfather` line):
```typescript
  nameFamily: z.string().max(200).optional(),
```

**Update `buildPayload`** — add after `nameGrandfather: nameGrandfather || undefined`:
```typescript
        nameFamily: nameFamily || undefined,
```

Also add `nameFamily` to the `useCallback` dependency array.

**Update `validate()`** — add after `nameGrandfather: nameGrandfather || undefined`:
```typescript
      nameFamily: nameFamily || undefined,
```

Also add `nameFamily` to the `useCallback` dependency array.

**Update `savePatientLocally`** — in `_ultranos`, add after `nameGrandfather`:
```typescript
          nameFamily: nameFamily || undefined,
```

Also add `nameFamily` to the `useCallback` dependency array.

**Pass `nameFamily` to `<NameInputSection>`** (lines ~524-536):
```tsx
        <NameInputSection
          nameGiven={nameGiven}
          nameFather={nameFather}
          nameGrandfather={nameGrandfather}
          nameFamily={nameFamily}
          onNameGivenChange={setNameGiven}
          onNameFatherChange={setNameFather}
          onNameGrandfatherChange={setNameGrandfather}
          onNameFamilyChange={setNameFamily}
          errors={{
            nameGiven: fieldErrors.nameGiven,
            nameFather: fieldErrors.nameFather,
            nameGrandfather: fieldErrors.nameGrandfather,
            nameFamily: fieldErrors.nameFamily,
          }}
        />
```

- [ ] **Step 4: TypeScript check**

```bash
pnpm -F opd-lite typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/opd-lite/src/components/registration/NameInputSection.tsx \
        apps/opd-lite/src/components/registration/PatientRegistrationForm.tsx \
        apps/opd-lite/messages/en.json \
        apps/opd-lite/messages/ar.json \
        apps/opd-lite/messages/prs.json \
        apps/opd-lite/messages/ps.json
git commit -m "feat(opd-lite): add Family Name / Last Name field to patient registration form"
```

---

## Self-Review

**Spec coverage:**
- Admin Portal user creation — Given Name + Family Name fields: ✅ Tasks 1-2
- CHW Enrollment — Given Name + Family Name fields: ✅ Tasks 3-4
- Patient registration — Given Name + Last Name (Family Name) fields: ✅ Tasks 5-8 (DB migration, shared-types, Hub API, UI)

**Placeholder scan:** All tasks contain complete code snippets. No TBDs.

**Type consistency:**
- `nameFamily` is used consistently in shared-types, patient.ts router, NameInputSection, and PatientRegistrationForm
- `givenName` / `familyName` are used consistently in admin.ts and both admin-portal UI files
- Hub API `createUser` return `name` is composed as `[input.givenName, input.familyName].filter(Boolean).join(' ')` — consistent with UI success display `{createdUser.name}`
