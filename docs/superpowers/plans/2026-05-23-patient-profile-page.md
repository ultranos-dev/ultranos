# Patient Profile Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the OPD-Lite PatientChartPage as a compositional shell with enterprise-grade patient demographics, photo upload, baseline vitals, active medications, safety banners, and a profile edit modal.

**Architecture:** The monolithic `PatientChartPage` becomes a thin shell that loads a patient from Dexie and composes focused sub-components: `PatientBannerStack`, `PatientHeaderCard` (with `PatientAvatar`), `PatientEditModal`, `PatientDetailsAccordion`, `ActiveMedicationsList`, plus existing `EncounterHistoryList` and `LabResultsList`. Backend adds two DB columns (`photo_url`, `blood_group`), a Supabase Storage bucket (`patient-photos`), and extends the existing `patient.update` tRPC mutation.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Tailwind CSS, Dexie (IndexedDB), Supabase Storage, tRPC, Zod, Vitest

**Spec:** `docs/superpowers/specs/2026-05-23-patient-profile-page-design.md`

---

## Task 1: Database Migration — Add photo_url and blood_group columns

**Files:**
- Supabase migration (applied via MCP)

- [ ] **Step 1: Apply migration to add columns**

Use Supabase MCP to apply the migration:

```sql
ALTER TABLE patients ADD COLUMN photo_url TEXT;
ALTER TABLE patients ADD COLUMN blood_group TEXT;
```

- [ ] **Step 2: Create patient-photos storage bucket**

Use Supabase MCP to create the bucket:

```sql
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'patient-photos',
  'patient-photos',
  false,
  524288,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
);
```

- [ ] **Step 3: Add RLS policy for patient-photos bucket**

```sql
CREATE POLICY "Authenticated users can upload patient photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'patient-photos');

CREATE POLICY "Authenticated users can read patient photos"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'patient-photos');

CREATE POLICY "Authenticated users can update patient photos"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'patient-photos');
```

- [ ] **Step 4: Verify migration**

```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'patients' AND column_name IN ('photo_url', 'blood_group');
```

Expected: Two rows — `photo_url TEXT`, `blood_group TEXT`.

```sql
SELECT id, name, public FROM storage.buckets WHERE id = 'patient-photos';
```

Expected: One row — `patient-photos`, `false`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(hub-api): add photo_url, blood_group columns and patient-photos storage bucket"
```

---

## Task 2: Extend FhirPatient Type

**Files:**
- Modify: `packages/shared-types/src/fhir/patient.ts`

- [ ] **Step 1: Add photoUrl and bloodGroup to _ultranos**

In `packages/shared-types/src/fhir/patient.ts`, add these fields inside the `_ultranos` block, after the `identifiers` field (around line 97):

```typescript
    /** Patient photo path in Supabase Storage (patient-photos bucket) */
    photoUrl?: string
    /** Blood group — write-once after first save */
    bloodGroup?: string
```

- [ ] **Step 2: Verify shared-types builds**

Run: `pnpm -F @ultranos/shared-types build`
Expected: Clean build with no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/shared-types/src/fhir/patient.ts
git commit -m "feat(shared-types): add photoUrl and bloodGroup to FhirPatient _ultranos"
```

---

## Task 3: Extend patient.update tRPC Mutation

**Files:**
- Modify: `apps/hub-api/src/trpc/routers/patient.ts` (lines 886-1057)

- [ ] **Step 1: Extend the input schema**

In `apps/hub-api/src/trpc/routers/patient.ts`, find the `update` procedure's `.input()` call (line 888). Add these fields to the z.object after `consentVersion` (line 901):

```typescript
        // MPI Phase 1 fields
        nameGiven: z.string().max(200).optional(),
        nameFather: z.string().max(200).optional(),
        nameGrandfather: z.string().max(200).optional(),
        birthYear: z.number().int().min(1900).max(new Date().getFullYear()).optional(),
        addressProvinceOrigin: z.string().optional(),
        addressDistrictOrigin: z.string().optional(),
        addressVillageOrigin: z.string().max(200).optional(),
        addressProvinceCurrent: z.string().optional(),
        addressDistrictCurrent: z.string().optional(),
        addressVillageCurrent: z.string().max(200).optional(),
        isNomadic: z.boolean().optional(),
        preferredLanguage: z.enum(['en', 'ar', 'prs']).optional(),
        // Profile page additions
        photoUrl: z.string().max(500).optional(),
        bloodGroup: z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Unknown']).optional(),
```

- [ ] **Step 2: Add field mapping logic in the mutation handler**

After the existing `consentVersion` field mapping (around line 971), add:

```typescript
      if (input.nameGiven !== undefined) {
        updates.nameGiven = input.nameGiven
        updates.nameGivenEnc = input.nameGiven
        fieldsUpdated.push('nameGiven')
      }
      if (input.nameFather !== undefined) {
        updates.nameFather = input.nameFather
        updates.nameFatherEnc = input.nameFather
        fieldsUpdated.push('nameFather')
      }
      if (input.nameGrandfather !== undefined) {
        updates.nameGrandfather = input.nameGrandfather
        updates.nameGrandfatherEnc = input.nameGrandfather
        fieldsUpdated.push('nameGrandfather')
      }
      if (input.birthYear !== undefined) {
        updates.birthYear = input.birthYear
        fieldsUpdated.push('birthYear')
      }
      if (input.addressProvinceOrigin !== undefined) {
        updates.addressProvinceOrigin = input.addressProvinceOrigin
        fieldsUpdated.push('addressProvinceOrigin')
      }
      if (input.addressDistrictOrigin !== undefined) {
        updates.addressDistrictOrigin = input.addressDistrictOrigin
        fieldsUpdated.push('addressDistrictOrigin')
      }
      if (input.addressVillageOrigin !== undefined) {
        updates.addressVillageOrigin = input.addressVillageOrigin
        fieldsUpdated.push('addressVillageOrigin')
      }
      if (input.addressProvinceCurrent !== undefined) {
        updates.addressProvinceCurrent = input.addressProvinceCurrent
        fieldsUpdated.push('addressProvinceCurrent')
      }
      if (input.addressDistrictCurrent !== undefined) {
        updates.addressDistrictCurrent = input.addressDistrictCurrent
        fieldsUpdated.push('addressDistrictCurrent')
      }
      if (input.addressVillageCurrent !== undefined) {
        updates.addressVillageCurrent = input.addressVillageCurrent
        fieldsUpdated.push('addressVillageCurrent')
      }
      if (input.isNomadic !== undefined) {
        updates.isNomadic = input.isNomadic
        fieldsUpdated.push('isNomadic')
      }
      if (input.preferredLanguage !== undefined) {
        updates.preferredLanguage = input.preferredLanguage
        fieldsUpdated.push('preferredLanguage')
      }
      if (input.photoUrl !== undefined) {
        updates.photoUrl = input.photoUrl
        fieldsUpdated.push('photoUrl')
      }
      if (input.bloodGroup !== undefined) {
        // Write-once enforcement: reject if already set to non-null
        if (current.blood_group && current.blood_group !== 'Unknown') {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Blood group is write-once and already set',
          })
        }
        updates.bloodGroup = input.bloodGroup
        fieldsUpdated.push('bloodGroup')
      }
```

