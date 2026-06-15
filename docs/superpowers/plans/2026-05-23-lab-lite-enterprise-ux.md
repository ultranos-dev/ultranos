# Lab Lite Enterprise UX Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform Lab Lite from a functional prototype into an enterprise-grade lab diagnostics app: fix the P0 patient safety gap (missing upload success confirmation), complete i18n coverage, redesign the dashboard with proper visual hierarchy, integrate OPD-lite patient infrastructure (creation, search, walk-ins), add contextual help, add efficiency features for high-volume usage, and polish.

**Architecture:** Phased approach across 6 action areas. Phase 1 (Harden) fixes critical safety/i18n issues. Phase 2 (Dashboard) redesigns layout and hierarchy. Phase 3 (Patient Infrastructure) integrates OPD-lite patterns for patient creation, search, and walk-ins. Phase 4 (Onboard) adds contextual help. Phase 5 (Efficiency) adds recent patients, keyboard shortcuts. Phase 6 (Polish) unifies styling and removes dead code. Each phase produces working, testable software independently.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind CSS, Dexie (IndexedDB), Zustand, next-intl, Supabase Auth, tRPC

**Key Reference Files:**
- Dashboard page: `apps/lab-lite/src/app/[locale]/page.tsx`
- Dashboard components: `apps/lab-lite/src/components/dashboard/`
- Upload wizard: `apps/lab-lite/src/app/[locale]/upload/page.tsx`
- Upload components: `apps/lab-lite/src/components/upload/`, `apps/lab-lite/src/components/MetadataForm.tsx`
- Database: `apps/lab-lite/src/lib/db.ts`
- tRPC client: `apps/lab-lite/src/lib/trpc.ts`
- Hooks: `apps/lab-lite/src/hooks/`
- Messages: `apps/lab-lite/messages/en.json`
- Dashboard data hook: `apps/lab-lite/src/hooks/useDashboardData.ts`
- Auth session store: `apps/lab-lite/src/stores/auth-session-store.ts`
- Sidebar: `apps/lab-lite/src/components/AppSidebar.tsx`
- UI Button: `apps/lab-lite/src/components/ui/Button.tsx`
- OPD-lite patient registration: `apps/opd-lite/src/components/registration/PatientRegistrationForm.tsx`
- OPD-lite patient search: `apps/opd-lite/src/lib/use-patient-search.ts`
- OPD-lite walk-in queue: `apps/opd-lite/src/components/appointments/WalkInQueue.tsx`
- OPD-lite patient edit: `apps/opd-lite/src/components/patient/PatientEditModal.tsx`
- OPD-lite Dexie schema: `apps/opd-lite/src/lib/db.ts`
- Shared patient types: `packages/shared-types/src/fhir/patient.ts`
- Sync engine queue: `packages/sync-engine/src/queue.ts`

---

## Phase 1: Harden Critical Flows

### Task 1: Upload Success Banner on Dashboard

The `?uploaded=true` query param is set by the upload wizard on successful submission but no component reads it. This is a P0 patient safety gap — technicians have no confirmation their result was queued.

**Files:**
- Create: `apps/lab-lite/src/components/dashboard/UploadSuccessBanner.tsx`
- Modify: `apps/lab-lite/src/app/[locale]/page.tsx`
- Modify: `apps/lab-lite/messages/en.json`

- [ ] **Step 1: Add translation key for success message**

In `apps/lab-lite/messages/en.json`, add to the `dashboard` section:

```json
"uploadSuccess": "Result queued successfully — it will be uploaded when connectivity is available.",
"dismiss": "Dismiss"
```

- [ ] **Step 2: Create UploadSuccessBanner component**

Create `apps/lab-lite/src/components/dashboard/UploadSuccessBanner.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'

export function UploadSuccessBanner() {
  const t = useTranslations('dashboard')
  const searchParams = useSearchParams()
  const router = useRouter()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (searchParams.get('uploaded') === 'true') {
      setVisible(true)
      // Clean up the URL without triggering a navigation
      const url = new URL(window.location.href)
      url.searchParams.delete('uploaded')
      window.history.replaceState({}, '', url.toString())
    }
  }, [searchParams])

  if (!visible) return null

  return (
    <div
      className="flex items-center justify-between rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-2">
        <svg className="h-5 w-5 shrink-0 text-green-600" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
            clipRule="evenodd"
          />
        </svg>
        <span className="font-medium">{t('uploadSuccess')}</span>
      </div>
      <button
        type="button"
        onClick={() => setVisible(false)}
        className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-100 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-1"
        aria-label={t('dismiss')}
      >
        {t('dismiss')}
      </button>
    </div>
  )
}
```

- [ ] **Step 3: Add UploadSuccessBanner to dashboard page**

In `apps/lab-lite/src/app/[locale]/page.tsx`, add the import and render the banner above the error banner:

```tsx
import { UploadSuccessBanner } from '@/components/dashboard/UploadSuccessBanner'
```

Inside the return, add as the first child of the flex container:

```tsx
<UploadSuccessBanner />
```

- [ ] **Step 4: Verify manually**

Run: `pnpm -F lab-lite dev`

1. Navigate to `/upload`, complete a test upload
2. Verify redirect to `/?uploaded=true`
3. Verify green success banner appears with message
4. Verify the `?uploaded=true` param is cleaned from the URL
5. Verify clicking "Dismiss" hides the banner

- [ ] **Step 5: Commit**

```bash
git add apps/lab-lite/src/components/dashboard/UploadSuccessBanner.tsx apps/lab-lite/src/app/[locale]/page.tsx apps/lab-lite/messages/en.json
git commit -m "fix(lab-lite): add upload success confirmation banner on dashboard (P0)"
```

---

### Task 2: Cancel/Recall Queued Uploads from Dashboard

Add the ability to cancel a queued upload from the recent uploads list on the dashboard, before it syncs to the Hub. This is the error-correction path for wrong-patient uploads.

**Files:**
- Modify: `apps/lab-lite/src/components/dashboard/RecentUploadsList.tsx`
- Modify: `apps/lab-lite/src/hooks/useDashboardData.ts`
- Modify: `apps/lab-lite/messages/en.json`

- [ ] **Step 1: Add translation keys**

In `apps/lab-lite/messages/en.json`, add to the `dashboard` section:

```json
"cancelUpload": "Cancel",
"cancelConfirm": "Cancel this upload?",
"confirmCancel": "Yes, cancel",
"cancelDismiss": "No, keep",
"uploadCancelled": "Upload cancelled"
```

- [ ] **Step 2: Add patientFirstName to RecentUploadItem**

In `apps/lab-lite/src/hooks/useDashboardData.ts`, add `patientFirstName` to the `RecentUploadItem` interface:

```typescript
export interface RecentUploadItem {
  id: string
  loincDisplay: string
  timestamp: string
  status: 'completed' | 'pending' | 'uploading' | 'failed' | 'expired'
  source: 'local' | 'remote'
  patientFirstName?: string
  localQueueId?: number
}
```

Update `mapQueueToRecent` to include `patientFirstName` and `localQueueId`:

```typescript
function mapQueueToRecent(items: UploadQueueEntry[]): RecentUploadItem[] {
  return items.map((item) => ({
    id: `local-${item.id}`,
    loincDisplay: clampLoincDisplay(item.metadata.loincDisplay),
    timestamp: item.queuedAt,
    status: item.status,
    source: 'local' as const,
    patientFirstName: item.patientFirstName,
    localQueueId: item.id,
  }))
}
```

- [ ] **Step 3: Add cancel functionality to RecentUploadsList**

Rewrite `apps/lab-lite/src/components/dashboard/RecentUploadsList.tsx` to include cancel action for local pending/failed items:

