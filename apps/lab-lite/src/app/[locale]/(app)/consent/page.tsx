'use client'

import { useCallback, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { AudioRecorder } from '@/components/consent/AudioRecorder'
import { ThumbprintCapture } from '@/components/consent/ThumbprintCapture'
import { ConsentAudioPlayer } from '@/components/consent/ConsentAudioPlayer'
import { addConsentRecord, type ConsentMethod, type ConsentLanguage } from '@/lib/db'
import { Check } from '@ultranos/ui-kit/icons'
import { CURRENT_CONSENT_VERSION } from '@/lib/consent-versions'
import { hlc, serializeHlc } from '@/lib/hlc'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { reportConsentAuditEvent } from '@/lib/audit-client'

type Step = 'patient' | 'listen' | 'capture' | 'review'

const STEPS: Step[] = ['patient', 'listen', 'capture', 'review']

function StepIndicatorBar({ currentStep }: { currentStep: Step }) {
  const t = useTranslations('consent')
  const labels: Record<Step, string> = {
    patient: t('steps.selectPatient'),
    listen: t('steps.listenExplanation'),
    capture: t('steps.captureConsent'),
    review: t('steps.reviewConfirm'),
  }
  const currentIndex = STEPS.indexOf(currentStep)

  return (
    <div className="flex items-center gap-2">
      {STEPS.map((step, i) => (
        <div key={step} className="flex items-center gap-2">
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${
              i <= currentIndex
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
            }`}
          >
            {i + 1}
          </div>
          <span className={`hidden text-sm sm:inline ${i <= currentIndex ? 'font-medium' : 'text-gray-400'}`}>
            {labels[step]}
          </span>
          {i < STEPS.length - 1 && (
            <div className={`h-0.5 w-6 ${i < currentIndex ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'}`} />
          )}
        </div>
      ))}
    </div>
  )
}