- [ ] **Step 3: Extend the current patient fetch to include blood_group**

Update the `.select()` on line 908 to include `blood_group`:

```typescript
        .select('id, updated_at, national_id_hash, blood_group')
```

- [ ] **Step 4: Commit**

```bash
git add apps/hub-api/src/trpc/routers/patient.ts
git commit -m "feat(hub-api): extend patient.update mutation with profile fields, photo, blood group"
```

---

## Task 4: PatientBannerStack Component

**Files:**
- Create: `apps/opd-lite/src/components/patient/PatientBannerStack.tsx`

- [ ] **Step 1: Create PatientBannerStack**

```typescript
'use client'

import type { FhirPatient } from '@ultranos/shared-types'
import { AllergyBanner } from '@/components/clinical/AllergyBanner'
import { ConflictBanner } from '@/components/sync/ConflictBanner'
import { MpiWarnBanner } from '@/components/patient/MpiWarnBanner'
import { ConsentExpiryBanner } from '@/components/patient/ConsentExpiryBanner'
import { BiometricStaleBanner } from '@/components/patient/BiometricStaleBanner'

const BIOMETRIC_EXPECTED_VERSION =
  process.env.NEXT_PUBLIC_BIOMETRIC_ALGORITHM_VERSION ?? '1.0'

interface PatientBannerStackProps {
  patient: FhirPatient
  patientId: string
  consentExpiryDate?: string | null
}

export function PatientBannerStack({
  patient,
  patientId,
  consentExpiryDate,
}: PatientBannerStackProps) {
  const ultranos = patient._ultranos
  const mpiScore = ultranos?.mpiScore
  const biometricVersion = ultranos?.biometricAlgorithmVersion ?? null

  return (
    <div className="space-y-2">
      {/* CLAUDE.md Rule #4: Allergies render FIRST, in red, never collapsed */}
      <AllergyBanner patientId={patientId} />

      {/* Tier 1 sync conflicts — blocks prescriptions until resolved */}
      <ConflictBanner patientId={patientId} />

      {/* MPI duplicate warning — wrong-patient risk */}
      {mpiScore != null && mpiScore > 0 && (
        <MpiWarnBanner mpiScore={mpiScore} patientId={patientId} />
      )}

      {/* Consent approaching expiry */}
      {consentExpiryDate && (
        <ConsentExpiryBanner patientId={patientId} expiryDate={consentExpiryDate} />
      )}

      {/* Biometric algorithm outdated */}
      {biometricVersion !== BIOMETRIC_EXPECTED_VERSION && (
        <BiometricStaleBanner
          currentVersion={biometricVersion}
          expectedVersion={BIOMETRIC_EXPECTED_VERSION}
          onUpdateBiometric={() => {
            // Biometric re-enrollment flow not yet implemented
          }}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/opd-lite/src/components/patient/PatientBannerStack.tsx
git commit -m "feat(opd-lite): add PatientBannerStack composing safety banners in priority order"
```

---

## Task 5: PatientAvatar Component

**Files:**
- Create: `apps/opd-lite/src/components/patient/PatientAvatar.tsx`

- [ ] **Step 1: Create PatientAvatar**

```typescript
'use client'

import { useState, useRef, useCallback } from 'react'
import type { FhirPatient } from '@ultranos/shared-types'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { auditPhiAccess, AuditAction, AuditResourceType } from '@/lib/audit'

interface PatientAvatarProps {
  patient: FhirPatient
  patientId: string
  size?: number
  onPhotoUpdated?: (photoUrl: string) => void
}

function getInitials(patient: FhirPatient): string {
  const given = patient._ultranos?.nameGiven ?? ''
  const father = patient._ultranos?.nameFather ?? ''
  if (given && father) return `${given[0]}${father[0]}`
  if (given) return given[0] ?? '?'
  return '?'
}

function getInitialsBg(patientId: string): string {
  const colors = [
    'bg-blue-500', 'bg-green-500', 'bg-amber-500', 'bg-purple-500',
    'bg-pink-500', 'bg-teal-500', 'bg-indigo-500', 'bg-rose-500',
  ]
  let hash = 0
  for (let i = 0; i < patientId.length; i++) {
    hash = patientId.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]!
}

async function resizeImage(file: File, maxSize: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      let { width, height } = img
      if (width > maxSize || height > maxSize) {
        if (width > height) {
          height = Math.round((height * maxSize) / width)
          width = maxSize
        } else {
          width = Math.round((width * maxSize) / height)
          height = maxSize
        }
      }
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, width, height)
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Canvas toBlob failed'))),
        'image/jpeg',
        0.8,
      )
    }
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = URL.createObjectURL(file)
  })
}

export function PatientAvatar({ patient, patientId, size = 80, onPhotoUpdated }: PatientAvatarProps) {
  const [photoSrc, setPhotoSrc] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Load signed URL on mount if photoUrl exists
  const [loaded, setLoaded] = useState(false)
  if (!loaded && patient._ultranos?.photoUrl) {
    setLoaded(true)
    const supabase = getSupabaseBrowserClient()
    supabase.storage
      .from('patient-photos')
      .createSignedUrl(patient._ultranos.photoUrl, 3600)
      .then(({ data }) => {
        if (data?.signedUrl) setPhotoSrc(data.signedUrl)
      })
      .catch(() => {
        // Signed URL failed — fall back to initials
      })
  }

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return

      if (!navigator.onLine) {
        setError('Photo upload requires internet connection')
        return
      }

      setUploading(true)
      setError(null)

      try {
        const resized = await resizeImage(file, 400)
        const storagePath = `${patientId}.jpg`
        const supabase = getSupabaseBrowserClient()

        const { error: uploadError } = await supabase.storage
          .from('patient-photos')
          .upload(storagePath, resized, {
            contentType: 'image/jpeg',
            upsert: true,
          })

        if (uploadError) throw uploadError

        // Get signed URL for display
        const { data: urlData } = await supabase.storage
          .from('patient-photos')
          .createSignedUrl(storagePath, 3600)

        if (urlData?.signedUrl) {
          setPhotoSrc(urlData.signedUrl)
        }

        auditPhiAccess(
          AuditAction.WRITE,
          AuditResourceType.PATIENT,
          patientId,
          patientId,
          { phiAccess: 'photo_upload' },
        )

        onPhotoUpdated?.(storagePath)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Upload failed')
      } finally {
        setUploading(false)
        // Reset input so same file can be re-selected
        if (fileInputRef.current) fileInputRef.current.value = ''
      }
    },
    [patientId, onPhotoUpdated],
  )

  const initials = getInitials(patient)
  const bgClass = getInitialsBg(patientId)

  return (
    <div className="relative inline-block" style={{ width: size, height: size }}>
      {photoSrc ? (
        <img
          src={photoSrc}
          alt=""
          className="rounded-full object-cover"
          style={{ width: size, height: size }}
        />
      ) : (
        <div
          className={`flex items-center justify-center rounded-full text-white font-bold ${bgClass}`}
          style={{ width: size, height: size, fontSize: size * 0.35 }}
          aria-hidden="true"
        >
          {initials}
        </div>
      )}

      {/* Upload overlay */}
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        className="absolute inset-0 flex items-center justify-center rounded-full bg-black/0 hover:bg-black/40 transition-colors group"
        aria-label="Upload patient photo"
      >
        <svg
          className="h-5 w-5 text-white opacity-0 group-hover:opacity-100 transition-opacity"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
          />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileSelect}
        className="hidden"
        aria-hidden="true"
      />

      {uploading && (
        <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
        </div>
      )}

      {error && (
        <p className="absolute -bottom-6 start-0 text-xs text-red-600 whitespace-nowrap">{error}</p>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/opd-lite/src/components/patient/PatientAvatar.tsx
git commit -m "feat(opd-lite): add PatientAvatar with photo upload via Supabase Storage"
```

