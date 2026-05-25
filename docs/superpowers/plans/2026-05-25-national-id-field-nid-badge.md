# National ID Field + NID Missing Badge — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a National ID# field to patient registration and edit forms, show an "NID Missing" amber badge on profiles and list views, and align both forms to a consistent field order.

**Architecture:** Pure frontend wiring — the backend already supports `nationalId` in create/update/checkDuplicates endpoints and stores it as `national_id_hash`. New `NidMissingBanner` component follows the existing `MpiWarnBanner` pattern. `GeographySection` gains a nomadic toggle prop for consistency between registration and edit forms.

**Tech Stack:** Next.js 15, React, TypeScript, Tailwind CSS, next-intl, Zod

**Spec:** `docs/superpowers/specs/2026-05-25-national-id-field-nid-badge-design.md`

---

### Task 1: Add i18n keys (en.json)

**Files:**
- Modify: `apps/opd-lite/messages/en.json:536-645` (registration section)
- Modify: `apps/opd-lite/messages/en.json:709-739` (patients section)

- [ ] **Step 1: Add new registration keys and fix missing bloodGroupLocked key**

Add these keys to the `"registration"` object in `en.json`, after the existing `"saving"` key (line 644):

```json
"bloodGroupLocked": "Blood group cannot be changed once set",
"nationalIdLabel": "National ID#",
"nationalIdPlaceholder": "Enter national ID number"
```

- [ ] **Step 2: Add NID Missing keys to the `"patient"` section**

Find the `"patient"` section and add:

```json
"nidMissing": "National ID missing — update patient profile when available.",
"nidMissingBadge": "NID Missing"
```

- [ ] **Step 3: Add NID Missing badge key to `"patients"` section (list view)**

In the `"patients"` section (line 709), add after `"allergyFlag"`:

```json
"nidMissingBadge": "NID Missing"
```

- [ ] **Step 4: Commit**

```bash
git add apps/opd-lite/messages/en.json
git commit -m "feat(i18n): add national ID and NID Missing badge translation keys"
```

---

### Task 2: Add nomadic toggle to GeographySection

**Files:**
- Modify: `apps/opd-lite/src/components/registration/GeographySection.tsx`

- [ ] **Step 1: Add isNomadic props to the interface**

In `GeographySectionProps` (line 15), add two new optional props:

```typescript
interface GeographySectionProps {
  origin: AddressFields
  current: AddressFields
  sameAsOrigin: boolean
  onOriginChange: (address: AddressFields) => void
  onCurrentChange: (address: AddressFields) => void
  onSameAsOriginChange: (checked: boolean) => void
  isNomadic?: boolean
  onIsNomadicChange?: (checked: boolean) => void
  errors?: {
    originProvince?: string
    originDistrict?: string
    currentProvince?: string
    currentDistrict?: string
  }
}
```

- [ ] **Step 2: Destructure the new props in the component**

Update the destructuring (line 30) to include the new props:

```typescript
export function GeographySection({
  origin,
  current,
  sameAsOrigin,
  onOriginChange,
  onCurrentChange,
  onSameAsOriginChange,
  isNomadic,
  onIsNomadicChange,
  errors,
}: GeographySectionProps) {
```

- [ ] **Step 3: Render the nomadic checkbox after the current address block**

Add the nomadic toggle at the end of the component, after the current address `</div>` (line 177) and before the closing `</Card>` (line 178):

```tsx
      {/* Nomadic toggle — only rendered when parent provides the callback */}
      {onIsNomadicChange && (
        <>
          <hr className="border-neutral-200 my-4" />
          <label className="flex items-center gap-2 cursor-pointer min-h-[44px]">
            <input
              type="checkbox"
              checked={isNomadic ?? false}
              onChange={(e) => onIsNomadicChange(e.target.checked)}
              className="h-5 w-5 rounded border-neutral-300 text-blue-600 focus:ring-blue-400"
            />
            <span className="text-sm font-medium text-neutral-700">
              {t('isNomadic')}
            </span>
          </label>
        </>
      )}
```

- [ ] **Step 4: Verify the existing i18n key**