export default function ConsentPage() {
  const t = useTranslations('consent')
  const locale = useLocale() as ConsentLanguage
  const router = useRouter()
  const searchParams = useSearchParams()
  const session = useAuthSessionStore((s) => s.session)

  const encounterId = searchParams.get('encounterId') ?? searchParams.get('orderId') ?? undefined

  const [step, setStep] = useState<Step>('patient')
  const [patientRef, setPatientRef] = useState('')
  const [patientName, setPatientName] = useState('')
  const [playbackDone, setPlaybackDone] = useState(false)
  const [captureMethod, setCaptureMethod] = useState<ConsentMethod>('audio')
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [thumbprintBlob, setThumbprintBlob] = useState<Blob | null>(null)
  const [witnessConfirmed, setWitnessConfirmed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)

  const handlePatientSelect = useCallback((ref: string, name: string) => {
    setPatientRef(ref)
    setPatientName(name)
    setStep('listen')
  }, [])

  const handlePlaybackComplete = useCallback(() => {
    setPlaybackDone(true)
  }, [])

  const canProceedToCapture = playbackDone
  const canProceedToReview =
    (captureMethod === 'audio' && audioBlob !== null) ||
    (captureMethod === 'thumbprint' && thumbprintBlob !== null) ||
    (captureMethod === 'both' && audioBlob !== null && thumbprintBlob !== null)

  const handleSubmit = useCallback(async () => {
    if (!session || !witnessConfirmed) return
    setSubmitting(true)

    try {
      const record = {
        patientRef,
        encounterId,
        method: captureMethod,
        language: locale,
        consentTextVersion: CURRENT_CONSENT_VERSION,
        audioBlob: audioBlob ?? undefined,
        thumbprintBlob: thumbprintBlob ?? undefined,
        witnessingTechId: session.userId,
        capturedAt: new Date().toISOString(),
        hlcTimestamp: serializeHlc(hlc.now()),
        status: 'active' as const,
        syncStatus: 'pending' as const,
      }

      const id = await addConsentRecord(record)

      reportConsentAuditEvent({
        action: 'CONSENT_GRANT',
        consentRecordId: id,
        patientRef,
        method: captureMethod,
        language: locale,
        consentTextVersion: CURRENT_CONSENT_VERSION,
        technicianId: session.userId,
      })

      setSuccess(true)

      // Redirect after short delay
      setTimeout(() => {
        if (encounterId) {
          router.push(`/orders`)
        } else {
          router.push('/')
        }
      }, 1500)
    } finally {
      setSubmitting(false)
    }
  }, [session, witnessConfirmed, patientRef, encounterId, captureMethod, locale, audioBlob, thumbprintBlob, router])

  if (success) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
            <Check size={32} className="text-green-600 dark:text-green-400" />
          </div>
          <p className="text-lg font-medium">{t('review.success')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-xl font-semibold">{t('title')}</h1>
      <StepIndicatorBar currentStep={step} />

      <div className="mt-8">
        {/* Step 1: Select Patient */}
        {step === 'patient' && (
          <div className="space-y-4">
            <h2 className="text-lg font-medium">{t('steps.selectPatient')}</h2>
            <div className="space-y-3">
              <label className="block text-sm font-medium">
                {t('review.patient')}
                <input
                  type="text"
                  value={patientRef}
                  onChange={(e) => setPatientRef(e.target.value)}
                  placeholder="Patient/<uuid>"
                  className="mt-1 block w-full rounded-md border px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800"
                />
              </label>
              <label className="block text-sm font-medium">
                {t('review.patient')} Name
                <input
                  type="text"
                  value={patientName}
                  onChange={(e) => setPatientName(e.target.value)}
                  placeholder="First name"
                  className="mt-1 block w-full rounded-md border px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800"
                />
              </label>
              <button
                type="button"
                onClick={() => handlePatientSelect(patientRef, patientName)}
                disabled={!patientRef}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {t('common.next', { ns: 'common' })}
                Next
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Listen to Explanation */}
        {step === 'listen' && (
          <div className="space-y-4">
            <h2 className="text-lg font-medium">{t('steps.listenExplanation')}</h2>
            <div className="rounded-lg border bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
              <h3 className="mb-2 font-medium">{t('labCollection.title')}</h3>
              <p className="mb-3 text-sm">{t('labCollection.bodyText')}</p>
              <p className="text-sm font-medium text-red-600 dark:text-red-400">{t('labCollection.rightToRefuse')}</p>
              <p className="mt-2 text-xs text-gray-400">{t('labCollection.version', { version: CURRENT_CONSENT_VERSION })}</p>
            </div>

            <ConsentAudioPlayer
              locale={locale}
              onPlaybackComplete={handlePlaybackComplete}
            />

            <button
              type="button"
              onClick={() => setStep('capture')}
              disabled={!canProceedToCapture}
              className="mt-4 rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        )}

        {/* Step 3: Capture Consent */}
        {step === 'capture' && (
          <div className="space-y-6">
            <h2 className="text-lg font-medium">{t('steps.captureConsent')}</h2>

            {/* Method selector */}
            <div className="flex gap-2">
              {(['audio', 'thumbprint', 'both'] as ConsentMethod[]).map((method) => (
                <button
                  key={method}
                  type="button"
                  onClick={() => setCaptureMethod(method)}
                  className={`rounded-md border px-4 py-2 text-sm ${
                    captureMethod === method
                      ? 'border-blue-600 bg-blue-50 font-medium text-blue-700 dark:bg-blue-900/20 dark:text-blue-300'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                >
                  {t(`method.${method}`)}
                </button>
              ))}
            </div>

            {/* Audio recorder */}
            {(captureMethod === 'audio' || captureMethod === 'both') && (
              <div className="rounded-lg border p-4 dark:border-gray-700">
                <h3 className="mb-4 text-sm font-medium">{t('method.audio')}</h3>
                <AudioRecorder onRecordingComplete={setAudioBlob} />
              </div>
            )}

            {/* Thumbprint capture */}
            {(captureMethod === 'thumbprint' || captureMethod === 'both') && (
              <div className="rounded-lg border p-4 dark:border-gray-700">
                <h3 className="mb-4 text-sm font-medium">{t('method.thumbprint')}</h3>
                <ThumbprintCapture onCaptureComplete={setThumbprintBlob} />
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStep('listen')}
                className="rounded-md border px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => setStep('review')}
                disabled={!canProceedToReview}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Review & Confirm */}
        {step === 'review' && (
          <div className="space-y-4">
            <h2 className="text-lg font-medium">{t('review.summary')}</h2>

            <dl className="space-y-2 rounded-lg border p-4 dark:border-gray-700">
              <div className="flex justify-between">
                <dt className="text-sm text-gray-500 dark:text-gray-400">{t('review.patient')}</dt>
                <dd className="text-sm font-medium">{patientName || patientRef}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-gray-500 dark:text-gray-400">{t('review.method')}</dt>
                <dd className="text-sm font-medium">{t(`method.${captureMethod}`)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-gray-500 dark:text-gray-400">{t('review.language')}</dt>
                <dd className="text-sm font-medium">{locale.toUpperCase()}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-gray-500 dark:text-gray-400">{t('review.consentVersion')}</dt>
                <dd className="text-sm font-medium">{CURRENT_CONSENT_VERSION}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-gray-500 dark:text-gray-400">{t('review.witness')}</dt>
                <dd className="text-sm font-medium">{session?.email ?? 'N/A'}</dd>
              </div>
            </dl>

            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={witnessConfirmed}
                onChange={(e) => setWitnessConfirmed(e.target.checked)}
                className="mt-1"
              />
              <span className="text-sm">{t('review.confirmWitness')}</span>
            </label>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStep('capture')}
                className="rounded-md border px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!witnessConfirmed || submitting}
                className="rounded-md bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700 disabled:opacity-50"
              >
                {submitting ? t('review.submitting') : t('review.submit')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