---

## Task 6: PatientHeaderCard Component

**Files:**
- Create: `apps/opd-lite/src/components/patient/PatientHeaderCard.tsx`

- [ ] **Step 1: Create PatientHeaderCard**

```typescript
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { FhirPatient } from '@ultranos/shared-types'
import { PatientAvatar } from '@/components/patient/PatientAvatar'
import { db } from '@/lib/db'

interface PatientHeaderCardProps {
  patient: FhirPatient
  patientId: string
  onEditClick: () => void
  onPatientUpdated: (patient: FhirPatient) => void
}

function formatAge(birthDate?: string, birthYear?: number): string {
  if (birthDate && birthDate.length >= 4) {
    const birth = new Date(birthDate)
    const now = new Date()
    let age = now.getFullYear() - birth.getFullYear()
    const monthDiff = now.getMonth() - birth.getMonth()
    if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
      age--
    }
    return `${age}y`
  }
  if (birthYear) {
    return `${new Date().getFullYear() - birthYear}y`
  }
  return '--'
}

function formatGender(gender?: string): string {
  if (!gender) return '--'
  return gender.charAt(0).toUpperCase() + gender.slice(1)
}

interface BaselineVitals {
  heightCm: number | null
  weightKg: number | null
}

async function loadBaselineVitals(patientId: string): Promise<BaselineVitals> {
  const patientRef = `Patient/${patientId}`
  let heightCm: number | null = null
  let weightKg: number | null = null

  try {
    // Latest height (LOINC 8302-2)
    const heights = await db.observations
      .where('subject.reference')
      .equals(patientRef)
      .toArray()
    const heightObs = heights
      .filter((o) => o.code?.coding?.some((c) => c.code === '8302-2'))
      .sort((a, b) => (b.meta?.lastUpdated ?? '').localeCompare(a.meta?.lastUpdated ?? ''))
    if (heightObs[0]?.valueQuantity?.value != null) {
      heightCm = heightObs[0].valueQuantity.value
    }

    // Latest weight (LOINC 29463-7)
    const weightObs = heights
      .filter((o) => o.code?.coding?.some((c) => c.code === '29463-7'))
      .sort((a, b) => (b.meta?.lastUpdated ?? '').localeCompare(a.meta?.lastUpdated ?? ''))
    if (weightObs[0]?.valueQuantity?.value != null) {
      weightKg = weightObs[0].valueQuantity.value
    }
  } catch {
    // Observations unavailable — vitals show as --
  }

  return { heightCm, weightKg }
}

function calculateBmi(heightCm: number | null, weightKg: number | null): string {
  if (!heightCm || !weightKg || heightCm <= 0) return '--'
  const bmi = weightKg / ((heightCm / 100) ** 2)
  return bmi.toFixed(1)
}

export function PatientHeaderCard({
  patient,
  patientId,
  onEditClick,
  onPatientUpdated,
}: PatientHeaderCardProps) {
  const [vitals, setVitals] = useState<BaselineVitals>({ heightCm: null, weightKg: null })
  const ultranos = patient._ultranos

  useEffect(() => {
    loadBaselineVitals(patientId).then(setVitals)
  }, [patientId])

  const age = formatAge(patient.birthDate, ultranos?.birthYear)
  const gender = formatGender(patient.gender)
  const phone = patient.telecom?.find((t) => t.system === 'phone')?.value
  const bloodGroup = ultranos?.bloodGroup ?? '--'
  const heightDisplay = vitals.heightCm != null ? `${vitals.heightCm}cm` : '--'
  const weightDisplay = vitals.weightKg != null ? `${vitals.weightKg}kg` : '--'
  const bmiDisplay = `BMI ${calculateBmi(vitals.heightCm, vitals.weightKg)}`

  const handlePhotoUpdated = async (photoUrl: string) => {
    // Update Hub API
    try {
      const { getSupabaseBrowserClient } = await import('@/lib/supabase')
      const supabase = getSupabaseBrowserClient()
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token

      const hubUrl = process.env.NEXT_PUBLIC_HUB_API_URL ?? 'http://localhost:3000/api/trpc'
      await fetch(`${hubUrl}/patient.update`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          json: {
            patientId,
            lastKnownUpdate: patient.meta.lastUpdated,
            photoUrl,
          },
        }),
      })
    } catch {
      // Photo URL update to Hub failed — will sync later
    }

    // Update local Dexie
    const updated: FhirPatient = {
      ...patient,
      _ultranos: { ...patient._ultranos, photoUrl },
      meta: { ...patient.meta, lastUpdated: new Date().toISOString() },
    }
    try {
      await db.patients.put(updated)
    } catch {
      // Dexie update failed
    }
    onPatientUpdated(updated)
  }

  return (
    <section
      className="rounded-xl bg-card-bg p-5 shadow-sm ring-[0.65px] ring-gray-400/40"
      aria-label="Patient identity"
    >
      <div className="flex items-start gap-4">
        <PatientAvatar
          patient={patient}
          patientId={patientId}
          size={80}
          onPhotoUpdated={handlePhotoUpdated}
        />

        <div className="min-w-0 flex-1">
          {/* Patronymic chain */}
          <h2 className="text-xl font-bold text-neutral-900 truncate" dir="auto">
            {ultranos?.nameGiven ?? ultranos?.nameLocal ?? '--'}
          </h2>
          {(ultranos?.nameFather || ultranos?.nameGrandfather) && (
            <p className="text-sm text-neutral-500 truncate" dir="auto">
              {[
                ultranos?.nameFather ? `Father: ${ultranos.nameFather}` : null,
                ultranos?.nameGrandfather ? `Grandfather: ${ultranos.nameGrandfather}` : null,
              ]
                .filter(Boolean)
                .join(' \u00b7 ')}
            </p>
          )}
          {ultranos?.nameLatin && (
            <p className="text-xs text-neutral-400 truncate">{ultranos.nameLatin}</p>
          )}

          {/* Demographics row */}
          <p className="mt-1 text-sm font-medium text-neutral-600">
            {[gender, age, phone].filter((v) => v && v !== '--').join(' \u00b7 ')}
          </p>

          {/* Baseline vitals row */}
          <p className="mt-0.5 text-sm text-neutral-500">
            {[heightDisplay, weightDisplay, bmiDisplay, bloodGroup]
              .filter((v) => v !== '--' && v !== 'BMI --')
              .join(' \u00b7 ') || 'No vitals recorded'}
          </p>
        </div>
      </div>

      {/* Action buttons */}
      <div className="mt-4 flex items-center justify-between">
        <button
          type="button"
          onClick={onEditClick}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold text-neutral-600 hover:bg-neutral-100 transition-colors"
          aria-label="Edit patient profile"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
          Edit Profile
        </button>

        <Link
          href={`/encounter/${patientId}`}
          className="inline-flex items-center justify-center rounded-pill font-semibold transition-all duration-100 ease-out hover:brightness-[1.04] active:brightness-[0.88] focus:outline-none focus:ring-2 focus:ring-primary-300 focus:ring-offset-2 bg-pill-green text-pill-text px-5 py-2 text-sm"
        >
          Start New Encounter
        </Link>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/opd-lite/src/components/patient/PatientHeaderCard.tsx
git commit -m "feat(opd-lite): add PatientHeaderCard with avatar, patronymic chain, vitals, actions"
```