```tsx
'use client'

import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { removeQueueItem } from '@/lib/db'
import { reportQueueAuditEvent } from '@/lib/audit-client'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import type { RecentUploadItem } from '@/hooks/useDashboardData'

interface RecentUploadsListProps {
  items: RecentUploadItem[]
  onItemCancelled?: () => void
}

const statusStyles: Record<RecentUploadItem['status'], string> = {
  completed: 'bg-green-50 text-green-700',
  pending: 'bg-amber-50 text-amber-700',
  uploading: 'bg-amber-50 text-amber-700',
  failed: 'bg-red-50 text-red-700',
  expired: 'bg-neutral-100 text-neutral-400',
}

function formatTimestamp(iso: string, locale: string): string {
  if (!iso) return '\u2014'
  try {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return '\u2014'
    return d.toLocaleString(locale, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return '\u2014'
  }
}

export function RecentUploadsList({ items, onItemCancelled }: RecentUploadsListProps) {
  const t = useTranslations('dashboard')
  const tStatus = useTranslations('status')
  const locale = useLocale()
  const session = useAuthSessionStore((s) => s.session)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)

  async function handleCancel(item: RecentUploadItem) {
    if (!item.localQueueId) return
    try {
      await removeQueueItem(item.localQueueId)
      reportQueueAuditEvent({
        action: 'QUEUE_ITEM_DISCARDED',
        queueEntryId: item.localQueueId,
        testCategory: item.loincDisplay,
        patientRef: '',
        timestamp: new Date().toISOString(),
        technicianId: session?.practitionerId,
      })
      setConfirmingId(null)
      onItemCancelled?.()
    } catch {
      setConfirmingId(null)
    }
  }

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="text-sm font-medium text-neutral-500">{t('recentUploads')}</h2>
        <p className="mt-3 text-sm text-neutral-400">{t('noUploadsYet')}</p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <h2 className="text-sm font-medium text-neutral-500">{t('recentUploads')}</h2>
      <ul className="mt-3 divide-y divide-neutral-100" role="list">
        {items.map((item) => {
          const statusLabel = tStatus(item.status)
          const canCancel = item.source === 'local' && (item.status === 'pending' || item.status === 'failed')

          return (
            <li key={item.id} className="flex items-center justify-between py-2.5 [@media(hover:hover)and(pointer:fine)]:hover:bg-neutral-50 motion-safe:transition-colors motion-safe:duration-150">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-neutral-900">
                  {item.patientFirstName && (
                    <span className="text-neutral-600">{item.patientFirstName} — </span>
                  )}
                  {item.loincDisplay}
                </p>
                <p className="text-xs text-neutral-400">{formatTimestamp(item.timestamp, locale)}</p>
              </div>
              <div className="ms-2 flex items-center gap-1.5">
                <span
                  className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${statusStyles[item.status]}`}
                >
                  {statusLabel}
                </span>
                {canCancel && confirmingId !== item.id && (
                  <button
                    type="button"
                    onClick={() => setConfirmingId(item.id)}
                    className="shrink-0 rounded-md px-1.5 py-0.5 text-xs text-neutral-400 hover:text-red-600 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500"
                    aria-label={t('cancelUpload')}
                  >
                    {t('cancelUpload')}
                  </button>
                )}
                {canCancel && confirmingId === item.id && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleCancel(item)}
                      className="rounded-md bg-red-50 px-1.5 py-0.5 text-xs font-medium text-red-700 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-500"
                    >
                      {t('confirmCancel')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingId(null)}
                      className="rounded-md px-1.5 py-0.5 text-xs text-neutral-500 hover:bg-neutral-100 focus:outline-none focus:ring-2 focus:ring-neutral-400"
                    >
                      {t('cancelDismiss')}
                    </button>
                  </div>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
```

- [ ] **Step 4: Wire onItemCancelled callback in dashboard page**

In `apps/lab-lite/src/app/[locale]/page.tsx`, pass `retry` as `onItemCancelled` to trigger a data refresh:

```tsx
<RecentUploadsList items={recentUploads} onItemCancelled={retry} />
```

- [ ] **Step 5: Verify manually**

1. Queue an upload (complete the wizard)
2. On dashboard, verify recent uploads show patient name prefix
3. Verify "Cancel" button appears on pending/failed local items
4. Click Cancel → verify confirmation appears
5. Confirm → verify item is removed and list refreshes

- [ ] **Step 6: Commit**

```bash
git add apps/lab-lite/src/components/dashboard/RecentUploadsList.tsx apps/lab-lite/src/hooks/useDashboardData.ts apps/lab-lite/src/app/[locale]/page.tsx apps/lab-lite/messages/en.json
git commit -m "feat(lab-lite): add cancel/recall for queued uploads on dashboard"
```

---

### Task 3: Complete i18n Coverage — Move Hardcoded Strings to Translation Files

Multiple components have hardcoded English strings that bypass `next-intl`. RTL is not needed for lab-lite, but all user-facing strings must go through the translation system for consistency.

**Files:**
- Modify: `apps/lab-lite/src/components/upload/StepIndicator.tsx`
- Modify: `apps/lab-lite/src/components/MetadataForm.tsx`
- Modify: `apps/lab-lite/src/components/upload/ReviewStep.tsx`
- Modify: `apps/lab-lite/src/app/[locale]/upload/page.tsx`
- Modify: `apps/lab-lite/src/app/[locale]/offline/page.tsx`
- Modify: `apps/lab-lite/messages/en.json`

- [ ] **Step 1: Add all missing translation keys to en.json**

The following strings are currently hardcoded. Add or verify these keys exist in `apps/lab-lite/messages/en.json`. Many already exist — only add the ones that are missing. Cross-reference each hardcoded string against the existing keys.

Existing keys that should be used (already in en.json):
- `upload.title` → "Upload Lab Result" 
- `upload.manualId` → "Manual ID"
- `upload.qrScan` → "QR Scan"
- `upload.back` → "Back"
- `upload.next` → "Next"
- `upload.submitResults` → "Submit Results"
- `upload.dragDropText` → "Drag and drop..."
- `results.reviewTitle` → "Review & Confirm"
- `results.patient` → "Patient"
- `results.testCategory` → "Test Category"
- `results.file` → "File"
- `results.collectionDate` → "Collection Date"
- `results.confirmSubmit` → "Confirm & Submit"
- `results.submitting` → "Submitting..."
- `metadata.testCategory` → "Test Category"
- `metadata.selectCategory` → "Select a test category..."
- `metadata.collectionDate` → "Sample Collection Date"
- `metadata.ocrAnalyzing` → "Analyzing document with OCR..."
- `metadata.ocrUnavailable` → "OCR unavailable..."
- `metadata.confidenceHigh/Medium/Low` → confidence labels
- `metadata.confirmCheckbox` → confirmation text
- `metadata.errorCategory/Date/Confirm` → error messages
- `metadata.submitResults` → "Submit Results"
- `steps.verifyPatient/uploadFile/tagMetadata/reviewSubmit` → step labels

- [ ] **Step 2: Wire StepIndicator to use translations**

In `apps/lab-lite/src/components/upload/StepIndicator.tsx`:

```tsx
'use client'

import { useTranslations } from 'next-intl'

const STEP_KEYS = ['VERIFY_PATIENT', 'UPLOAD_FILE', 'TAG_METADATA', 'REVIEW_SUBMIT'] as const

export type WizardStep = (typeof STEP_KEYS)[number]

const STEP_LABEL_MAP: Record<WizardStep, string> = {
  VERIFY_PATIENT: 'verifyPatient',
  UPLOAD_FILE: 'uploadFile',
  TAG_METADATA: 'tagMetadata',
  REVIEW_SUBMIT: 'reviewSubmit',
}

interface StepIndicatorProps {
  currentStep: WizardStep
}

