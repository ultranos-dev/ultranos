'use client'

/**
 * Result Entry Page — Structured data entry for a sample in "In Processing" status.
 *
 * Story 42.4 — AC: 1, 9, 10
 *
 * Route: /[locale]/results/[sampleId]/enter
 *
 * Loads the sample, resolves the first ordered test's LOINC code,
 * looks up the matching template, pre-populates any existing draft,
 * and renders the ResultEntryForm.
 *
 * PHI note: Only first name + age are shown in the form (CLAUDE.md Rule #7).
 * The patientRef in the sample is an opaque UUID — never a name.
 */

import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import {
  getSampleById,
  getDraftResultForSample,
  getObservationsForResult,
  putLabResult,
  putLabObservations,
  seedTemplates,
} from '@/lib/db'
import type { LabResult, LabObservation } from '@/lib/db'
import { resolveTemplate } from '@/lib/result-templates'
import { ResultEntryForm } from '@/components/ResultEntryForm'
import { mapResultToFhirBundle } from '@/lib/result-to-fhir'
import { enqueueSyncEvent } from '@/lib/db'
import { reportLabResultAuditEvent } from '@/lib/audit-client'
import type { FhirSpecimen } from '@ultranos/shared-types'

interface PageProps {
  params: Promise<{ sampleId: string; locale: string }>
}

export default function ResultEntryPage({ params }: PageProps) {
  const { sampleId } = use(params)
  const router = useRouter()
  const t = useTranslations('resultEntry')
  const session = useAuthSessionStore((s) => s.session)

  const [sample, setSample] = useState<FhirSpecimen | null>(null)
  const [patientFirstName, setPatientFirstName] = useState('')
  const [patientAge, setPatientAge] = useState(0)
  const [patientGender, setPatientGender] = useState('unknown')
  const [existingDraft, setExistingDraft] = useState<
    { result: LabResult; observations: LabObservation[] } | undefined
  >(undefined)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        // Ensure templates are seeded before loading the form
        await seedTemplates()

        const s = await getSampleById(sampleId)
        if (!s) {
          setError(t('sampleNotFound'))
          return
        }
        setSample(s)

        // Resolve patient display info from the verified_patients cache
        // (already minimized: first name + age only — CLAUDE.md Rule #7)
        const { getDb } = await import('@/lib/db')
        const db = getDb()
        const patientRef = s.subject?.reference ?? ''
        const patientId = patientRef.replace('Patient/', '')
        const cached = patientId ? await db.verified_patients.get(patientId) : undefined
        setPatientFirstName(cached?.firstName ?? t('unknownPatient'))
        setPatientAge(cached?.age ?? 0)

        // Resolve gender from the full patient record (used for reference ranges only)
        const fullPatient = patientId
          ? await db.table('patients').get(patientId)
          : undefined
        setPatientGender(fullPatient?.gender ?? 'unknown')

        // Load existing draft if present
        const draft = await getDraftResultForSample(sampleId)
        if (draft) {
          const observations = await getObservationsForResult(draft.id)
          setExistingDraft({ result: draft, observations })
        }
      } catch (err) {
        setError(t('loadError'))
        console.error('[ResultEntryPage] load error', err) // no PHI — error shape only
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [sampleId, t])

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-sm text-neutral-500">{t('loading')}</p>
      </div>
    )
  }

  if (error || !sample) {
    return (
      <div className="rounded-md bg-red-50 p-4 text-sm text-red-800 dark:bg-red-900/20 dark:text-red-200">
        {error ?? t('loadError')}
      </div>
    )
  }

  // Resolve template from the first ordered test's LOINC code
  const loincCode: string =
    (sample._ultranos as any)?.orderedLoincCode ??
    (sample._ultranos as any)?.orderedTests?.[0]?.loincCode ??
    'custom'
  const template = resolveTemplate(loincCode)

  async function handleSaveDraft(
    resultRecord: Omit<LabResult, 'id'>,
    observations: Omit<LabObservation, 'id'>[],
  ) {
    const resultId = existingDraft?.result.id ?? crypto.randomUUID()
    const now = new Date().toISOString()

    const fullResult: LabResult = { ...resultRecord, id: resultId }
    const fullObs: LabObservation[] = observations.map((o) => ({
      ...o,
      id: crypto.randomUUID(),
      resultId,
    }))

    await putLabResult(fullResult)
    await putLabObservations(fullObs)

    reportLabResultAuditEvent({
      action: 'LAB_RESULT_ENTERED',
      sampleId,
      templateVersion: template.templateVersion,
      fieldCount: fullObs.length,
      flagSummary: buildFlagSummary(fullObs),
      saveType: 'draft',
      technicianId: session?.practitionerId ?? 'unknown',
      resultId,
    })

    setExistingDraft({ result: fullResult, observations: fullObs })
  }

  async function handleSave(
    resultRecord: Omit<LabResult, 'id'>,
    observations: Omit<LabObservation, 'id'>[],
  ) {
    const resultId = existingDraft?.result.id ?? crypto.randomUUID()

    const fullResult: LabResult = { ...resultRecord, id: resultId }
    const fullObs: LabObservation[] = observations.map((o) => ({
      ...o,
      id: crypto.randomUUID(),
      resultId,
    }))

    await putLabResult(fullResult)
    await putLabObservations(fullObs)

    // Build FHIR bundle and queue for sync
    const bundle = mapResultToFhirBundle(fullResult, fullObs, template, sample)
    await enqueueSyncEvent({
      resourceType: 'DiagnosticReport',
      resourceId: bundle.diagnosticReport.id,
      payload: bundle,
      hlcTimestamp: new Date().toISOString(),
    })

    // Transition sample status to 'completed'
    try {
      const { transitionSampleStatus } = await import('@/lib/sample-service')
      await transitionSampleStatus(sampleId, 'completed')
    } catch {
      // Non-fatal — result is saved; status transition may be retried
    }

    reportLabResultAuditEvent({
      action: 'LAB_RESULT_ENTERED',
      sampleId,
      templateVersion: template.templateVersion,
      fieldCount: fullObs.length,
      flagSummary: buildFlagSummary(fullObs),
      saveType: 'complete',
      technicianId: session?.practitionerId ?? 'unknown',
      resultId,
    })

    // Navigate back to sample detail page
    router.push(`../${sampleId}`)
  }

  return (
    <div className="flex flex-col">
      <div className="border-b border-neutral-200 px-4 py-3 dark:border-neutral-700">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
        >
          <span aria-hidden>‹</span>
          {t('backToSample')}
        </button>
      </div>
      <ResultEntryForm
        sampleId={sampleId}
        template={template}
        patientFirstName={patientFirstName}
        patientAge={patientAge}
        patientGender={patientGender}
        onSave={handleSave}
        onSaveDraft={handleSaveDraft}
        enteredBy={session?.practitionerId ?? 'unknown'}
        existingDraft={existingDraft}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildFlagSummary(
  observations: LabObservation[],
): Record<string, number> {
  const summary: Record<string, number> = { L: 0, H: 0, LL: 0, HH: 0, A: 0 }
  for (const obs of observations) {
    if (obs.flag && obs.flag in summary) {
      summary[obs.flag] = (summary[obs.flag] ?? 0) + 1
    }
  }
  return summary
}