---

## Task 7: PatientDetailsAccordion Component

**Files:**
- Create: `apps/opd-lite/src/components/patient/PatientDetailsAccordion.tsx`

- [ ] **Step 1: Create PatientDetailsAccordion**

```typescript
'use client'

import { useState } from 'react'
import type { FhirPatient } from '@ultranos/shared-types'

interface PatientDetailsAccordionProps {
  patient: FhirPatient
}

function formatAddress(addr?: { province: string; district: string; village?: string }): string {
  if (!addr) return '--'
  return [addr.village, addr.district, addr.province].filter(Boolean).join(', ')
}

function addressesMatch(
  a?: { province: string; district: string; village?: string },
  b?: { province: string; district: string; village?: string },
): boolean {
  if (!a && !b) return true
  if (!a || !b) return false
  return a.province === b.province && a.district === b.district && (a.village ?? '') === (b.village ?? '')
}

export function PatientDetailsAccordion({ patient }: PatientDetailsAccordionProps) {
  const [open, setOpen] = useState(false)
  const ultranos = patient._ultranos

  return (
    <div className="rounded-xl bg-card-bg shadow-sm ring-[0.65px] ring-gray-400/40">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-5 py-3 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 transition-colors rounded-xl"
        aria-expanded={open}
      >
        <span>Patient Details</span>
        <svg
          className={`h-4 w-4 text-neutral-400 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="border-t border-neutral-200 px-5 py-4 space-y-4">
          {/* Address & Geography */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wide text-neutral-400 mb-2">
              Address &amp; Geography
            </h4>
            <div className="space-y-1.5 text-sm text-neutral-700">
              <div>
                <span className="font-medium text-neutral-500">Origin: </span>
                <span dir="auto">{formatAddress(ultranos?.addressOrigin)}</span>
              </div>
              <div>
                <span className="font-medium text-neutral-500">Current: </span>
                <span dir="auto">
                  {addressesMatch(ultranos?.addressOrigin, ultranos?.addressCurrent)
                    ? 'Same as origin'
                    : formatAddress(ultranos?.addressCurrent)}
                </span>
              </div>
              {ultranos?.isNomadic && (
                <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                  Nomadic
                </span>
              )}
            </div>
          </div>

          <hr className="border-neutral-200" />

          {/* Identity & Records */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wide text-neutral-400 mb-2">
              Identity &amp; Records
            </h4>
            <div className="space-y-1.5 text-sm text-neutral-700">
              {/* Tier */}
              <div className="flex items-center gap-2">
                <span className="font-medium text-neutral-500">Tier:</span>
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                    ultranos?.patient_tier === 'PREMIUM'
                      ? 'bg-purple-100 text-purple-700'
                      : 'bg-neutral-100 text-neutral-600'
                  }`}
                >
                  {ultranos?.patient_tier ?? 'FREE'}
                </span>
              </div>

              {/* Registration date */}
              <div>
                <span className="font-medium text-neutral-500">Registered: </span>
                {ultranos?.createdAt
                  ? new Date(ultranos.createdAt).toLocaleDateString()
                  : '--'}
              </div>

              {/* Consent version */}
              {ultranos?.consentVersion && (
                <div>
                  <span className="font-medium text-neutral-500">Consent: </span>
                  v{ultranos.consentVersion}
                </div>
              )}

              {/* Identifiers */}
              {ultranos?.identifiers && ultranos.identifiers.length > 0 && (
                <div>
                  <span className="font-medium text-neutral-500">Identifiers:</span>
                  <ul className="mt-1 space-y-1 ms-4">
                    {ultranos.identifiers.map((ident, i) => (
                      <li key={i} className="text-xs text-neutral-600">
                        {ident.displayType}: {ident.valueHash.slice(0, 8)}...
                        {ident.jild && (
                          <span className="ms-2 text-neutral-400">
                            Jild: {ident.jild} / Safa: {ident.safa} / Shumara: {ident.shumara}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Record status */}
              <div className="flex items-center gap-2">
                <span className="font-medium text-neutral-500">Status:</span>
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                    ultranos?.isActive
                      ? 'bg-green-100 text-green-700'
                      : 'bg-neutral-100 text-neutral-500'
                  }`}
                >
                  {ultranos?.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>

              {/* Biometric */}
              <div className="flex items-center gap-2">
                <span className="font-medium text-neutral-500">Biometric:</span>
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                    ultranos?.biometricFingerprintHash
                      ? 'bg-green-100 text-green-700'
                      : 'bg-neutral-100 text-neutral-500'
                  }`}
                >
                  {ultranos?.biometricFingerprintHash ? 'Enrolled' : 'Not enrolled'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/opd-lite/src/components/patient/PatientDetailsAccordion.tsx
git commit -m "feat(opd-lite): add PatientDetailsAccordion with address and identity sections"
```

---

## Task 8: ActiveMedicationsList Component

**Files:**
- Create: `apps/opd-lite/src/components/patient/ActiveMedicationsList.tsx`

- [ ] **Step 1: Create ActiveMedicationsList**