export function StepIndicator({ currentStep }: StepIndicatorProps) {
  const t = useTranslations('steps')
  const currentIndex = STEP_KEYS.indexOf(currentStep)

  return (
    <nav data-testid="step-indicator" aria-label={t('stepLabel', { number: '', label: '', suffix: '' }).trim() || 'Upload progress'} className="flex items-center justify-between gap-2">
      {STEP_KEYS.map((key, i) => {
        const isCompleted = i < currentIndex
        const isCurrent = i === currentIndex
        const label = t(STEP_LABEL_MAP[key])

        return (
          <div key={key} className="flex flex-1 items-center" role="listitem" aria-current={isCurrent ? 'step' : undefined}>
            <div className="flex flex-col items-center">
              <div
                aria-label={t('stepLabel', {
                  number: i + 1,
                  label,
                  suffix: isCompleted ? t('completedSuffix') : isCurrent ? t('currentSuffix') : '',
                })}
                className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-colors duration-200 ${
                  isCompleted
                    ? 'bg-green-600 text-white'
                    : isCurrent
                      ? 'bg-primary-600 text-white'
                      : 'bg-neutral-200 text-neutral-500'
                }`}
              >
                {isCompleted ? (
                  <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                ) : (
                  i + 1
                )}
              </div>
              <span
                className={`mt-1 text-center text-xs ${
                  isCurrent ? 'font-semibold text-primary-700' : 'text-neutral-500'
                }`}
              >
                {label}
              </span>
            </div>

            {i < STEP_KEYS.length - 1 && (
              <div
                className={`mx-2 h-0.5 flex-1 ${
                  i < currentIndex ? 'bg-green-600' : 'bg-neutral-200'
                }`}
              />
            )}
          </div>
        )
      })}
    </nav>
  )
}
```

- [ ] **Step 3: Wire MetadataForm to use translations**

In `apps/lab-lite/src/components/MetadataForm.tsx`, add `useTranslations` and replace all hardcoded strings:

Add at top of component:
```tsx
const t = useTranslations('metadata')
```

Replace hardcoded strings:
- `'Analyzing document with OCR...'` → `t('ocrAnalyzing')`
- `'OCR unavailable — please enter metadata manually.'` → `t('ocrUnavailable')`
- `'OCR analysis complete (...)'` → `t('ocrComplete', { time: ... })`
- `'Test Category'` label → `t('testCategory')`
- `'Select a test category...'` → `t('selectCategory')`
- `'Sample Collection Date'` label → `t('collectionDate')`
- `'OCR could not determine — enter manually.'` → `t('ocrLowConfidence')`
- `'I have reviewed and confirm...'` → `t('confirmCheckbox')`
- `'Submit Results'` → `t('submitResults')`
- `'Please select a test category.'` → `t('errorCategory')`
- `'Please enter the sample collection date.'` → `t('errorDate')`
- `'Please review and confirm...'` → `t('errorConfirm')`
- `getConfidenceLabel()` → use `t('confidenceHigh')`, `t('confidenceMedium')`, `t('confidenceLow')`

Replace `getConfidenceLabel` function:
```tsx
function getConfidenceLabel(level: ConfidenceLevel, t: ReturnType<typeof useTranslations>): string {
  switch (level) {
    case 'high': return t('confidenceHigh')
    case 'medium': return t('confidenceMedium')
    case 'low': return t('confidenceLow')
  }
}
```

- [ ] **Step 4: Wire ReviewStep to use translations**

In `apps/lab-lite/src/components/upload/ReviewStep.tsx`, add `useTranslations('results')` and replace:

```tsx
'use client'

import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/Button'

// ... (keep interface and formatFileSize unchanged)

export function ReviewStep({ ... }: ReviewStepProps) {
  const t = useTranslations('results')

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-neutral-900">{t('reviewTitle')}</h2>

      <dl className="divide-y divide-neutral-100 rounded-lg border border-neutral-200 bg-white">
        <div className="flex justify-between px-4 py-3">
          <dt className="text-sm font-medium text-neutral-500">{t('patient')}</dt>
          <dd className="text-sm text-neutral-900">{t('patientValue', { firstName: patientFirstName, age: patientAge })}</dd>
        </div>
        <div className="flex justify-between px-4 py-3">
          <dt className="text-sm font-medium text-neutral-500">{t('testCategory')}</dt>
          <dd className="text-sm text-neutral-900">{loincDisplay}</dd>
        </div>
        <div className="flex justify-between px-4 py-3">
          <dt className="text-sm font-medium text-neutral-500">{t('file')}</dt>
          <dd className="text-sm text-neutral-900">{t('fileValue', { fileName, fileSize: formatFileSize(fileSize) })}</dd>
        </div>
        <div className="flex justify-between px-4 py-3">
          <dt className="text-sm font-medium text-neutral-500">{t('collectionDate')}</dt>
          <dd className="text-sm text-neutral-900">{collectionDate}</dd>
        </div>
      </dl>

      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}

      <Button variant="primary" type="submit" onClick={onSubmit} disabled={submitting}>
        {submitting ? t('submitting') : t('confirmSubmit')}
      </Button>
    </div>
  )
}
```

- [ ] **Step 5: Wire upload page title to use translations**

In `apps/lab-lite/src/app/[locale]/upload/page.tsx`, add `useTranslations` and replace `"Upload Lab Result"` with `t('upload.title')`, `"Manual ID"` with `t('upload.manualId')`, `"QR Scan"` with `t('upload.qrScan')`, `"Patient Verified"` with `t('verification.patientVerified')`, `"First Name"` with `t('verification.firstName')`, `"Age"` with `t('verification.age')`, `"Back"` with `t('upload.back')`, `"Next"` with `t('upload.next')`.

- [ ] **Step 6: Wire offline page to use translations**

In `apps/lab-lite/src/app/[locale]/offline/page.tsx`, replace hardcoded strings with `t('offline.message')` and `t('offline.tryAgain')`.

- [ ] **Step 7: Verify**

Run: `pnpm -F lab-lite dev`
Navigate through each page and verify no English text appears that isn't from a translation key. Check: upload wizard (all 4 steps), offline page, MetadataForm with and without OCR.

- [ ] **Step 8: Commit**

```bash
git add apps/lab-lite/src/components/upload/StepIndicator.tsx apps/lab-lite/src/components/MetadataForm.tsx apps/lab-lite/src/components/upload/ReviewStep.tsx apps/lab-lite/src/app/[locale]/upload/page.tsx apps/lab-lite/src/app/[locale]/offline/page.tsx apps/lab-lite/messages/en.json
git commit -m "fix(lab-lite): complete i18n coverage for all user-facing strings"
```

---

### Task 4: Improve Error Messaging

Dashboard and OCR error messages are too generic. Differentiate between network issues, session issues, and service failures.

**Files:**
- Modify: `apps/lab-lite/src/hooks/useDashboardData.ts`
- Modify: `apps/lab-lite/src/components/MetadataForm.tsx`
- Modify: `apps/lab-lite/messages/en.json`

- [ ] **Step 1: Add specific error translation keys**

In `apps/lab-lite/messages/en.json`, add to `errors`:

```json
"sessionExpired": "Session expired — please sign in again.",
"remoteUnavailable": "Remote data unavailable — showing local queue only.",
"ocrServiceDown": "OCR service unavailable — please enter metadata manually.",
"ocrTimeout": "OCR analysis timed out — please enter metadata manually.",
"ocrUnsupported": "OCR could not process this file — please enter metadata manually."
```

- [ ] **Step 2: Use specific error keys in useDashboardData**

In `apps/lab-lite/src/hooks/useDashboardData.ts`, the error messages are already specific enough (`'Session expired — please sign in again'` and `'Remote data unavailable — showing local queue only'`). These match the translation keys. No code change needed here — the components rendering these errors should use translation keys instead of rendering the raw error string. 

Actually, since the dashboard page renders the error string directly, and the error string comes from the hook, the simplest fix is to change the hook to return error *keys* instead of error *strings*, then translate in the component. But this is a larger refactor. For now, leave the error strings as-is — they already match the en.json values and the translations are used where `useTranslations` is available.

- [ ] **Step 3: Add date validation to MetadataForm**

In `apps/lab-lite/src/components/MetadataForm.tsx`, add `max` attribute to the date input to prevent future dates:

```tsx
<input
  id="collection-date"
  type="date"
  value={collectionDate}
  max={new Date().toISOString().split('T')[0]}
  onChange={...}
  ...
/>
```

Add validation in `handleSubmit`:

```typescript
const today = new Date().toISOString().split('T')[0]
if (collectionDate > today) newErrors.date = t('errorFutureDate')
```

Add translation key in en.json under `metadata`:

```json
"errorFutureDate": "Collection date cannot be in the future."
```

- [ ] **Step 4: Commit**

```bash
git add apps/lab-lite/src/components/MetadataForm.tsx apps/lab-lite/messages/en.json
git commit -m "fix(lab-lite): add date validation and improve error messaging"
```

---

## Phase 2: Dashboard Redesign

### Task 5: Restructure Dashboard Layout with Visual Hierarchy

The current dashboard is 5 identical cards stacked vertically. Redesign to: CTA elevated to top, LabIdentityCard collapsed into a greeting, queue status with attention states, and merged activity metrics.

**Files:**
- Modify: `apps/lab-lite/src/app/[locale]/page.tsx`
- Modify: `apps/lab-lite/src/components/dashboard/LabIdentityCard.tsx` (rename to `DashboardHeader.tsx`)
- Modify: `apps/lab-lite/src/components/dashboard/QueueStatusCard.tsx`
- Modify: `apps/lab-lite/src/components/dashboard/ActivitySummaryCard.tsx`
- Modify: `apps/lab-lite/src/components/dashboard/QuickActions.tsx`
- Modify: `apps/lab-lite/messages/en.json`

- [ ] **Step 1: Add new translation keys**

In `apps/lab-lite/messages/en.json`, add to `dashboard`:

```json
"greeting": "Welcome back, {name}",
"attentionNeeded": "{count} failed — tap to review",
"lastRefreshed": "Updated {time}",
"todaySummary": "Today: {completed} completed, {pending} pending review"
```

- [ ] **Step 2: Replace LabIdentityCard with DashboardHeader**

Rename `apps/lab-lite/src/components/dashboard/LabIdentityCard.tsx` to `apps/lab-lite/src/components/dashboard/DashboardHeader.tsx` and rewrite:

```tsx
'use client'

import { useTranslations } from 'next-intl'
import { useAuthSessionStore } from '@/stores/auth-session-store'

export function DashboardHeader() {
  const t = useTranslations('dashboard')
  const session = useAuthSessionStore((s) => s.session)

  const displayName = session?.email?.split('@')[0] ?? t('defaultTechName')

  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-xl font-bold text-neutral-900">
          {t('greeting', { name: displayName })}
        </h1>
        <p className="mt-0.5 text-sm text-neutral-500">
          {(session as Record<string, unknown>)?.labName as string ?? t('defaultLabName')}
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Redesign QuickActions — remove card wrapper**

Rewrite `apps/lab-lite/src/components/dashboard/QuickActions.tsx` to be a standalone CTA without the card wrapper:

```tsx
'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'

export function QuickActions() {
  const t = useTranslations('dashboard')

  return (
    <Link
      href="/upload"
      className="flex items-center justify-center gap-2 rounded-pill bg-pill-green px-5 py-3 text-sm font-semibold text-pill-text transition-all duration-100 ease-out hover:brightness-[1.04] active:brightness-[0.88] focus:outline-none focus:ring-2 focus:ring-primary-300 focus:ring-offset-2"
    >
      <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" />
      </svg>
      {t('uploadNewResult')}
    </Link>
  )
}
```

- [ ] **Step 4: Add attention state to QueueStatusCard**

Modify `apps/lab-lite/src/components/dashboard/QueueStatusCard.tsx` to highlight when failed > 0:

```tsx
'use client'

import { useTranslations } from 'next-intl'
import Link from 'next/link'
import type { QueueCounts } from '@/hooks/useDashboardData'

interface QueueStatusCardProps {
  counts: QueueCounts
}

function CountBadge({
  label,
  count,
  colorClass,
  ariaLabel,
}: {
  label: string
  count: number
  colorClass: string
  ariaLabel: string
}) {
  return (
    <div className={`rounded-md px-3 py-2 text-center ${colorClass}`} role="status" aria-label={ariaLabel}>
      <p className="text-2xl font-bold" aria-hidden="true">{count}</p>
      <p className="text-xs font-medium" aria-hidden="true">{label}</p>
    </div>
  )
}

export function QueueStatusCard({ counts }: QueueStatusCardProps) {
  const t = useTranslations('dashboard')
  const hasFailures = counts.failed > 0
  const hasExpired = counts.expired > 0
  const needsAttention = hasFailures || hasExpired

  return (
    <div className={`rounded-lg border p-4 transition-colors ${
      hasFailures
        ? 'border-red-200 bg-red-50/30'
        : 'border-neutral-200 bg-white'
    }`}>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-neutral-500">{t('uploadQueue')}</h2>
        {needsAttention && (
          <Link
            href="/queue"
            className="text-xs font-medium text-red-600 hover:text-red-700"
          >
            {t('attentionNeeded', { count: counts.failed + counts.expired })}
          </Link>
        )}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <CountBadge label={t('pending')} count={counts.pending} colorClass="bg-amber-50 text-amber-700" ariaLabel={`${counts.pending} ${t('pending')}`} />
        <CountBadge label={t('uploading')} count={counts.uploading} colorClass="bg-amber-50 text-amber-700" ariaLabel={`${counts.uploading} ${t('uploading')}`} />
        <CountBadge label={t('failed')} count={counts.failed} colorClass={hasFailures ? 'bg-red-100 text-red-800 ring-1 ring-red-200' : 'bg-red-50 text-red-700'} ariaLabel={`${counts.failed} ${t('failed')}`} />
        <CountBadge label={t('expired')} count={counts.expired} colorClass="bg-neutral-100 text-neutral-400" ariaLabel={`${counts.expired} ${t('expired')}`} />
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Add last-refreshed timestamp and inline today's summary into ActivitySummaryCard**

Modify `apps/lab-lite/src/components/dashboard/ActivitySummaryCard.tsx`:

```tsx
'use client'

import { useTranslations } from 'next-intl'

interface ActivitySummaryCardProps {
  uploadsCompleted: number
  resultsPending: number
  lastRefreshedAt?: string
}

export function ActivitySummaryCard({ uploadsCompleted, resultsPending, lastRefreshedAt }: ActivitySummaryCardProps) {
  const t = useTranslations('dashboard')

  const refreshedLabel = lastRefreshedAt
    ? t('lastRefreshed', { time: new Date(lastRefreshedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) })
    : null

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-neutral-500">{t('todaysActivity')}</h2>
        {refreshedLabel && (
          <span className="text-xs text-neutral-400">{refreshedLabel}</span>
        )}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-md bg-green-50 px-3 py-2 text-center" role="status" aria-label={`${uploadsCompleted} ${t('completed')}`}>
          <p className="text-2xl font-bold text-green-700" aria-hidden="true">{uploadsCompleted}</p>
          <p className="text-xs font-medium text-green-700" aria-hidden="true">{t('completed')}</p>
        </div>
        <div className="rounded-md bg-amber-50 px-3 py-2 text-center" role="status" aria-label={`${resultsPending} ${t('pendingReview')}`}>
          <p className="text-2xl font-bold text-amber-700" aria-hidden="true">{resultsPending}</p>
          <p className="text-xs font-medium text-amber-700" aria-hidden="true">{t('pendingReview')}</p>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Update useDashboardData to expose lastRefreshedAt**

In `apps/lab-lite/src/hooks/useDashboardData.ts`, add `lastRefreshedAt` to the return:

Add state: `const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null)`

At end of successful `fetchData`, add: `setLastRefreshedAt(new Date().toISOString())`

Add to `DashboardData` interface: `lastRefreshedAt: string | null`

Return it: `return { ..., lastRefreshedAt }`

- [ ] **Step 7: Rewrite dashboard page with new layout order**

Rewrite `apps/lab-lite/src/app/[locale]/page.tsx`:

```tsx
'use client'

import { useTranslations } from 'next-intl'
import { DashboardHeader } from '@/components/dashboard/DashboardHeader'
import { QueueStatusCard } from '@/components/dashboard/QueueStatusCard'
import { ActivitySummaryCard } from '@/components/dashboard/ActivitySummaryCard'
import { QuickActions } from '@/components/dashboard/QuickActions'
import { RecentUploadsList } from '@/components/dashboard/RecentUploadsList'
import { UploadSuccessBanner } from '@/components/dashboard/UploadSuccessBanner'
import { Button } from '@/components/ui/Button'
import { useDashboardData } from '@/hooks/useDashboardData'

function RecentUploadsSkeleton() {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4" aria-busy="true" aria-label="Loading recent uploads">
      <div className="h-3.5 w-28 animate-pulse rounded bg-neutral-200" />
      <div className="mt-3 space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <div className="h-4 w-40 animate-pulse rounded bg-neutral-100" />
              <div className="mt-1.5 h-3 w-24 animate-pulse rounded bg-neutral-100" />
            </div>
            <div className="ms-2 h-5 w-16 animate-pulse rounded-full bg-neutral-100" />
          </div>
        ))}
      </div>
    </div>
  )
}

export default function LabHomePage() {
  const t = useTranslations()
  const {
    queueCounts, todayUploadsCompleted, todayResultsPending,
    recentUploads, loading, error, retry, lastRefreshedAt,
  } = useDashboardData()

  return (
    <div className="flex flex-col gap-5">
      {/* Success banner (reads ?uploaded=true) */}
      <UploadSuccessBanner />

      {/* Error banner */}
      {error && (
        <div className="flex items-center justify-between rounded-md bg-amber-50 p-3 text-sm text-amber-700" role="alert" aria-live="assertive">
          <span>{error}</span>
          <Button variant="warning" onClick={retry}>{t('common.retry')}</Button>
        </div>
      )}

      {/* Header: greeting + lab name (replaces LabIdentityCard) */}
      <DashboardHeader />

      {/* Primary CTA — elevated to top, no card wrapper */}
      <QuickActions />

      {/* Queue status with attention states */}
      <QueueStatusCard counts={queueCounts} />

      {/* Today's activity with last-refreshed timestamp */}
      <ActivitySummaryCard
        uploadsCompleted={todayUploadsCompleted}
        resultsPending={todayResultsPending}
        lastRefreshedAt={lastRefreshedAt ?? undefined}
      />

      {/* Recent uploads with patient names and cancel action */}
      {loading ? <RecentUploadsSkeleton /> : (
        <RecentUploadsList items={recentUploads} onItemCancelled={retry} />
      )}
    </div>
  )
}
```

- [ ] **Step 8: Delete old LabIdentityCard.tsx**

```bash
rm apps/lab-lite/src/components/dashboard/LabIdentityCard.tsx
```

- [ ] **Step 9: Verify manually**

1. Dashboard shows greeting header (not a card)
2. Upload CTA is the first prominent element after header
3. Queue status highlights in red when failed > 0
4. Activity card shows "Updated HH:MM" timestamp
5. Recent uploads show patient names
6. Cancel button works on pending items

- [ ] **Step 10: Commit**

```bash
git add -A apps/lab-lite/src/components/dashboard/ apps/lab-lite/src/app/[locale]/page.tsx apps/lab-lite/src/hooks/useDashboardData.ts apps/lab-lite/messages/en.json
git commit -m "feat(lab-lite): redesign dashboard with visual hierarchy, elevated CTA, attention states"
```

---

## Phase 3: Patient Infrastructure

### Task 6: Extend Dexie Schema for Patient Cache

Lab-lite currently has a minimal `verified_patients` cache (patientId, firstName, age). Extend it to support the full patient search and creation workflow following OPD-lite patterns.

**Files:**
- Modify: `apps/lab-lite/src/lib/db.ts`

- [ ] **Step 1: Add patients table to Dexie schema**

In `apps/lab-lite/src/lib/db.ts`, bump version to 3 and add a `patients` table alongside the existing `verified_patients` (keep both for backward compatibility):

```typescript
// Add to version 3 migration
db.version(3).stores({
  uploadQueue: '++id, status, queuedAt',
  practitioner_keys: '&practitionerId, cachedAt',
  verified_patients: '&patientId, verifiedAt',
  patients: '&id, _ultranos.nameLocal, _ultranos.nationalIdHash, _ultranos.nameLatin, meta.lastUpdated',
  syncQueue: '&id, resourceType, resourceId, status, createdAt',
})
```

Add types (import `FhirPatient` from `@ultranos/shared-types` if available, otherwise define a local subset):

```typescript
import type { FhirPatient } from '@ultranos/shared-types'

// Re-export for convenience
export type { FhirPatient }
```

Add helper functions:

```typescript
export async function getPatients(): Promise<FhirPatient[]> {
  const db = getDb()
  return db.table('patients').toArray()
}

export async function putPatient(patient: FhirPatient): Promise<void> {
  const db = getDb()
  await db.table('patients').put(patient)
}

export async function putPatients(patients: FhirPatient[]): Promise<void> {
  const db = getDb()
  await db.table('patients').bulkPut(patients)
}

export async function getPatientById(id: string): Promise<FhirPatient | undefined> {
  const db = getDb()
  return db.table('patients').get(id)
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/lab-lite/src/lib/db.ts
git commit -m "feat(lab-lite): extend Dexie schema with patients table and sync queue"
```

---

### Task 7: Patient Search Hook (Two-Phase: Local + Hub)

Implement the same two-phase search pattern used by OPD-lite: immediate local Dexie results, then background Hub revalidation.

**Files:**
- Create: `apps/lab-lite/src/hooks/usePatientSearch.ts`
- Modify: `apps/lab-lite/src/lib/trpc.ts`

- [ ] **Step 1: Add patient search tRPC function**

In `apps/lab-lite/src/lib/trpc.ts`, add:

```typescript
export interface PatientSearchResult {
  id: string
  firstName: string
  age: number
  gender?: string
  phone?: string
}

export async function searchPatients(
  query: string,
  token: string,
): Promise<PatientSearchResult[]> {
  const url = `${getBaseUrl()}/lab.searchPatients?input=${encodeURIComponent(JSON.stringify({ json: { query } }))}`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`Search failed: ${res.status}`)
  const body = await res.json()
  return body.result.data.json.patients ?? []
}
```

- [ ] **Step 2: Create usePatientSearch hook**

Create `apps/lab-lite/src/hooks/usePatientSearch.ts`:

```typescript
'use client'

import { useState, useCallback, useRef } from 'react'
import { getDb, putPatients } from '@/lib/db'
import { searchPatients, type PatientSearchResult } from '@/lib/trpc'
import type { FhirPatient } from '@ultranos/shared-types'

export interface PatientSearchItem {
  id: string
  firstName: string
  age: number
  gender?: string
  phone?: string
  source: 'local' | 'remote'
}

interface UsePatientSearchReturn {
  query: string
  results: PatientSearchItem[]
  isSearching: boolean
  search: (query: string) => Promise<void>
  clear: () => void
}

function patientToSearchItem(p: FhirPatient): PatientSearchItem {
  const birthYear = p._ultranos?.birthYear ?? (p.birthDate ? parseInt(p.birthDate.slice(0, 4)) : undefined)
  const age = birthYear ? new Date().getFullYear() - birthYear : 0
  return {
    id: p.id,
    firstName: p._ultranos?.nameGiven ?? p.name?.[0]?.given?.[0] ?? '',
    age,
    gender: p.gender,
    phone: p.telecom?.find((t) => t.system === 'phone')?.value,
    source: 'local',
  }
}

export function usePatientSearch(token: string): UsePatientSearchReturn {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PatientSearchItem[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const search = useCallback(async (q: string) => {
    setQuery(q)
    const trimmed = q.trim()

    if (trimmed.length < 2) {
      setResults([])
      return
    }

    setIsSearching(true)

    // Phase 1: Local Dexie search (immediate)
    try {
      const db = getDb()
      const localPatients: FhirPatient[] = await db
        .table('patients')
        .filter((p: FhirPatient) => {
          const nameLocal = p._ultranos?.nameLocal?.toLowerCase() ?? ''
          const nameGiven = p._ultranos?.nameGiven?.toLowerCase() ?? ''
          const nameLatin = p._ultranos?.nameLatin?.toLowerCase() ?? ''
          const lower = trimmed.toLowerCase()
          return nameLocal.includes(lower) || nameGiven.includes(lower) || nameLatin.includes(lower)
        })
        .limit(20)
        .toArray()

      const localItems = localPatients.map(patientToSearchItem)
      setResults(localItems)
    } catch {
      // IndexedDB unavailable
    }

    // Phase 2: Hub revalidation (background, non-blocking)
    abortRef.current?.abort()
    abortRef.current = new AbortController()

    if (token) {
      try {
        const hubResults = await searchPatients(trimmed, token)
        const hubItems: PatientSearchItem[] = hubResults.map((r) => ({
          ...r,
          source: 'remote',
        }))

        // Merge: deduplicate by ID, prefer remote
        setResults((prev) => {
          const merged = new Map<string, PatientSearchItem>()
          for (const item of prev) merged.set(item.id, item)
          for (const item of hubItems) merged.set(item.id, item)
          return Array.from(merged.values())
        })
      } catch {
        // Offline-safe: keep local results
      }
    }

    setIsSearching(false)
  }, [token])

  const clear = useCallback(() => {
    setQuery('')
    setResults([])
    abortRef.current?.abort()
  }, [])

  return { query, results, isSearching, search, clear }
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/lab-lite/src/hooks/usePatientSearch.ts apps/lab-lite/src/lib/trpc.ts
git commit -m "feat(lab-lite): add two-phase patient search hook (local + Hub)"
```

---

### Task 8: Recent Patients List for Upload Step 1

Add a "Recent Patients" section on the upload verify step for quick one-tap patient selection, using the `verified_patients` cache.

**Files:**
- Create: `apps/lab-lite/src/components/upload/RecentPatientsList.tsx`
- Create: `apps/lab-lite/src/hooks/useRecentPatients.ts`
- Modify: `apps/lab-lite/src/app/[locale]/upload/page.tsx`
- Modify: `apps/lab-lite/messages/en.json`

- [ ] **Step 1: Add translation keys**

In `apps/lab-lite/messages/en.json`, add to `verification`:

```json
"recentPatients": "Recent Patients",
"noRecentPatients": "No recent patients",
"yearsOld": "{age} years"
```

- [ ] **Step 2: Create useRecentPatients hook**

Create `apps/lab-lite/src/hooks/useRecentPatients.ts`:

```typescript
'use client'

import { useState, useEffect } from 'react'
import { getDb, type VerifiedPatientCache } from '@/lib/db'

export function useRecentPatients(limit = 5) {
  const [patients, setPatients] = useState<VerifiedPatientCache[]>([])

  useEffect(() => {
    async function load() {
      try {
        const db = getDb()
        const items: VerifiedPatientCache[] = await db
          .table('verified_patients')
          .orderBy('verifiedAt')
          .reverse()
          .limit(limit)
          .toArray()
        setPatients(items)
      } catch {
        // IndexedDB unavailable
      }
    }
    load()
  }, [limit])

  return patients
}
```

- [ ] **Step 3: Create RecentPatientsList component**

Create `apps/lab-lite/src/components/upload/RecentPatientsList.tsx`:

```tsx
'use client'

import { useTranslations } from 'next-intl'
import type { VerifiedPatientCache } from '@/lib/db'

interface RecentPatientsListProps {
  patients: VerifiedPatientCache[]
  onSelect: (patient: VerifiedPatientCache) => void
}

export function RecentPatientsList({ patients, onSelect }: RecentPatientsListProps) {
  const t = useTranslations('verification')

  if (patients.length === 0) return null

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <h3 className="text-sm font-medium text-neutral-500">{t('recentPatients')}</h3>
      <ul className="mt-2 divide-y divide-neutral-100" role="list">
        {patients.map((p) => (
          <li key={p.patientId}>
            <button
              type="button"
              onClick={() => onSelect(p)}
              className="flex w-full items-center justify-between py-2.5 text-start hover:bg-neutral-50 rounded-md px-2 transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-primary-300"
            >
              <span className="text-sm font-medium text-neutral-900">{p.firstName}</span>
              <span className="text-xs text-neutral-400">{t('yearsOld', { age: p.age })}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 4: Integrate into upload page Step 1**

In `apps/lab-lite/src/app/[locale]/upload/page.tsx`:

Add imports:
```tsx
import { RecentPatientsList } from '@/components/upload/RecentPatientsList'
import { useRecentPatients } from '@/hooks/useRecentPatients'
```

Add hook inside the component:
```tsx
const recentPatients = useRecentPatients(5)
```

Add handler:
```tsx
const handleRecentPatientSelect = useCallback((patient: VerifiedPatientCache) => {
  dispatch({
    type: 'SET_PATIENT',
    payload: {
      patientRef: patient.patientId,
      patientFirstName: patient.firstName,
      patientAge: patient.age,
    },
  })
  setVerifyError(null)
}, [])
```

In Step 1 rendering, add the recent patients list before the Manual/QR toggle when no patient is verified:

```tsx
{!state.patient && (
  <>
    <RecentPatientsList patients={recentPatients} onSelect={handleRecentPatientSelect} />
    {/* existing Manual/QR toggle and form */}
  </>
)}
```

- [ ] **Step 5: Verify manually**

1. Complete a few uploads to populate the verified_patients cache
2. Start a new upload — verify Recent Patients list appears
3. Click a recent patient — verify it advances to Step 2
4. Verify empty state (no recent patients) shows nothing (not an empty card)

- [ ] **Step 6: Commit**

```bash
git add apps/lab-lite/src/components/upload/RecentPatientsList.tsx apps/lab-lite/src/hooks/useRecentPatients.ts apps/lab-lite/src/app/[locale]/upload/page.tsx apps/lab-lite/messages/en.json
git commit -m "feat(lab-lite): add recent patients list for quick patient selection in upload"
```

---

### Task 9: Patient Search Autocomplete in Upload Step 1

Add a search input that uses the two-phase search hook, allowing technicians to find patients by name without needing their national ID.

**Files:**
- Create: `apps/lab-lite/src/components/upload/PatientSearchInput.tsx`
- Modify: `apps/lab-lite/src/app/[locale]/upload/page.tsx`
- Modify: `apps/lab-lite/messages/en.json`

- [ ] **Step 1: Add translation keys**

In `apps/lab-lite/messages/en.json`, add to `verification`:

```json
"searchPatients": "Search Patients",
"searchPatientsPlaceholder": "Search by name...",
"searching": "Searching...",
"noSearchResults": "No patients found"
```

- [ ] **Step 2: Create PatientSearchInput component**

Create `apps/lab-lite/src/components/upload/PatientSearchInput.tsx`:

```tsx
'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { usePatientSearch, type PatientSearchItem } from '@/hooks/usePatientSearch'

interface PatientSearchInputProps {
  token: string
  onSelect: (patient: PatientSearchItem) => void
}

export function PatientSearchInput({ token, onSelect }: PatientSearchInputProps) {
  const t = useTranslations('verification')
  const { query, results, isSearching, search, clear } = usePatientSearch(token)
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()

  const handleInputChange = useCallback((value: string) => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      search(value)
      setIsOpen(value.trim().length >= 2)
    }, 250)
  }, [search])

  const handleSelect = useCallback((patient: PatientSearchItem) => {
    onSelect(patient)
    clear()
    setIsOpen(false)
  }, [onSelect, clear])

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div ref={containerRef} className="relative">
      <label htmlFor="patient-search" className="text-sm font-medium text-neutral-700">
        {t('searchPatients')}
      </label>
      <input
        id="patient-search"
        type="text"
        placeholder={t('searchPatientsPlaceholder')}
        onChange={(e) => handleInputChange(e.target.value)}
        onFocus={() => { if (query.trim().length >= 2) setIsOpen(true) }}
        className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-4 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
        autoComplete="off"
        aria-expanded={isOpen}
        aria-controls="patient-search-results"
        role="combobox"
      />

      {isOpen && (
        <ul
          id="patient-search-results"
          role="listbox"
          className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-neutral-200 bg-white shadow-lg"
        >
          {isSearching && results.length === 0 && (
            <li className="px-4 py-3 text-sm text-neutral-400">{t('searching')}</li>
          )}
          {!isSearching && results.length === 0 && query.trim().length >= 2 && (
            <li className="px-4 py-3 text-sm text-neutral-400">{t('noSearchResults')}</li>
          )}
          {results.map((patient) => (
            <li key={patient.id}>
              <button
                type="button"
                role="option"
                onClick={() => handleSelect(patient)}
                className="flex w-full items-center justify-between px-4 py-2.5 text-start hover:bg-primary-50 focus:bg-primary-50 focus:outline-none"
              >
                <span className="text-sm font-medium text-neutral-900">{patient.firstName}</span>
                <span className="text-xs text-neutral-400">{patient.age} years</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Add search tab to upload page Step 1**

In `apps/lab-lite/src/app/[locale]/upload/page.tsx`, add `'search'` as a third verify mode:

Change: `const [verifyMode, setVerifyMode] = useState<'manual' | 'qr'>('manual')`
To: `const [verifyMode, setVerifyMode] = useState<'search' | 'manual' | 'qr'>('search')`

Add the search tab button in the toggle group (as the first tab):

```tsx
<button
  type="button"
  onClick={() => setVerifyMode('search')}
  className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-200 ${
    verifyMode === 'search'
      ? 'bg-white text-primary-700 shadow-sm'
      : 'text-neutral-500 [@media(hover:hover)and(pointer:fine)]:hover:text-neutral-700'
  }`}
>
  {t('verification.searchPatients')}
</button>
```

Add the search input rendering:

```tsx
{verifyMode === 'search' && (
  <PatientSearchInput
    token={token}
    onSelect={(patient) => {
      dispatch({
        type: 'SET_PATIENT',
        payload: {
          patientRef: patient.id,
          patientFirstName: patient.firstName,
          patientAge: patient.age,
        },
      })
      setVerifyError(null)
    }}
  />
)}
```

- [ ] **Step 4: Verify manually**

1. Go to upload page — verify "Search" is the default tab
2. Type a patient name — verify dropdown appears with results
3. Click a result — verify patient is set and flow advances
4. Verify Manual ID and QR Scan tabs still work

- [ ] **Step 5: Commit**

```bash
git add apps/lab-lite/src/components/upload/PatientSearchInput.tsx apps/lab-lite/src/app/[locale]/upload/page.tsx apps/lab-lite/messages/en.json
git commit -m "feat(lab-lite): add patient search autocomplete to upload wizard"
```

---

### Task 10: Patient Registration Form (Following OPD-Lite Pattern)

Add a patient registration form for cases where the patient doesn't exist in the system. Follows OPD-lite's pattern: form fields → MPI duplicate check → create via Hub API → save locally.

**Files:**
- Create: `apps/lab-lite/src/components/patients/PatientRegistrationForm.tsx`
- Create: `apps/lab-lite/src/components/patients/MpiResultModal.tsx`
- Create: `apps/lab-lite/src/app/[locale]/patients/register/page.tsx`
- Modify: `apps/lab-lite/src/lib/trpc.ts`
- Modify: `apps/lab-lite/src/components/AppSidebar.tsx`
- Modify: `apps/lab-lite/messages/en.json`

- [ ] **Step 1: Add patient tRPC functions**

In `apps/lab-lite/src/lib/trpc.ts`, add:

```typescript
export interface CheckDuplicatesResult {
  decision: 'ALLOW' | 'WARN' | 'BLOCK'
  candidates: Array<{
    id: string
    nameGiven?: string
    nameFather?: string
    birthYear?: number
    gender?: string
    districtOrigin?: string
    mpiScore: number
  }>
  proceedToken?: string
}

export interface CreatePatientInput {
  nameLocal: string
  nameGiven?: string
  nameFather?: string
  nameGrandfather?: string
  gender: string
  birthDate?: string
  birthYearOnly?: boolean
  birthYear?: number
  phone?: string
  consent: {
    method: 'WRITTEN' | 'VERBAL_WITNESSED'
    witnessedBy?: string
    language: string
    version: string
  }
  mpiProceedToken?: string
}

export interface CreatePatientResult {
  id: string
}

export async function checkDuplicates(
  input: Record<string, unknown>,
  token: string,
): Promise<CheckDuplicatesResult> {
  const url = `${getBaseUrl()}/patient.checkDuplicates?input=${encodeURIComponent(JSON.stringify({ json: input }))}`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) throw new Error(`Duplicate check failed: ${res.status}`)
  const body = await res.json()
  return body.result.data.json
}

export async function createPatient(
  input: CreatePatientInput,
  token: string,
): Promise<CreatePatientResult> {
  const res = await fetch(`${getBaseUrl()}/patient.create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ json: input }),
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) throw new Error(`Patient creation failed: ${res.status}`)
  const body = await res.json()
  return body.result.data.json
}
```

- [ ] **Step 2: Create MpiResultModal**

Create `apps/lab-lite/src/components/patients/MpiResultModal.tsx`:

```tsx
'use client'

import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/Button'
import type { CheckDuplicatesResult } from '@/lib/trpc'

interface MpiResultModalProps {
  result: CheckDuplicatesResult
  onProceed: (token?: string) => void
  onSelectExisting: (patientId: string) => void
  onCancel: () => void
}

export function MpiResultModal({ result, onProceed, onSelectExisting, onCancel }: MpiResultModalProps) {
  const t = useTranslations('patients')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" role="dialog" aria-modal="true">
      <div className="mx-4 w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h2 className="text-lg font-bold text-neutral-900">
          {result.decision === 'BLOCK' ? t('mpiBlocked') : t('mpiWarning')}
        </h2>
        <p className="mt-2 text-sm text-neutral-600">
          {result.decision === 'BLOCK' ? t('mpiBlockedDesc') : t('mpiWarningDesc')}
        </p>

        <ul className="mt-4 divide-y divide-neutral-100 rounded-lg border border-neutral-200">
          {result.candidates.map((c) => (
            <li key={c.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm font-medium text-neutral-900">
                  {c.nameGiven ?? 'Unknown'} {c.nameFather ? `(${c.nameFather})` : ''}
                </p>
                <p className="text-xs text-neutral-500">
                  {c.gender} {c.birthYear ? `· Born ${c.birthYear}` : ''} {c.districtOrigin ? `· ${c.districtOrigin}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  c.mpiScore >= 80 ? 'bg-red-50 text-red-700' :
                  c.mpiScore >= 60 ? 'bg-amber-50 text-amber-700' :
                  'bg-neutral-100 text-neutral-500'
                }`}>
                  {c.mpiScore}%
                </span>
                <Button variant="ghost" type="button" onClick={() => onSelectExisting(c.id)}>
                  {t('useExisting')}
                </Button>
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-4 flex gap-2">
          {result.decision === 'WARN' && result.proceedToken && (
            <Button variant="warning" type="button" onClick={() => onProceed(result.proceedToken)}>
              {t('addAnyway')}
            </Button>
          )}
          <Button variant="outline" type="button" onClick={onCancel}>
            {t('cancel')}
          </Button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create PatientRegistrationForm**

Create `apps/lab-lite/src/components/patients/PatientRegistrationForm.tsx`. This is a simplified version of OPD-lite's form, adapted for lab context (fewer fields, focused on identification):

```tsx
'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/Button'
import { MpiResultModal } from './MpiResultModal'
import { checkDuplicates, createPatient, type CheckDuplicatesResult, type CreatePatientInput } from '@/lib/trpc'
import { putPatient } from '@/lib/db'
import { reportQueueAuditEvent } from '@/lib/audit-client'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { getSupabaseBrowserClient } from '@/lib/supabase'

const CURRENT_YEAR = new Date().getFullYear()

export function PatientRegistrationForm() {
  const t = useTranslations('patients')
  const router = useRouter()
  const session = useAuthSessionStore((s) => s.session)

  const [nameGiven, setNameGiven] = useState('')
  const [nameFather, setNameFather] = useState('')
  const [gender, setGender] = useState('')
  const [birthYearOnly, setBirthYearOnly] = useState(true)
  const [birthYear, setBirthYear] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [phone, setPhone] = useState('')
  const [consentMethod, setConsentMethod] = useState<'WRITTEN' | 'VERBAL_WITNESSED'>('WRITTEN')
  const [consentWitness, setConsentWitness] = useState('')

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [mpiResult, setMpiResult] = useState<CheckDuplicatesResult | null>(null)

  const validate = useCallback((): boolean => {
    const errs: Record<string, string> = {}
    if (!nameGiven.trim()) errs.nameGiven = t('errorNameRequired')
    if (!gender) errs.gender = t('errorGenderRequired')
    if (birthYearOnly && !birthYear) errs.birthYear = t('errorBirthYearRequired')
    if (!birthYearOnly && !birthDate) errs.birthDate = t('errorBirthDateRequired')
    if (birthYearOnly && birthYear) {
      const y = parseInt(birthYear)
      if (isNaN(y) || y < 1900 || y > CURRENT_YEAR) errs.birthYear = t('errorBirthYearRange')
    }
    if (consentMethod === 'VERBAL_WITNESSED' && !consentWitness.trim()) {
      errs.consentWitness = t('errorWitnessRequired')
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }, [nameGiven, gender, birthYearOnly, birthYear, birthDate, consentMethod, consentWitness, t])

  const handleSubmit = useCallback(async (mpiProceedToken?: string) => {
    if (!mpiProceedToken && !validate()) return
    setSubmitting(true)
    setSubmitError(null)

    try {
      const supabase = getSupabaseBrowserClient()
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      if (!token) throw new Error('Session expired')

      // Step 1: Check duplicates (skip if we have a proceed token)
      if (!mpiProceedToken) {
        const dupResult = await checkDuplicates({
          nameGiven: nameGiven.trim(),
          nameFather: nameFather.trim() || undefined,
          birthYear: birthYearOnly ? parseInt(birthYear) : undefined,
          gender,
          phone: phone.trim() || undefined,
        }, token)

        if (dupResult.decision !== 'ALLOW') {
          setMpiResult(dupResult)
          setSubmitting(false)
          return
        }
      }

      // Step 2: Create patient
      const input: CreatePatientInput = {
        nameLocal: nameGiven.trim(),
        nameGiven: nameGiven.trim(),
        nameFather: nameFather.trim() || undefined,
        gender,
        birthYearOnly,
        birthYear: birthYearOnly ? parseInt(birthYear) : undefined,
        birthDate: !birthYearOnly ? birthDate : undefined,
        phone: phone.trim() || undefined,
        consent: {
          method: consentMethod,
          witnessedBy: consentMethod === 'VERBAL_WITNESSED' ? consentWitness.trim() : undefined,
          language: 'en',
          version: '1.0',
        },
        mpiProceedToken,
      }

      const result = await createPatient(input, token)

      // Step 3: Save to local Dexie
      const now = new Date().toISOString()
      await putPatient({
        id: result.id,
        resourceType: 'Patient',
        name: [{ given: [nameGiven.trim()], text: nameGiven.trim() }],
        gender: gender as 'male' | 'female' | 'other' | 'unknown',
        birthDate: birthYearOnly ? birthYear : birthDate,
        birthYearOnly,
        telecom: phone ? [{ system: 'phone', value: phone.trim() }] : [],
        _ultranos: {
          nameLocal: nameGiven.trim(),
          nameGiven: nameGiven.trim(),
          nameFather: nameFather.trim() || undefined,
          birthYear: birthYearOnly ? parseInt(birthYear) : undefined,
          isNomadic: false,
          isActive: true,
          patient_tier: 'FREE',
          createdAt: now,
        },
        meta: { lastUpdated: now },
      } as any)

      router.push('/upload')
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : t('errorUnexpected'))
    } finally {
      setSubmitting(false)
    }
  }, [nameGiven, nameFather, gender, birthYearOnly, birthYear, birthDate, phone, consentMethod, consentWitness, validate, router, t])

  return (
    <>
      <form onSubmit={(e) => { e.preventDefault(); handleSubmit() }} className="flex flex-col gap-4">
        {submitError && (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">{submitError}</div>
        )}

        {/* Name */}
        <div className="flex flex-col gap-1">
          <label htmlFor="name-given" className="text-sm font-medium text-neutral-700">{t('nameGiven')} *</label>
          <input id="name-given" type="text" value={nameGiven} onChange={(e) => setNameGiven(e.target.value)} maxLength={200}
            className="rounded-lg border border-neutral-300 px-4 py-2.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500" />
          {errors.nameGiven && <p className="text-xs text-red-600">{errors.nameGiven}</p>}
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="name-father" className="text-sm font-medium text-neutral-700">{t('nameFather')}</label>
          <input id="name-father" type="text" value={nameFather} onChange={(e) => setNameFather(e.target.value)} maxLength={200}
            className="rounded-lg border border-neutral-300 px-4 py-2.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500" />
        </div>

        {/* Gender */}
        <div className="flex flex-col gap-1">
          <label htmlFor="gender" className="text-sm font-medium text-neutral-700">{t('gender')} *</label>
          <select id="gender" value={gender} onChange={(e) => setGender(e.target.value)}
            className="rounded-lg border border-neutral-300 px-4 py-2.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500">
            <option value="">{t('selectGender')}</option>
            <option value="male">{t('male')}</option>
            <option value="female">{t('female')}</option>
            <option value="other">{t('other')}</option>
          </select>
          {errors.gender && <p className="text-xs text-red-600">{errors.gender}</p>}
        </div>

        {/* Birth Year/Date */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-neutral-700">{t('birthInfo')} *</label>
            <label className="flex items-center gap-1.5 text-xs text-neutral-500">
              <input type="checkbox" checked={birthYearOnly} onChange={(e) => setBirthYearOnly(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-neutral-300" />
              {t('yearOnly')}
            </label>
          </div>
          {birthYearOnly ? (
            <input type="number" value={birthYear} onChange={(e) => setBirthYear(e.target.value)} min={1900} max={CURRENT_YEAR} placeholder="e.g. 1985"
              className="rounded-lg border border-neutral-300 px-4 py-2.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500" />
          ) : (
            <input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} max={new Date().toISOString().split('T')[0]}
              className="rounded-lg border border-neutral-300 px-4 py-2.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500" />
          )}
          {(errors.birthYear || errors.birthDate) && <p className="text-xs text-red-600">{errors.birthYear || errors.birthDate}</p>}
        </div>

        {/* Phone */}
        <div className="flex flex-col gap-1">
          <label htmlFor="phone" className="text-sm font-medium text-neutral-700">{t('phone')}</label>
          <input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={50}
            className="rounded-lg border border-neutral-300 px-4 py-2.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500" />
        </div>

        {/* Consent */}
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium text-neutral-700">{t('consent')} *</legend>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="consent" value="WRITTEN" checked={consentMethod === 'WRITTEN'} onChange={() => setConsentMethod('WRITTEN')}
                className="h-4 w-4 border-neutral-300 text-primary-600" />
              {t('consentWritten')}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="consent" value="VERBAL_WITNESSED" checked={consentMethod === 'VERBAL_WITNESSED'} onChange={() => setConsentMethod('VERBAL_WITNESSED')}
                className="h-4 w-4 border-neutral-300 text-primary-600" />
              {t('consentVerbal')}
            </label>
          </div>
          {consentMethod === 'VERBAL_WITNESSED' && (
            <div className="flex flex-col gap-1">
              <label htmlFor="consent-witness" className="text-xs text-neutral-600">{t('witnessName')}</label>
              <input id="consent-witness" type="text" value={consentWitness} onChange={(e) => setConsentWitness(e.target.value)}
                className="rounded-lg border border-neutral-300 px-4 py-2.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500" />
              {errors.consentWitness && <p className="text-xs text-red-600">{errors.consentWitness}</p>}
            </div>
          )}
        </fieldset>

        <Button variant="primary" type="submit" disabled={submitting} fullWidth>
          {submitting ? t('registering') : t('registerPatient')}
        </Button>
      </form>

      {mpiResult && (
        <MpiResultModal
          result={mpiResult}
          onProceed={(token) => { setMpiResult(null); handleSubmit(token) }}
          onSelectExisting={(id) => { setMpiResult(null); router.push(`/upload?patientId=${id}`) }}
          onCancel={() => setMpiResult(null)}
        />
      )}
    </>
  )
}
```

- [ ] **Step 4: Create registration page**

Create `apps/lab-lite/src/app/[locale]/patients/register/page.tsx`:

```tsx
'use client'

import { useTranslations } from 'next-intl'
import { PatientRegistrationForm } from '@/components/patients/PatientRegistrationForm'

export default function RegisterPatientPage() {
  const t = useTranslations('patients')

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-xl font-bold text-neutral-900 mb-6">{t('registerTitle')}</h1>
      <PatientRegistrationForm />
    </div>
  )
}
```

- [ ] **Step 5: Add all patient translation keys**

In `apps/lab-lite/messages/en.json`, add a `patients` section:

```json
"patients": {
  "registerTitle": "Register New Patient",
  "registerPatient": "Register Patient",
  "registering": "Registering...",
  "nameGiven": "Given Name",
  "nameFather": "Father's Name",
  "gender": "Gender",
  "selectGender": "Select gender...",
  "male": "Male",
  "female": "Female",
  "other": "Other",
  "birthInfo": "Date of Birth",
  "yearOnly": "Year only",
  "phone": "Phone",
  "consent": "Consent",
  "consentWritten": "Written",
  "consentVerbal": "Verbal (Witnessed)",
  "witnessName": "Witness Name",
  "cancel": "Cancel",
  "addAnyway": "Add Anyway",
  "useExisting": "Use This Patient",
  "mpiWarning": "Possible Duplicate Found",
  "mpiWarningDesc": "A patient with similar details already exists. Please review before continuing.",
  "mpiBlocked": "Duplicate Patient Detected",
  "mpiBlockedDesc": "A patient with these details already exists. Please select the existing patient.",
  "errorNameRequired": "Given name is required.",
  "errorGenderRequired": "Gender is required.",
  "errorBirthYearRequired": "Birth year is required.",
  "errorBirthDateRequired": "Birth date is required.",
  "errorBirthYearRange": "Birth year must be between 1900 and the current year.",
  "errorWitnessRequired": "Witness name is required for verbal consent.",
  "errorUnexpected": "An unexpected error occurred."
}
```

- [ ] **Step 6: Add nav item for patient registration**

In `apps/lab-lite/src/components/AppSidebar.tsx`, add a nav item for "Register Patient" in the primary group after "Upload Result".

In `apps/lab-lite/messages/en.json`, add to `sidebar`:

```json
"registerPatient": "Register Patient"
```

- [ ] **Step 7: Verify manually**

1. Navigate to `/patients/register`
2. Fill in the form with valid data
3. Verify MPI check runs on submit
4. Verify patient is created and saved to Dexie
5. Verify redirect to `/upload` after creation
6. Verify the new patient appears in patient search

- [ ] **Step 8: Commit**

```bash
git add apps/lab-lite/src/components/patients/ apps/lab-lite/src/app/[locale]/patients/ apps/lab-lite/src/lib/trpc.ts apps/lab-lite/src/components/AppSidebar.tsx apps/lab-lite/messages/en.json
git commit -m "feat(lab-lite): add patient registration with MPI duplicate detection"
```

---

## Phase 4: Onboarding & Contextual Help

### Task 11: Add Contextual Tooltips and Help Text

Add help text for LOINC categories, OCR confidence badges, and key workflow decisions.

**Files:**
- Create: `apps/lab-lite/src/components/ui/Tooltip.tsx`
- Modify: `apps/lab-lite/src/components/MetadataForm.tsx`
- Modify: `apps/lab-lite/messages/en.json`

- [ ] **Step 1: Create Tooltip component**

Create `apps/lab-lite/src/components/ui/Tooltip.tsx`:

```tsx
'use client'

import { useState, useRef, useEffect } from 'react'

interface TooltipProps {
  content: string
  children?: React.ReactNode
}

export function Tooltip({ content, children }: TooltipProps) {
  const [visible, setVisible] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)

  return (
    <span className="relative inline-flex">
      <button
        ref={triggerRef}
        type="button"
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onFocus={() => setVisible(true)}
        onBlur={() => setVisible(false)}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-neutral-200 text-xs text-neutral-500 hover:bg-neutral-300 focus:outline-none focus:ring-2 focus:ring-primary-300"
        aria-label={content}
      >
        {children ?? '?'}
      </button>
      {visible && (
        <div
          role="tooltip"
          className="absolute bottom-full start-1/2 z-30 mb-1.5 w-56 -translate-x-1/2 rounded-md bg-neutral-800 px-3 py-2 text-xs text-white shadow-lg"
        >
          {content}
          <div className="absolute top-full start-1/2 -translate-x-1/2 border-4 border-transparent border-t-neutral-800" />
        </div>
      )}
    </span>
  )
}
```

- [ ] **Step 2: Add tooltip translation keys**

In `apps/lab-lite/messages/en.json`, add to `metadata`:

```json
"testCategoryHelp": "LOINC is a standard system for identifying medical laboratory tests. Select the category that best matches your lab result.",
"confidenceHelp": "OCR confidence shows how certain the system is about the auto-detected value. High (85%+) means likely correct. Review all values before confirming.",
"collectionDateHelp": "The date the sample was collected from the patient, not the date of analysis."
```

- [ ] **Step 3: Add tooltips to MetadataForm**

In `apps/lab-lite/src/components/MetadataForm.tsx`, import `Tooltip` and add next to the "Test Category" and "Collection Date" labels:

Next to "Test Category" label:
```tsx
<Tooltip content={t('testCategoryHelp')} />
```

Next to "Sample Collection Date" label:
```tsx
<Tooltip content={t('collectionDateHelp')} />
```

Next to confidence badges (when OCR suggestions are shown):
```tsx
<Tooltip content={t('confidenceHelp')} />
```

- [ ] **Step 4: Commit**

```bash
git add apps/lab-lite/src/components/ui/Tooltip.tsx apps/lab-lite/src/components/MetadataForm.tsx apps/lab-lite/messages/en.json
git commit -m "feat(lab-lite): add contextual tooltips for LOINC categories and OCR confidence"
```

---

## Phase 5: Efficiency

### Task 12: Keyboard Shortcuts for Upload Wizard

Add Enter key to advance wizard steps when the current step is valid, and Escape to go back.

**Files:**
- Modify: `apps/lab-lite/src/app/[locale]/upload/page.tsx`

- [ ] **Step 1: Add keyboard handler**

In `apps/lab-lite/src/app/[locale]/upload/page.tsx`, add a `useEffect` for keyboard shortcuts:

```tsx
useEffect(() => {
  function handleKeyDown(e: KeyboardEvent) {
    // Don't intercept if user is typing in an input/textarea/select
    const tag = (e.target as HTMLElement)?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

    if (e.key === 'Escape' && state.step !== 'VERIFY_PATIENT') {
      e.preventDefault()
      dispatch({ type: 'PREV_STEP' })
    }
  }

  window.addEventListener('keydown', handleKeyDown)
  return () => window.removeEventListener('keydown', handleKeyDown)
}, [state.step])
```

- [ ] **Step 2: Commit**

```bash
git add apps/lab-lite/src/app/[locale]/upload/page.tsx
git commit -m "feat(lab-lite): add Escape key shortcut to go back in upload wizard"
```

---

## Phase 6: Polish

### Task 13: Unify Input Styling and Remove Duplicate Utilities

**Files:**
- Modify: `apps/lab-lite/src/app/[locale]/login/page.tsx` (unify border-radius to rounded-lg)
- Create: `apps/lab-lite/src/lib/format.ts` (extract shared formatFileSize)
- Modify: `apps/lab-lite/src/components/ResultUpload.tsx` (use shared formatFileSize)
- Modify: `apps/lab-lite/src/components/upload/ReviewStep.tsx` (use shared formatFileSize)

- [ ] **Step 1: Create shared format utility**

Create `apps/lab-lite/src/lib/format.ts`:

```typescript
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
```

- [ ] **Step 2: Update ResultUpload and ReviewStep to use shared utility**

In both `apps/lab-lite/src/components/ResultUpload.tsx` and `apps/lab-lite/src/components/upload/ReviewStep.tsx`:

Remove the local `formatFileSize` function and replace with:
```typescript
import { formatFileSize } from '@/lib/format'
```

- [ ] **Step 3: Unify login page input styling**

In `apps/lab-lite/src/app/[locale]/login/page.tsx`, change any `rounded-md` on inputs to `rounded-lg` and any `focus:ring-1` to `focus:ring-2` to match the rest of the app.

- [ ] **Step 4: Clean up Settings page placeholders**

In `apps/lab-lite/src/components/settings/LabSettingsView.tsx`, hide cards that are entirely placeholder data. Replace the Session Info and MFA Status cards with a conditional: only show if the data is available (not all `--`).

Add after the Lab Info card:

```tsx
{/* Session and MFA cards hidden until data is available */}
```

Remove or comment out the Session Info and MFA Status cards that display only `--` values.

- [ ] **Step 5: Commit**

```bash
git add apps/lab-lite/src/lib/format.ts apps/lab-lite/src/components/ResultUpload.tsx apps/lab-lite/src/components/upload/ReviewStep.tsx apps/lab-lite/src/app/[locale]/login/page.tsx apps/lab-lite/src/components/settings/LabSettingsView.tsx
git commit -m "chore(lab-lite): unify input styling, extract shared utilities, clean up settings"
```

---

## Summary

| Phase | Tasks | Key Deliverables |
|-------|-------|-----------------|
| **1. Harden** | 1-4 | Upload success banner (P0), cancel queued uploads, i18n completion, date validation |
| **2. Dashboard** | 5 | Visual hierarchy, elevated CTA, attention states, last-refreshed timestamp |
| **3. Patients** | 6-10 | Dexie schema, patient search, recent patients, search autocomplete, registration with MPI |
| **4. Onboard** | 11 | Tooltip component, contextual help on LOINC/OCR/dates |
| **5. Efficiency** | 12 | Keyboard shortcuts (Escape to go back) |
| **6. Polish** | 13 | Unified styling, shared utilities, settings cleanup |