The key `registration.isNomadic` already exists in `en.json` (line 640: `"isNomadic": "Nomadic / No Fixed Address"`). No new key needed.

- [ ] **Step 5: Commit**

```bash
git add apps/opd-lite/src/components/registration/GeographySection.tsx
git commit -m "feat(geography): add optional nomadic toggle to GeographySection"
```

---

### Task 3: Add National ID, Preferred Language, Blood Group, and Nomadic to Registration Form

**Files:**
- Modify: `apps/opd-lite/src/components/registration/PatientRegistrationForm.tsx`

This is the largest task. It adds four new fields and wires `nationalId` into the MPI check + create payloads.

- [ ] **Step 1: Add new state variables**

After the existing `phone` state (line 154), add:

```typescript
  const [nationalId, setNationalId] = useState('')
  const [preferredLanguage, setPreferredLanguage] = useState<'en' | 'ar' | 'prs'>(
    locale === 'prs' ? 'prs' : locale === 'ar' ? 'ar' : 'en',
  )
  const [isNomadic, setIsNomadic] = useState(false)
  const [bloodGroup, setBloodGroup] = useState<string>('Unknown')
```

Add a constant for blood group options at the top of the file, after the `EMPTY_ADDRESS` constant (line 130):

```typescript
const BLOOD_GROUPS = [
  'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Unknown',
] as const
```

- [ ] **Step 2: Update ClientRegistrationSchema**

Add the new fields to the Zod schema (after `phone` on line 100):

```typescript
  nationalId: z.string().max(200).optional(),
  preferredLanguage: z.enum(['en', 'ar', 'prs']).optional(),
  isNomadic: z.boolean().optional(),
  bloodGroup: z.string().optional(),
```

- [ ] **Step 3: Update buildPayload to include new fields**

In the `buildPayload` callback (line 181), add to the payload object after `phone`:

```typescript
        nationalId: nationalId || undefined,
        isNomadic,
        preferredLanguage: preferredLanguage || undefined,
        bloodGroup: bloodGroup !== 'Unknown' ? bloodGroup : undefined,
```

Update the dependency array to include `nationalId, preferredLanguage, isNomadic, bloodGroup`.

- [ ] **Step 4: Update validate to include new fields**

In the `validate` callback (line 242), add to the safeParse object after `phone`:

```typescript
      nationalId: nationalId || undefined,
      preferredLanguage: preferredLanguage || undefined,
      isNomadic,
      bloodGroup: bloodGroup || undefined,
```

Update the dependency array to include `nationalId, preferredLanguage, isNomadic, bloodGroup`.

- [ ] **Step 5: Wire nationalId into the MPI duplicate check**

In `handleSubmit` (line 351), add `nationalId` to the `dupeCheckInput` object:

```typescript
          nationalId: payload.nationalId as string | undefined,
```

- [ ] **Step 6: Update savePatientLocally with new fields**

In the `savePatientLocally` callback (line 299), update the `_ultranos` block to include:

```typescript
          isNomadic,
          bloodGroup: bloodGroup !== 'Unknown' ? bloodGroup : undefined,
          preferredLanguage: preferredLanguage || undefined,
          nationalIdHash: undefined, // Hash computed server-side; not available locally
```

Update the dependency array to include `nationalId, preferredLanguage, isNomadic, bloodGroup`.

- [ ] **Step 7: Add National ID input to the demographics JSX**

After the Phone `</div>` (line 601) and before the closing `</div></Card>` (lines 602-603), add:

```tsx
            {/* National ID */}
            <div>
              <label
                htmlFor="national-id"
                className="mb-1 block text-sm font-semibold text-neutral-700"
              >
                {t('nationalIdLabel')}
                <span className="ms-1 text-xs font-normal text-neutral-400">
                  ({t('optional')})
                </span>
              </label>
              <input
                id="national-id"
                type="text"
                inputMode="text"
                maxLength={200}
                className="w-full min-h-[44px] rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                placeholder={t('nationalIdPlaceholder')}
                value={nationalId}
                onChange={(e) => setNationalId(e.target.value)}
              />
            </div>

            {/* Preferred Language */}
            <div>
              <label
                htmlFor="preferred-language"
                className="mb-1 block text-sm font-semibold text-neutral-700"
              >
                {t('preferredLanguage')}
                <span className="ms-1 text-xs font-normal text-neutral-400">
                  ({t('optional')})
                </span>
              </label>
              <select
                id="preferred-language"
                value={preferredLanguage}
                onChange={(e) =>
                  setPreferredLanguage(e.target.value as 'en' | 'ar' | 'prs')
                }
                className="w-full min-h-[44px] rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
              >
                <option value="en">{isRtl ? 'English' : 'English'}</option>
                <option value="ar">{isRtl ? '\u0627\u0644\u0639\u0631\u0628\u064A\u0629' : 'Arabic'}</option>
                <option value="prs">{isRtl ? '\u062F\u0631\u06CC' : 'Dari'}</option>
              </select>
            </div>
```

- [ ] **Step 8: Pass isNomadic to GeographySection**

Update the `GeographySection` JSX (line 606) to pass the new props:

```tsx
        <GeographySection
          origin={addressOrigin}
          current={addressCurrent}
          sameAsOrigin={sameAsOrigin}
          onOriginChange={setAddressOrigin}
          onCurrentChange={setAddressCurrent}
          onSameAsOriginChange={setSameAsOrigin}
          isNomadic={isNomadic}
          onIsNomadicChange={setIsNomadic}
          errors={{
            originProvince: fieldErrors.addressOriginProvince,
            originDistrict: fieldErrors.addressOriginDistrict,
            currentProvince: fieldErrors.addressCurrentProvince,
            currentDistrict: fieldErrors.addressCurrentDistrict,
          }}
        />
```

- [ ] **Step 9: Add Clinical section before Consent**

After the GeographySection JSX and before the ConsentSection (line 622), add:

```tsx
        {/* Clinical section */}
        <Card as="fieldset">
          <legend className="text-base font-bold text-neutral-900 mb-4">
            {t('clinicalSection')}
          </legend>

          <div>
            <label
              htmlFor="blood-group"
              className="mb-1 block text-sm font-semibold text-neutral-700"
            >
              {t('bloodGroup')}
              <span className="ms-1 text-xs font-normal text-neutral-400">
                ({t('optional')})
              </span>
            </label>
            <select
              id="blood-group"
              value={bloodGroup}
              onChange={(e) => setBloodGroup(e.target.value)}
              className="w-full min-h-[44px] rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
            >
              {BLOOD_GROUPS.map((bg) => (
                <option key={bg} value={bg}>
                  {bg}
                </option>
              ))}
            </select>
          </div>
        </Card>
```

- [ ] **Step 10: Commit**

```bash
git add apps/opd-lite/src/components/registration/PatientRegistrationForm.tsx
git commit -m "feat(registration): add national ID, preferred language, blood group, nomadic fields"
```

---

### Task 4: Add National ID field + nomadic relocation in PatientEditModal

**Files:**
- Modify: `apps/opd-lite/src/components/patient/PatientEditModal.tsx`

- [ ] **Step 1: Add nationalId state**

After the `bloodGroup` state (line 117), add:

```typescript
  const [nationalId, setNationalId] = useState('')
```

- [ ] **Step 2: Initialize nationalId from patient on modal open**

In the `useEffect` that initializes form state (line 130), add after the blood group init (line 192):

```typescript
    setNationalId('') // Raw national ID is never stored; field starts empty for entry
```

- [ ] **Step 3: Compute hasNationalId for read-only display**

After the `bloodGroupLocked` const (line 125), add:

```typescript
  const hasNationalId = !!patient._ultranos.nationalIdHash
```

- [ ] **Step 4: Add nationalId to the save payload**

In the `handleSave` callback, add to the payload object (after `telecomPhone`):

```typescript
        nationalId: nationalId || undefined,
```

Update the dependency array to include `nationalId`.

- [ ] **Step 5: Pass isNomadic to GeographySection and remove standalone Card**

Update the `GeographySection` JSX to pass nomadic props:

```tsx
          <GeographySection
            origin={addressOrigin}
            current={addressCurrent}
            sameAsOrigin={sameAsOrigin}
            onOriginChange={setAddressOrigin}
            onCurrentChange={setAddressCurrent}
            onSameAsOriginChange={setSameAsOrigin}
            isNomadic={isNomadic}
            onIsNomadicChange={setIsNomadic}
            errors={{
              originProvince: fieldErrors.addressOriginProvince,
              originDistrict: fieldErrors.addressOriginDistrict,
              currentProvince: fieldErrors.addressCurrentProvince,
              currentDistrict: fieldErrors.addressCurrentDistrict,
            }}
          />
```

Remove the standalone nomadic `<Card>` block (the one with just the `isNomadic` checkbox, approximately lines 687-699).

- [ ] **Step 6: Add National ID field to demographics section**

After the Preferred Language block and before the closing `</div></Card>` of the demographics section, add:

```tsx
              {/* National ID */}
              <div>
                <label
                  htmlFor="edit-national-id"
                  className="mb-1 block text-sm font-semibold text-neutral-700"
                >
                  {t('nationalIdLabel')}
                  <span className="ms-1 text-xs font-normal text-neutral-400">
                    ({t('optional')})
                  </span>
                </label>
                {hasNationalId ? (
                  <p className="min-h-[44px] flex items-center rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-600">
                    {t('nationalId')} ••••••
                  </p>
                ) : (
                  <input
                    id="edit-national-id"
                    type="text"
                    inputMode="text"
                    maxLength={200}
                    className="w-full min-h-[44px] rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                    placeholder={t('nationalIdPlaceholder')}
                    value={nationalId}
                    onChange={(e) => setNationalId(e.target.value)}
                  />
                )}
              </div>
```

- [ ] **Step 7: Commit**

```bash
git add apps/opd-lite/src/components/patient/PatientEditModal.tsx
git commit -m "feat(edit-modal): add national ID field, relocate nomadic into GeographySection"
```

---

### Task 5: Create NidMissingBanner component

**Files:**
- Create: `apps/opd-lite/src/components/patient/NidMissingBanner.tsx`

- [ ] **Step 1: Create the banner component**

Create `apps/opd-lite/src/components/patient/NidMissingBanner.tsx`:

```tsx
'use client'

import { useTranslations } from 'next-intl'

/**
 * Amber warning banner displayed when a patient has no national ID on file.
 * Matches the visual treatment of MpiWarnBanner.
 */
export function NidMissingBanner() {
  const t = useTranslations('patient')

  return (
    <div
      role="status"
      className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800"
    >
      {t('nidMissing')}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/opd-lite/src/components/patient/NidMissingBanner.tsx
git commit -m "feat(patient): add NidMissingBanner component"
```

---

### Task 6: Add NidMissingBanner to PatientBannerStack

**Files:**
- Modify: `apps/opd-lite/src/components/patient/PatientBannerStack.tsx`

- [ ] **Step 1: Import the new component**

Add to the imports (after `MpiWarnBanner` import, line 6):

```typescript
import { NidMissingBanner } from '@/components/patient/NidMissingBanner'
```

- [ ] **Step 2: Read nationalIdHash from patient**

In the component body (after line 35), add:

```typescript
  const hasNationalId = !!patient._ultranos.nationalIdHash
```

- [ ] **Step 3: Render NidMissingBanner in priority order**

After the MpiWarnBanner block (line 50) and before the consent expiry block (line 53), add:

```tsx
      {/* 4. NID missing — only when no national ID hash */}
      {!hasNationalId && <NidMissingBanner />}
```

Update the existing comments to reflect the new numbering:
- Consent expiry becomes `{/* 5. ... */}`
- Biometric stale becomes `{/* 6. ... */}`

- [ ] **Step 4: Commit**

```bash
git add apps/opd-lite/src/components/patient/PatientBannerStack.tsx
git commit -m "feat(banners): add NidMissingBanner to PatientBannerStack"
```

---

### Task 7: Add NID Missing badge to PatientDirectory list

**Files:**
- Modify: `apps/opd-lite/src/components/patients/PatientDirectory.tsx`

- [ ] **Step 1: Add hasNationalId to PatientRow interface and row builder**

Update the `PatientRow` interface (line 18) to include:

```typescript
interface PatientRow {
  id: string
  name: string
  age: number | null
  gender: string
  phone: string
  lastVisit: string | null
  status: string
  hasAllergies: boolean
  hasNationalId: boolean
}
```

In the `rows` builder (line 169), add to the mapped object:

```typescript
      hasNationalId: !!p._ultranos?.nationalIdHash,
```

- [ ] **Step 2: Add the NID Missing badge to the name cell**

In the table body (line 414), update the name `<td>` to include the badge:

```tsx
                    <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">
                      <span className="flex items-center gap-2">
                        {row.name}
                        {!row.hasNationalId && (
                          <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                            {t('nidMissingBadge')}
                          </span>
                        )}
                      </span>
                    </td>
```

- [ ] **Step 3: Commit**

```bash
git add apps/opd-lite/src/components/patients/PatientDirectory.tsx
git commit -m "feat(patient-list): add NID Missing badge to patient directory"
```

---

### Task 8: Add i18n keys for ar.json and prs.json

**Files:**
- Modify: `apps/opd-lite/messages/ar.json`
- Modify: `apps/opd-lite/messages/prs.json`

- [ ] **Step 1: Add Arabic translations**

Add the same keys to `ar.json` in the corresponding sections:

In `"registration"`:
```json
"bloodGroupLocked": "لا يمكن تغيير فصيلة الدم بعد تعيينها",
"nationalIdLabel": "رقم الهوية الوطنية",
"nationalIdPlaceholder": "أدخل رقم الهوية الوطنية"
```

In `"patient"`:
```json
"nidMissing": "الهوية الوطنية مفقودة — قم بتحديث ملف المريض عند التوفر.",
"nidMissingBadge": "بدون هوية"
```

In `"patients"`:
```json
"nidMissingBadge": "بدون هوية"
```

- [ ] **Step 2: Add Dari translations**

Add the same keys to `prs.json` in the corresponding sections:

In `"registration"`:
```json
"bloodGroupLocked": "گروپ خون بعد از تنظیم قابل تغییر نیست",
"nationalIdLabel": "شماره تذکره",
"nationalIdPlaceholder": "شماره تذکره را وارد کنید"
```

In `"patient"`:
```json
"nidMissing": "تذکره موجود نیست — هنگام دسترسی مشخصات بیمار را بروز کنید.",
"nidMissingBadge": "بدون تذکره"
```

In `"patients"`:
```json
"nidMissingBadge": "بدون تذکره"
```

- [ ] **Step 3: Commit**

```bash
git add apps/opd-lite/messages/ar.json apps/opd-lite/messages/prs.json
git commit -m "feat(i18n): add Arabic and Dari translations for national ID and NID badge"
```

---

### Task 9: Manual verification

- [ ] **Step 1: Start the Hub API dev server**

```bash
pnpm -F hub-api dev
```

- [ ] **Step 2: Start OPD Lite dev server**

```bash
pnpm -F opd-lite dev
```

- [ ] **Step 3: Verify registration form**

1. Navigate to `http://localhost:3001/en/register-patient`
2. Verify field order: Name → Demographics (Gender, Birth, Phone, National ID#, Preferred Language) → Geography (Origin, Current, Nomadic) → Clinical (Blood Group) → Consent
3. Fill in all fields including a national ID
4. Submit and verify it creates the patient

- [ ] **Step 4: Verify registration without national ID**

1. Register a patient without entering a national ID
2. Navigate to the patient profile
3. Verify the amber "NID Missing" banner appears below the MPI warn position

- [ ] **Step 5: Verify patient directory badge**

1. Navigate to the patient directory
2. Verify the amber "NID Missing" pill badge appears next to patients without a national ID
3. Verify patients WITH a national ID do NOT show the badge

- [ ] **Step 6: Verify edit modal**

1. Open the edit profile modal for a patient without a national ID
2. Verify the national ID field is editable
3. Enter a national ID and save
4. Re-open the modal — verify the field shows "••••••" (masked, read-only)
5. Verify the NID Missing banner is gone from the profile page

- [ ] **Step 7: Verify nomadic toggle location**

1. In both registration and edit modal, verify the nomadic checkbox is inside the Geography section (after current address), not as a standalone card