```typescript
'use client'

import { useEffect, useState } from 'react'
import { db } from '@/lib/db'
import type { LocalMedicationStatement } from '@/lib/db'

interface ActiveMedicationsListProps {
  patientId: string
}

interface ActiveMed {
  id: string
  drugName: string
  dosage: string
  frequency: string
  startDate: string
  hasOverride: boolean
}

async function loadActiveMeds(patientId: string): Promise<ActiveMed[]> {
  try {
    const statements = await db.medicationStatements
      .where('subject.reference')
      .equals(`Patient/${patientId}`)
      .toArray()

    const active = (statements as LocalMedicationStatement[]).filter(
      (s) => s.status === 'active',
    )

    // Check for interaction overrides
    const overrideIds = new Set<string>()
    try {
      const audits = await db.interactionAuditLog
        .where('patientId')
        .equals(patientId)
        .toArray()
      for (const a of audits) {
        if (a.overrideReason) overrideIds.add(a.medicationRequestId)
      }
    } catch {
      // Interaction audit unavailable
    }

    return active.map((s) => {
      const coding = s.medicationCodeableConcept?.coding?.[0]
      const dosageInfo = s.dosage?.[0]
      return {
        id: s.id,
        drugName: coding?.display ?? s.medicationCodeableConcept?.text ?? 'Unknown',
        dosage: dosageInfo?.doseAndRate?.[0]?.doseQuantity?.value
          ? `${dosageInfo.doseAndRate[0].doseQuantity.value}${dosageInfo.doseAndRate[0].doseQuantity.unit ?? 'mg'}`
          : '',
        frequency: dosageInfo?.timing?.code?.text ?? '',
        startDate: s.effectivePeriod?.start
          ? new Date(s.effectivePeriod.start).toLocaleDateString()
          : '',
        hasOverride: overrideIds.has(s._ultranos?.sourcePrescriptionId ?? ''),
      }
    })
  } catch {
    return []
  }
}

export function ActiveMedicationsList({ patientId }: ActiveMedicationsListProps) {
  const [meds, setMeds] = useState<ActiveMed[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadActiveMeds(patientId).then((m) => {
      setMeds(m)
      setLoading(false)
    })
  }, [patientId])

  if (loading) {
    return (
      <section className="rounded-xl bg-card-bg p-5 shadow-sm ring-[0.65px] ring-gray-400/40">
        <h3 className="text-base font-bold text-neutral-900 mb-2">Active Medications</h3>
        <p className="text-sm text-neutral-400">Loading...</p>
      </section>
    )
  }

  return (
    <section
      className="rounded-xl bg-card-bg p-5 shadow-sm ring-[0.65px] ring-gray-400/40"
      aria-label="Active medications"
    >
      <h3 className="text-base font-bold text-neutral-900 mb-3">Active Medications</h3>

      {meds.length === 0 ? (
        <p className="text-sm text-neutral-400">No active medications</p>
      ) : (
        <ul className="space-y-2" role="list">
          {meds.map((med) => (
            <li
              key={med.id}
              className="flex items-center justify-between rounded-lg bg-neutral-50 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-neutral-800 truncate" dir="auto">
                  {med.drugName}
                </p>
                <p className="text-xs text-neutral-500">
                  {[med.dosage, med.frequency, med.startDate].filter(Boolean).join(' \u00b7 ')}
                </p>
              </div>
              {med.hasOverride && (
                <span className="ms-2 shrink-0 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                  Override
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/opd-lite/src/components/patient/ActiveMedicationsList.tsx
git commit -m "feat(opd-lite): add ActiveMedicationsList showing cross-encounter active meds"
```

---

## Task 9: PatientEditModal Component

**Files:**
- Create: `apps/opd-lite/src/components/patient/PatientEditModal.tsx`

- [ ] **Step 1: Create PatientEditModal**

