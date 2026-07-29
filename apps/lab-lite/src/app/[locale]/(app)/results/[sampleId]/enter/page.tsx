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
  enqueueSyncEvent,
} from '@/lib/db'
import type { LabResult, LabObservation } from '@/lib/db'
import { resolveTemplate } from '@/lib/result-templates'
import type { RangeResolutionContext } from '@/lib/result-templates'
import { ResultEntryForm } from '@/components/ResultEntryForm'
import { mapResultToFhirBundle } from '@/lib/result-to-fhir'
import { reportLabResultAuditEvent, reportAnomalyDetection } from '@/lib/audit-client'
import { detectAnomalies, ANOMALY_MODEL_VERSION } from '@/lib/anomaly-engine'
import type { AnomalyFlag } from '@/lib/anomaly-engine'
import { getPriorResult } from '@/lib/prior-results'
import { AnomalyFlagDisplay } from '@/components/AnomalyFlagDisplay'
import type { FhirSpecimen } from '@ultranos/shared-types'
import type { ReferenceRange as LocalizedRange, RangeSnapshot } from '@/lib/reference-ranges/types'

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
  const [rangeContext, setRangeContext] = useState<RangeResolutionContext | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [anomalyFlags, setAnomalyFlags] = useState<AnomalyFlag[]>([])

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

        // Load localized range context (Story 43.8 AC #2)
        try {
          const customRanges = (await db.table('referenceRanges').toArray()) as LocalizedRange[]
          const activeCustom = customRanges.filter((r) => !r.effectiveTo)
          // Lab altitude from settings (default 0 = sea level)
          const labSettings = await db.table('labSettings').get('config').catch(() => undefined) as { altitude?: number } | undefined
          const labAltitude = labSettings?.altitude ?? 0

          setRangeContext({
            patientAge: cached?.age ?? 0,
            patientGender: fullPatient?.gender ?? 'unknown',
            labAltitude,
            customRanges: activeCustom,
          })
        } catch {
          // Range tables may not be migrated yet — flagging falls back to template inline ranges
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
        <p className="text-sm text-muted-foreground">{t('loading')}</p>
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
    rangeSnapshots?: Map<string, RangeSnapshot>,
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

    // Attach range snapshots to FHIR observations (Story 43.8 AC #5)
    if (rangeSnapshots) {
      for (const fhirObs of bundle.observations) {
        const fieldCode = fhirObs.code?.text
        if (fieldCode && rangeSnapshots.has(fieldCode)) {
          ;(fhirObs._ultranos as any).referenceRange = rangeSnapshots.get(fieldCode)
        }
      }
    }

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

    // AC 3: Release the sample lock now that the result is entered.
    // Non-fatal — if the lock already expired or was released, we continue normally.
    try {
      const { releaseLock } = await import('@/lib/sample-lock-service')
      await releaseLock(sampleId, session?.practitionerId ?? 'unknown', 'RESULT_ENTERED')
    } catch {
      // Lock may have already expired — not a blocker for result save
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

    // AI Anomaly Detection (Story 53.3) — runs after result is persisted, PHI-free
    const detectedFlags = await runAnomalyDetection(fullObs, loincCode, sample)
    if (detectedFlags.length > 0) {
      setAnomalyFlags(detectedFlags)
      // Don't navigate — let physician review the flags first
    } else {
      router.push(`../${sampleId}`)
    }
  }

  /**
   * Run anomaly detection after result save.
   * PHI guard: passes only numeric field values and LOINC code to the engine.
   * Returns detected flags, or empty array on any error (non-fatal).
   */
  async function runAnomalyDetection(
    observations: LabObservation[],
    templateLoincCode: string,
    specimen: FhirSpecimen,
  ): Promise<AnomalyFlag[]> {
    try {
      // Build PHI-free value map: fieldCode → numeric value
      const currentValues: Record<string, number | null> = {}
      for (const obs of observations) {
        currentValues[obs.fieldCode] = typeof obs.value === 'number' ? obs.value : null
      }

      // Prior result lookup uses patientRef only for Dexie query — NOT passed to engine
      const patientRef = specimen.subject?.reference ?? ''
      const priorValues = patientRef
        ? await getPriorResult(patientRef, templateLoincCode)
        : null

      const flags = detectAnomalies({ currentValues, priorValues, templateLoincCode })

      if (flags.length > 0) {
        // Log to AI Provenance Trail (AC8)
        reportAnomalyDetection({
          sampleId,
          modelVersion: ANOMALY_MODEL_VERSION,
          inputDescription: `${Object.keys(currentValues).length} numeric values, template ${templateLoincCode}`,
          flagCount: flags.length,
          highestSeverity: flags[0]!.severity,
          confidenceScore: flags[0]!.confidence,
          technicianId: session?.practitionerId ?? 'unknown',
        })

        // Enqueue physician notification for urgent flags (Tier 3 sync — operational, LWW)
        for (const flag of flags.filter((f) => f.severity === 'urgent')) {
          await enqueueSyncEvent({
            resourceType: 'Notification',
            resourceId: crypto.randomUUID(),
            payload: {
              type: 'ANOMALY_FLAG',
              priority: 'critical',
              title: 'Statistical Pattern Flag',
              ruleId: flag.ruleId,
              sampleId,
              confidence: flag.confidence,
              disclaimer: flag.disclaimer,
            },
            hlcTimestamp: new Date().toISOString(),
          })
        }
      }

      return flags
    } catch {
      // Anomaly detection is supplementary — never block result entry on error
      return []
    }
  }

  // Show anomaly flags after save — physician must review before proceeding (CLAUDE.md Rule #2)
  if (anomalyFlags.length > 0) {
    return (
      <div className="flex flex-col gap-4 p-4">
        <AnomalyFlagDisplay
          flags={anomalyFlags}
          onAcknowledge={() => router.push(`../${sampleId}`)}
          onEscalate={() => router.push(`../${sampleId}`)}
        />
        <button
          type="button"
          onClick={() => router.push(`../${sampleId}`)}
          className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          {t('continueToDashboard')}
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      <div className="border-b border-border px-4 py-3 dark:border-border">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex items-center gap-1 text-sm text-primary hover:text-primary/80 dark:text-primary"
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
        rangeContext={rangeContext}
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