```typescript
'use client'

import { useState, useCallback, useEffect } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { z } from 'zod'
import { AdministrativeGender } from '@ultranos/shared-types'
import type { FhirPatient, AfghanProvince } from '@ultranos/shared-types'
import { NameInputSection } from '@/components/registration/NameInputSection'
import { GeographySection } from '@/components/registration/GeographySection'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { db } from '@/lib/db'
import { auditPhiAccess, AuditAction, AuditResourceType } from '@/lib/audit'
import { Button } from '@/components/ui/Button'

interface PatientEditModalProps {
  open: boolean
  patient: FhirPatient
  patientId: string
  onClose: () => void
  onSaved: (updated: FhirPatient) => void
}

interface AddressFields {
  province: AfghanProvince | ''
  district: string
  village: string
}

const EMPTY_ADDRESS: AddressFields = { province: '', district: '', village: '' }

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Unknown'] as const

const CURRENT_YEAR = new Date().getFullYear()

const EditSchema = z.object({
  nameGiven: z.string().min(1, 'required').max(200),
  nameFather: z.string().max(200).optional(),
  nameGrandfather: z.string().max(200).optional(),
  gender: z.nativeEnum(AdministrativeGender, { required_error: 'required' }),
  birthYearOnly: z.boolean(),
  birthYear: z.number().int().min(1900).max(CURRENT_YEAR).optional(),
  birthDate: z.string().optional(),
  phone: z.string().max(50).optional(),
  preferredLanguage: z.enum(['en', 'ar', 'prs']).optional(),
  addressOriginProvince: z.string().min(1, 'required'),
  addressOriginDistrict: z.string().min(1, 'required'),
  bloodGroup: z.enum(BLOOD_GROUPS).optional(),
}).superRefine((val, ctx) => {
  if (val.birthYearOnly && !val.birthYear) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['birthYear'], message: 'required' })
  }
  if (!val.birthYearOnly && !val.birthDate) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['birthDate'], message: 'required' })
  }
})

async function getAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const supabase = getSupabaseBrowserClient()
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (token) headers['Authorization'] = `Bearer ${token}`
  return headers
}

function getHubApiUrl(): string {
  return process.env.NEXT_PUBLIC_HUB_API_URL ?? 'http://localhost:3000/api/trpc'
}

export function PatientEditModal({
  open,
  patient,
  patientId,
  onClose,
  onSaved,
}: PatientEditModalProps) {
  const t = useTranslations('registration')
  const locale = useLocale()
  const ultranos = patient._ultranos

  // Form state — initialized from patient
  const [nameGiven, setNameGiven] = useState('')
  const [nameFather, setNameFather] = useState('')
  const [nameGrandfather, setNameGrandfather] = useState('')
  const [gender, setGender] = useState<AdministrativeGender | ''>('')
  const [birthYearOnly, setBirthYearOnly] = useState(true)
  const [birthYear, setBirthYear] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [phone, setPhone] = useState('')
  const [preferredLanguage, setPreferredLanguage] = useState<'en' | 'ar' | 'prs'>('en')
  const [addressOrigin, setAddressOrigin] = useState<AddressFields>(EMPTY_ADDRESS)
  const [addressCurrent, setAddressCurrent] = useState<AddressFields>(EMPTY_ADDRESS)
  const [sameAsOrigin, setSameAsOrigin] = useState(false)
  const [isNomadic, setIsNomadic] = useState(false)
  const [bloodGroup, setBloodGroup] = useState<string>('')

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  const bloodGroupLocked = !!ultranos?.bloodGroup && ultranos.bloodGroup !== 'Unknown'

  // Populate form when modal opens
  useEffect(() => {
    if (!open) return
    setNameGiven(ultranos?.nameGiven ?? '')
    setNameFather(ultranos?.nameFather ?? '')
    setNameGrandfather(ultranos?.nameGrandfather ?? '')
    setGender((patient.gender as AdministrativeGender) ?? '')
    setBirthYearOnly(patient.birthYearOnly ?? true)
    setBirthYear(ultranos?.birthYear?.toString() ?? '')
    setBirthDate(patient.birthDate && !patient.birthYearOnly ? patient.birthDate : '')
    setPhone(patient.telecom?.find((t) => t.system === 'phone')?.value ?? '')
    setPreferredLanguage((ultranos?.preferredLanguage as 'en' | 'ar' | 'prs') ?? 'en')
    setAddressOrigin(
      ultranos?.addressOrigin
        ? { province: ultranos.addressOrigin.province as AfghanProvince, district: ultranos.addressOrigin.district, village: ultranos.addressOrigin.village ?? '' }
        : EMPTY_ADDRESS,
    )
    const current = ultranos?.addressCurrent
    const origin = ultranos?.addressOrigin
    const same = !!origin && !!current &&
      origin.province === current.province &&
      origin.district === current.district &&
      (origin.village ?? '') === (current.village ?? '')
    setSameAsOrigin(same)
    setAddressCurrent(
      current && !same
        ? { province: current.province as AfghanProvince, district: current.district, village: current.village ?? '' }
        : EMPTY_ADDRESS,
    )
    setIsNomadic(ultranos?.isNomadic ?? false)
    setBloodGroup(ultranos?.bloodGroup ?? '')
    setFieldErrors({})
    setSubmitError('')
  }, [open, patient, ultranos])

  const handleSave = useCallback(async () => {
    // Validate
    const result = EditSchema.safeParse({
      nameGiven,
      nameFather: nameFather || undefined,
      nameGrandfather: nameGrandfather || undefined,
      gender: gender || undefined,
      birthYearOnly,
      birthYear: birthYear ? parseInt(birthYear, 10) : undefined,
      birthDate: birthDate || undefined,
      phone: phone || undefined,
      preferredLanguage: preferredLanguage || undefined,
      addressOriginProvince: addressOrigin.province,
      addressOriginDistrict: addressOrigin.district,
      bloodGroup: bloodGroup || undefined,
    })

    if (!result.success) {
      const errors: Record<string, string> = {}
      for (const issue of result.error.issues) {
        const key = issue.path.join('.')
        if (!errors[key]) errors[key] = issue.message === 'required' ? t('fieldRequired') : issue.message
      }
      setFieldErrors(errors)
      return
    }

    setSubmitting(true)
    setSubmitError('')

    try {
      const nameLocal = [nameGiven, nameFather, nameGrandfather].filter(Boolean).join(' ')

      const payload: Record<string, unknown> = {
        patientId,
        lastKnownUpdate: patient.meta.lastUpdated,
        nameLocal,
        nameGiven,
        nameFather: nameFather || undefined,
        nameGrandfather: nameGrandfather || undefined,
        gender: gender || undefined,
        birthDate: birthDate || undefined,
        birthYearOnly,
        telecomPhone: phone || undefined,
        preferredLanguage,
        addressProvinceOrigin: addressOrigin.province || undefined,
        addressDistrictOrigin: addressOrigin.district || undefined,
        addressVillageOrigin: addressOrigin.village || undefined,
        addressProvinceCurrent: sameAsOrigin ? addressOrigin.province : addressCurrent.province || undefined,
        addressDistrictCurrent: sameAsOrigin ? addressOrigin.district : addressCurrent.district || undefined,
        addressVillageCurrent: sameAsOrigin ? addressOrigin.village : addressCurrent.village || undefined,
        isNomadic,
      }
      if (birthYear) payload.birthYear = parseInt(birthYear, 10)
      if (bloodGroup && !bloodGroupLocked) payload.bloodGroup = bloodGroup

      const headers = await getAuthHeaders()
      const res = await fetch(`${getHubApiUrl()}/patient.update`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ json: payload }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error?.message ?? `Update failed: ${res.status}`)
      }

      const now = new Date().toISOString()

      // Build updated local patient
      const updated: FhirPatient = {
        ...patient,
        gender: (gender as AdministrativeGender) || patient.gender,
        birthDate: birthDate || (birthYear ? birthYear : patient.birthDate),
        birthYearOnly,
        telecom: phone ? [{ system: 'phone' as const, value: phone }] : patient.telecom,
        _ultranos: {
          ...patient._ultranos,
          nameLocal: [nameGiven, nameFather, nameGrandfather].filter(Boolean).join(' '),
          nameGiven: nameGiven || undefined,
          nameFather: nameFather || undefined,
          nameGrandfather: nameGrandfather || undefined,
          birthYear: birthYear ? parseInt(birthYear, 10) : undefined,
          preferredLanguage,
          isNomadic,
          addressOrigin: addressOrigin.province
            ? { province: addressOrigin.province, district: addressOrigin.district, village: addressOrigin.village || undefined }
            : undefined,
          addressCurrent: sameAsOrigin
            ? (addressOrigin.province ? { province: addressOrigin.province, district: addressOrigin.district, village: addressOrigin.village || undefined } : undefined)
            : (addressCurrent.province ? { province: addressCurrent.province, district: addressCurrent.district, village: addressCurrent.village || undefined } : undefined),
          ...(bloodGroup && !bloodGroupLocked ? { bloodGroup } : {}),
        },
        meta: { ...patient.meta, lastUpdated: now },
      }

      // Save locally
      try {
        await db.patients.put(updated)
      } catch {
        // Dexie save failed — patient updated on Hub
      }

      auditPhiAccess(AuditAction.WRITE, AuditResourceType.PATIENT, patientId, patientId, {
        phiAccess: 'profile_edit',
      })

      onSaved(updated)
      onClose()
    } catch (err) {
      if (!navigator.onLine) {
        // Offline — optimistic save
        const now = new Date().toISOString()
        const nameLocal = [nameGiven, nameFather, nameGrandfather].filter(Boolean).join(' ')
        const updated: FhirPatient = {
          ...patient,
          gender: (gender as AdministrativeGender) || patient.gender,
          birthDate: birthDate || (birthYear ? birthYear : patient.birthDate),
          birthYearOnly,
          telecom: phone ? [{ system: 'phone' as const, value: phone }] : patient.telecom,
          _ultranos: {
            ...patient._ultranos,
            nameLocal,
            nameGiven: nameGiven || undefined,
            nameFather: nameFather || undefined,
            nameGrandfather: nameGrandfather || undefined,
            birthYear: birthYear ? parseInt(birthYear, 10) : undefined,
            preferredLanguage,
            isNomadic,
            addressOrigin: addressOrigin.province
              ? { province: addressOrigin.province, district: addressOrigin.district, village: addressOrigin.village || undefined }
              : undefined,
            addressCurrent: sameAsOrigin
              ? (addressOrigin.province ? { province: addressOrigin.province, district: addressOrigin.district, village: addressOrigin.village || undefined } : undefined)
              : (addressCurrent.province ? { province: addressCurrent.province, district: addressCurrent.district, village: addressCurrent.village || undefined } : undefined),
            ...(bloodGroup && !bloodGroupLocked ? { bloodGroup } : {}),
          },
          meta: { ...patient.meta, lastUpdated: now },
        }
        try {
          await db.patients.put(updated)
          onSaved(updated)
          onClose()
          return
        } catch {
          // Dexie also failed
        }
      }
      setSubmitError(err instanceof Error ? err.message : 'Failed to save changes')
    } finally {
      setSubmitting(false)
    }
  }, [
    nameGiven, nameFather, nameGrandfather, gender, birthYearOnly, birthYear,
    birthDate, phone, preferredLanguage, addressOrigin, addressCurrent,
    sameAsOrigin, isNomadic, bloodGroup, bloodGroupLocked, patient, patientId,
    onSaved, onClose, t,
  ])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl bg-white shadow-xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-neutral-200 bg-white px-5 py-4 rounded-t-xl">
          <h2 className="text-lg font-bold text-neutral-900">Edit Patient Profile</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100"
            aria-label="Close"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-6 p-5">
          {/* Name section */}
          <NameInputSection
            nameGiven={nameGiven}
            nameFather={nameFather}
            nameGrandfather={nameGrandfather}
            onNameGivenChange={setNameGiven}
            onNameFatherChange={setNameFather}
            onNameGrandfatherChange={setNameGrandfather}
            errors={{
              nameGiven: fieldErrors.nameGiven,
              nameFather: fieldErrors.nameFather,
              nameGrandfather: fieldErrors.nameGrandfather,
            }}
          />

          {/* Demographics */}
          <fieldset className="space-y-4">
            <legend className="text-base font-bold text-neutral-900 mb-2">Demographics</legend>

            {/* Gender */}
            <div>
              <label htmlFor="edit-gender" className="mb-1 block text-sm font-semibold text-neutral-700">
                Gender <span className="text-red-600">*</span>
              </label>
              <select
                id="edit-gender"
                value={gender}
                onChange={(e) => setGender(e.target.value as AdministrativeGender)}
                className={`w-full min-h-[44px] rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1 ${
                  fieldErrors.gender ? 'border-red-400 focus:ring-red-400' : 'border-neutral-300 focus:ring-blue-400'
                }`}
              >
                <option value="">Select...</option>
                <option value={AdministrativeGender.MALE}>Male</option>
                <option value={AdministrativeGender.FEMALE}>Female</option>
                <option value={AdministrativeGender.OTHER}>Other</option>
                <option value={AdministrativeGender.UNKNOWN}>Unknown</option>
              </select>
            </div>

            {/* Birth year / date toggle */}
            <div>
              <label className="flex items-center gap-2 cursor-pointer min-h-[44px]">
                <input
                  type="checkbox"
                  checked={birthYearOnly}
                  onChange={(e) => {
                    setBirthYearOnly(e.target.checked)
                    if (e.target.checked) setBirthDate('')
                    else setBirthYear('')
                  }}
                  className="h-5 w-5"
                />
                <span className="text-sm font-medium text-neutral-700">Birth year only</span>
              </label>
              {birthYearOnly ? (
                <input
                  type="number"
                  inputMode="numeric"
                  min={1900}
                  max={CURRENT_YEAR}
                  value={birthYear}
                  onChange={(e) => setBirthYear(e.target.value)}
                  placeholder="e.g. 1990"
                  className="w-full min-h-[44px] rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:ring-1 focus:ring-blue-400"
                />
              ) : (
                <input
                  type="date"
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                  className="w-full min-h-[44px] rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:ring-1 focus:ring-blue-400"
                />
              )}
            </div>

            {/* Phone */}
            <div>
              <label htmlFor="edit-phone" className="mb-1 block text-sm font-semibold text-neutral-700">Phone</label>
              <input
                id="edit-phone"
                type="tel"
                dir="ltr"
                inputMode="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full min-h-[44px] rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:ring-1 focus:ring-blue-400"
              />
            </div>

            {/* Language */}
            <div>
              <label htmlFor="edit-language" className="mb-1 block text-sm font-semibold text-neutral-700">Preferred Language</label>
              <select
                id="edit-language"
                value={preferredLanguage}
                onChange={(e) => setPreferredLanguage(e.target.value as 'en' | 'ar' | 'prs')}
                className="w-full min-h-[44px] rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:ring-1 focus:ring-blue-400"
              >
                <option value="en">English</option>
                <option value="ar">Arabic</option>
                <option value="prs">Dari (Farsi)</option>
              </select>
            </div>
          </fieldset>

          {/* Geography */}
          <div className="space-y-4">
            <GeographySection
              origin={addressOrigin}
              current={addressCurrent}
              sameAsOrigin={sameAsOrigin}
              onOriginChange={setAddressOrigin}
              onCurrentChange={setAddressCurrent}
              onSameAsOriginChange={setSameAsOrigin}
              errors={{
                originProvince: fieldErrors.addressOriginProvince,
                originDistrict: fieldErrors.addressOriginDistrict,
              }}
            />

            {/* Nomadic toggle */}
            <label className="flex items-center gap-2 cursor-pointer min-h-[44px]">
              <input
                type="checkbox"
                checked={isNomadic}
                onChange={(e) => setIsNomadic(e.target.checked)}
                className="h-5 w-5"
              />
              <span className="text-sm font-medium text-neutral-700">Nomadic patient (seasonal address changes)</span>
            </label>
          </div>

          {/* Blood Group */}
          <div>
            <label htmlFor="edit-blood-group" className="mb-1 block text-sm font-semibold text-neutral-700">
              Blood Group {bloodGroupLocked && <span className="text-xs text-neutral-400 ms-1">(locked)</span>}
            </label>
            <select
              id="edit-blood-group"
              value={bloodGroup}
              onChange={(e) => setBloodGroup(e.target.value)}
              disabled={bloodGroupLocked}
              className={`w-full min-h-[44px] rounded-lg border px-3 py-2 text-sm focus:ring-1 focus:ring-blue-400 ${
                bloodGroupLocked ? 'bg-neutral-100 text-neutral-500 cursor-not-allowed' : 'border-neutral-300'
              }`}
            >
              <option value="">Not set</option>
              {BLOOD_GROUPS.map((bg) => (
                <option key={bg} value={bg}>{bg}</option>
              ))}
            </select>
          </div>

          {/* Submit error */}
          {submitError && (
            <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
              {submitError}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 flex items-center justify-end gap-3 border-t border-neutral-200 bg-white px-5 py-4 rounded-b-xl">
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSave} disabled={submitting}>
            {submitting ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/opd-lite/src/components/patient/PatientEditModal.tsx
git commit -m "feat(opd-lite): add PatientEditModal with demographics, address, blood group editing"
```

---

## Task 10: Rewrite PatientChartPage as Compositional Shell

**Files:**
- Modify: `apps/opd-lite/src/components/patient/PatientChartPage.tsx` (full rewrite)

- [ ] **Step 1: Rewrite PatientChartPage**

Replace the entire contents of `apps/opd-lite/src/components/patient/PatientChartPage.tsx`:

```typescript
'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { db } from '@/lib/db'
import type { FhirPatient } from '@ultranos/shared-types'
import { EncryptionKeyNotAvailableError } from '@/lib/encryption-key-store'
import { auditPhiAccess, AuditAction, AuditResourceType } from '@/lib/audit'
import { usePatientSync } from '@/hooks/usePatientSync'
import { Button } from '@/components/ui/Button'

// Composed sections
import { PatientBannerStack } from '@/components/patient/PatientBannerStack'
import { PatientHeaderCard } from '@/components/patient/PatientHeaderCard'
import { PatientEditModal } from '@/components/patient/PatientEditModal'
import { PatientDetailsAccordion } from '@/components/patient/PatientDetailsAccordion'
import { ActiveMedicationsList } from '@/components/patient/ActiveMedicationsList'
import { EncounterHistoryList } from '@/components/patient/EncounterHistoryList'
import { LabResultsList } from '@/components/clinical/LabResultsList'
import { LabResultDetail } from '@/components/clinical/LabResultDetail'
import type { LocalDiagnosticReport } from '@/lib/db'

interface PatientChartPageProps {
  patientId: string
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function PatientChartPage({ patientId }: PatientChartPageProps) {
  const router = useRouter()
  const [patient, setPatient] = useState<FhirPatient | null>(null)
  const [loading, setLoading] = useState(true)
  const [needsReauth, setNeedsReauth] = useState(false)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [selectedLabReport, setSelectedLabReport] = useState<LocalDiagnosticReport | null>(null)

  usePatientSync(patientId)

  useEffect(() => {
    if (!UUID_REGEX.test(patientId)) {
      setLoading(false)
      return
    }
    let cancelled = false
    async function loadPatient() {
      try {
        const p = await db.patients.get(patientId)
        if (!cancelled) {
          setPatient(p ?? null)
          if (p) {
            auditPhiAccess(
              AuditAction.READ,
              AuditResourceType.PATIENT,
              patientId,
              patientId,
              { phiAccess: 'patient_chart_view' },
            )
          }
        }
      } catch (err) {
        if (!cancelled) {
          if (err instanceof EncryptionKeyNotAvailableError) {
            setNeedsReauth(true)
          }
          setPatient(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    loadPatient()
    return () => { cancelled = true }
  }, [patientId])

  const handlePatientUpdated = useCallback((updated: FhirPatient) => {
    setPatient(updated)
  }, [])

  // Loading state
  if (loading) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-8">
        <p className="font-semibold text-neutral-500">Loading patient chart...</p>
      </main>
    )
  }

  // Error states
  if (!patient) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-8">
        {needsReauth ? (
          <>
            <p className="font-semibold text-neutral-500">
              Session encryption key unavailable — please sign in again to access patient data.
            </p>
            <Button
              variant="primary"
              onClick={() => {
                const returnUrl = encodeURIComponent(window.location.pathname)
                window.location.href = `/login?returnUrl=${returnUrl}`
              }}
              className="mt-4"
            >
              Sign In
            </Button>
          </>
        ) : (
          <>
            <p className="font-semibold text-neutral-500">Patient not found in local session.</p>
            <Button variant="ghost" onClick={() => router.push('/')} className="mt-4">
              Return to Patient Search
            </Button>
          </>
        )}
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 space-y-4">
      {/* Back navigation */}
      <Button variant="ghost" onClick={() => router.push('/')} aria-label="Back to search">
        &larr; Back to Search
      </Button>

      {/* Safety banners — CLAUDE.md Rule #4: allergies first, never collapsed */}
      <PatientBannerStack patient={patient} patientId={patientId} />

      {/* Patient identity header with avatar, vitals, actions */}
      <PatientHeaderCard
        patient={patient}
        patientId={patientId}
        onEditClick={() => setEditModalOpen(true)}
        onPatientUpdated={handlePatientUpdated}
      />

      {/* Collapsible demographics and identity details */}
      <PatientDetailsAccordion patient={patient} />

      {/* Cross-encounter active medications */}
      <ActiveMedicationsList patientId={patientId} />

      {/* Encounter history with expandable detail */}
      <section aria-label="Encounter history">
        <h2 className="mb-3 text-lg font-bold text-neutral-900">Encounter History</h2>
        <EncounterHistoryList patientId={patientId} />
      </section>

      {/* Lab results */}
      <section
        className="rounded-xl bg-card-bg p-5 shadow-sm ring-[0.65px] ring-gray-400/40"
        aria-label="Lab results"
      >
        {selectedLabReport ? (
          <LabResultDetail
            report={selectedLabReport}
            onBack={() => setSelectedLabReport(null)}
          />
        ) : (
          <LabResultsList
            patientId={patientId}
            onSelectReport={setSelectedLabReport}
          />
        )}
      </section>

      {/* Edit profile modal */}
      <PatientEditModal
        open={editModalOpen}
        patient={patient}
        patientId={patientId}
        onClose={() => setEditModalOpen(false)}
        onSaved={handlePatientUpdated}
      />
    </main>
  )
}
```

- [ ] **Step 2: Verify the dev server compiles without errors**

Run: `pnpm -F @ultranos/opd-lite exec next dev --port 3001`

Check the terminal for any import errors on the `/patient/[patientId]` route. Ignore pre-existing warnings from other files.

- [ ] **Step 3: Commit**

```bash
git add apps/opd-lite/src/components/patient/PatientChartPage.tsx
git commit -m "feat(opd-lite): rewrite PatientChartPage as compositional shell with all profile sections"
```

---

## Task 11: Final Integration Verification

- [ ] **Step 1: Start both dev servers**

Terminal 1: `pnpm -F hub-api exec next dev --port 3004`
Terminal 2: `pnpm -F @ultranos/opd-lite exec next dev --port 3001`

- [ ] **Step 2: Register a test patient**

Navigate to `http://localhost:3001/register-patient`. Fill in:
- Given name: `تست`
- Father: `پدر`
- Gender: Male
- Birth year: 1990
- Province: Kabul, District: any
- Consent: Written

Click "Check for Duplicates & Register". Verify redirect to `/patient/{id}`.

- [ ] **Step 3: Verify profile page sections render**

On the patient chart page, confirm:
- Allergy banner shows (gray "No Known Allergies" or empty)
- Patient header card shows: avatar with initials, patronymic chain, gender, age
- Baseline vitals row shows `--` values (no encounters yet)
- "Edit Profile" and "Start New Encounter" buttons visible
- Patient Details accordion expands/collapses
- Active Medications shows "No active medications"
- Encounter History shows "No encounters recorded"
- Lab Results section renders

- [ ] **Step 4: Test edit modal**

Click "Edit Profile". Verify:
- Modal opens with pre-populated values
- Name fields, gender, birth year match registration data
- Address section shows origin address
- Blood group dropdown is enabled (no value yet)
- Change the phone number and save
- Modal closes, header card refreshes with new phone

- [ ] **Step 5: Test photo upload**

Click the avatar area. Select a photo from disk.
- Verify upload spinner appears
- Verify avatar updates to show the photo
- Refresh the page — photo should persist (signed URL)

- [ ] **Step 6: Commit any fixes**

```bash
git add -A
git commit -m "fix(opd-lite): integration fixes for patient profile page"
```
