'use client'

/**
 * Story 53.4 — Tele-Consultation Request Builder UI
 *
 * Multi-step form for building a structured consultation request.
 * AI assists with communication formatting only — NEVER clinical interpretation.
 *
 * CLAUDE.md Safety Rules applied:
 * - Rule #2: AI-formatted text requires tech review + confirmation before submission.
 * - Rule #7: Only first name + age shown for patient verification — no full demographics.
 *
 * RTL: All layout uses logical CSS properties (ms/me instead of ml/mr).
 * i18n: All labels via useTranslations('consultation').
 */

import { useState, useCallback, useRef, useMemo, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import type {
  ConsultationRequest,
  ResultSummaryData,
  PhotoAttachment,
} from '@/lib/consultation'
import { createDraftRequest } from '@/lib/consultation'
import type { ConsultationRecipient } from '@/lib/consultation-recipients'
import type { FormatterOutput } from '@/lib/consultation-ai-formatter'
import { formatConsultationRequest, formatOffline } from '@/lib/consultation-ai-formatter'
import { ConfidenceLevel } from '@/lib/confidence'
import { getDb } from '@/lib/db'
import { reportConsultationEvent } from '@/lib/audit-client'
import { AiOutputWrapper } from '@/components/ai/AiOutputWrapper'

// Max photos and size
const MAX_PHOTOS = 5
const MAX_PHOTO_BYTES = 2 * 1024 * 1024 // 2 MB

type Step =
  | 'result-summary'
  | 'observations'
  | 'photos'
  | 'knowledge-card'
  | 'recipient'
  | 'ai-preview'
  | 'submitted'

interface ConsultationRequestBuilderProps {
  /** The lab result summary to base the consultation on. */
  resultSummary: ResultSummaryData
  /** Sample ID for provenance/audit logging. */
  sampleId: string
  /** Available recipients (pre-fetched from cache). */
  recipients: ConsultationRecipient[]
  /** Knowledge card ID if one was triggered (Story 53.1). */
  knowledgeCardId?: string | null
  /** Called when the consultation is saved to Dexie and queued for sync. */
  onSubmitted?: (consultationId: string) => void
  /** Called when the tech cancels the builder. */
  onCancel?: () => void
}

// ─── Photo compression helper ──────────────────────────────────────────────────

async function compressPhoto(file: File): Promise<PhotoAttachment | null> {
  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)

    img.onload = () => {
      const canvas = document.createElement('canvas')
      // Scale down if needed to stay under 2MB (estimate ~1600x1200 is safe)
      const maxDim = 1200
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      const ctx = canvas.getContext('2d')
      if (!ctx) { resolve(null); return }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(url)
          if (!blob) { resolve(null); return }
          if (blob.size > MAX_PHOTO_BYTES) { resolve(null); return }
          const reader = new FileReader()
          reader.onloadend = () => {
            if (typeof reader.result !== 'string') { resolve(null); return }
            resolve({
              id: crypto.randomUUID(),
              data: reader.result.split(',')[1] ?? '',
              mimeType: 'image/jpeg',
              caption: '',
              capturedAt: new Date().toISOString(),
            })
          }
          reader.readAsDataURL(blob)
        },
        'image/jpeg',
        0.85,
      )
    }

    img.onerror = () => { URL.revokeObjectURL(url); resolve(null) }
    img.src = url
  })
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function ConsultationRequestBuilder({
  resultSummary,
  sampleId,
  recipients,
  knowledgeCardId,
  onSubmitted,
  onCancel,
}: ConsultationRequestBuilderProps) {
  const t = useTranslations('consultation')

  const [step, setStep] = useState<Step>('result-summary')
  const [observations, setObservations] = useState('')
  const [photos, setPhotos] = useState<PhotoAttachment[]>([])
  const [includeKnowledgeCard, setIncludeKnowledgeCard] = useState(true)
  const [selectedRecipient, setSelectedRecipient] = useState<ConsultationRecipient | null>(null)
  const [aiOutput, setAiOutput] = useState<FormatterOutput | null>(null)
  const [editedText, setEditedText] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [isFormatting, setIsFormatting] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const mountedRef = useRef(true)
  useEffect(() => {
    return () => { mountedRef.current = false }
  }, [])

  // Suggestion chips for observations step — use offline formatter to provide suggestions
  // before the full AI formatting step runs (which only executes at recipient step).
  const offlineSuggestions = useMemo(() => {
    const result = formatOffline({
      resultSummary,
      observationsText: '',
      templateType: resultSummary.templateName,
    })
    return result.suggestedObservations
  }, [resultSummary])

  // Group recipients by type
  const pathologists = recipients.filter((r) => r.type === 'pathologist')
  const referenceLabs = recipients.filter((r) => r.type === 'reference_lab')

  // ─── Photo handlers ──────────────────────────────────────────────────────────

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    const remaining = MAX_PHOTOS - photos.length
    const toProcess = files.slice(0, remaining)

    const compressed = await Promise.all(toProcess.map(compressPhoto))
    if (!mountedRef.current) return
    const valid = compressed.filter((p): p is PhotoAttachment => p !== null)

    const dropped = toProcess.length - valid.length
    if (dropped > 0) {
      setSubmitError(t('photosDroppedTooLarge', { count: dropped }))
    }

    setPhotos((prev) => [...prev, ...valid].slice(0, MAX_PHOTOS))
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [photos.length])

  const removePhoto = useCallback((photoId: string) => {
    setPhotos((prev) => prev.filter((p) => p.id !== photoId))
  }, [])

  const updatePhotoCaption = useCallback((photoId: string, caption: string) => {
    setPhotos((prev) => prev.map((p) => p.id === photoId ? { ...p, caption } : p))
  }, [])

  // ─── Step: AI formatting ─────────────────────────────────────────────────────

  const handleRequestFormatting = useCallback(async () => {
    if (!selectedRecipient) return
    setConfirmed(false)
    setIsFormatting(true)
    setSubmitError(null)

    try {
      const output = await formatConsultationRequest(
        {
          resultSummary,
          observationsText: observations,
          templateType: resultSummary.templateName,
        },
        sampleId,
      )
      setAiOutput(output)
      setEditedText(output.formattedText)
      setStep('ai-preview')
    } catch {
      setSubmitError(t('formattingError'))
    } finally {
      setIsFormatting(false)
    }
  }, [selectedRecipient, resultSummary, observations, sampleId])

  // ─── Final submission ────────────────────────────────────────────────────────

  const handleSubmit = useCallback(async () => {
    if (!selectedRecipient || !confirmed || isSubmitting) return
    setIsSubmitting(true)

    const draft = createDraftRequest({
      sampleId,
      resultSummary,
      recipientType: selectedRecipient.type,
      recipientId: selectedRecipient.id,
      knowledgeCardId: knowledgeCardId && includeKnowledgeCard ? knowledgeCardId : null,
    })

    const submitted: ConsultationRequest = {
      ...draft,
      observationsText: observations,
      aiFormattedText: aiOutput?.formattedText ?? null,
      finalText: editedText,
      photoAttachments: photos,
      status: 'submitted',
    }

    try {
      const db = getDb()
      await db.consultation_requests.add(submitted)

      reportConsultationEvent({
        action: 'CONSULTATION_CREATED',
        consultationId: submitted.id,
        recipientType: submitted.recipientType,
        status: 'submitted',
      })

      setStep('submitted')
      onSubmitted?.(submitted.id)
    } catch {
      setSubmitError(t('submitError'))
    } finally {
      setIsSubmitting(false)
    }
  }, [
    selectedRecipient, confirmed, isSubmitting, sampleId, resultSummary, knowledgeCardId,
    includeKnowledgeCard, observations, aiOutput, editedText, photos, t, onSubmitted,
  ])

  // ─── Render steps ─────────────────────────────────────────────────────────────

  if (step === 'submitted') {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-6 text-center">
        <p className="text-lg font-semibold text-green-800">{t('submittedTitle')}</p>
        <p className="mt-2 text-sm text-green-700">{t('submittedMessage')}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Step indicator */}
      <StepIndicator step={step} knowledgeCardId={knowledgeCardId ?? null} t={t} />

      {/* Step 1: Result Summary (read-only) */}
      {step === 'result-summary' && (
        <div className="flex flex-col gap-4">
          <h2 className="text-base font-semibold">{t('resultSummaryTitle')}</h2>
          <ResultSummaryView resultSummary={resultSummary} t={t} />
          <button
            className="self-end rounded-lg bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-primary/90"
            onClick={() => setStep('observations')}
          >
            {t('next')}
          </button>
        </div>
      )}

      {/* Step 2: Observations */}
      {step === 'observations' && (
        <div className="flex flex-col gap-4">
          <h2 className="text-base font-semibold">{t('observationsTitle')}</h2>
          <p className="text-sm text-muted-foreground">{t('observationsHint')}</p>

          <textarea
            className="min-h-[120px] w-full rounded-lg border border-border p-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder={t('observationsPlaceholder')}
            value={observations}
            onChange={(e) => setObservations(e.target.value)}
            dir="auto"
          />

          {/* Suggestion chips (from Story 53.1 integration) */}
          {offlineSuggestions.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <span className="text-xs text-muted-foreground">{t('considerMentioning')}</span>
              {offlineSuggestions.map((s) => (
                <button
                  key={s}
                  className="rounded-full border border-primary bg-primary/10 px-3 py-1 text-xs text-primary hover:bg-primary/10"
                  onClick={() => setObservations((prev) => prev ? `${prev}\n${s}` : s)}
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          <div className="flex gap-3 self-end">
            <button
              className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted"
              onClick={() => setStep('result-summary')}
            >
              {t('back')}
            </button>
            <button
              className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-primary/90"
              onClick={() => setStep('photos')}
            >
              {t('next')}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Photo Attachments */}
      {step === 'photos' && (
        <div className="flex flex-col gap-4">
          <h2 className="text-base font-semibold">{t('photosTitle')}</h2>
          <p className="text-sm text-muted-foreground">{t('photosHint', { max: MAX_PHOTOS })}</p>

          {/* Photo grid */}
          {photos.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {photos.map((photo) => (
                <div key={photo.id} className="flex flex-col gap-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`data:${photo.mimeType};base64,${photo.data}`}
                    alt={photo.caption || t('photoAlt')}
                    className="h-24 w-full rounded-lg object-cover"
                  />
                  <input
                    className="rounded border border-border px-2 py-1 text-xs"
                    placeholder={t('captionPlaceholder')}
                    value={photo.caption}
                    onChange={(e) => updatePhotoCaption(photo.id, e.target.value)}
                  />
                  <button
                    className="text-xs text-red-600 hover:underline"
                    onClick={() => removePhoto(photo.id)}
                  >
                    {t('removePhoto')}
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Upload / camera button */}
          {photos.length < MAX_PHOTOS && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                capture="environment"
                className="hidden"
                onChange={handleFileSelect}
              />
              <button
                className="flex items-center gap-2 self-start rounded-lg border border-dashed border-gray-400 px-4 py-2 text-sm text-muted-foreground hover:bg-muted"
                onClick={() => fileInputRef.current?.click()}
              >
                {t('addPhoto')}
              </button>
            </>
          )}

          <div className="flex gap-3 self-end">
            <button
              className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted"
              onClick={() => setStep('observations')}
            >
              {t('back')}
            </button>
            <button
              className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-primary/90"
              onClick={() => setStep(knowledgeCardId ? 'knowledge-card' : 'recipient')}
            >
              {t('next')}
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Knowledge Card (conditional) */}
      {step === 'knowledge-card' && knowledgeCardId && (
        <div className="flex flex-col gap-4">
          <h2 className="text-base font-semibold">{t('knowledgeCardTitle')}</h2>
          <p className="text-sm text-muted-foreground">{t('knowledgeCardHint')}</p>
          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={includeKnowledgeCard}
              onChange={(e) => setIncludeKnowledgeCard(e.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            <span className="text-sm">{t('includeKnowledgeCard')}</span>
          </label>

          <div className="flex gap-3 self-end">
            <button
              className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted"
              onClick={() => setStep('photos')}
            >
              {t('back')}
            </button>
            <button
              className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-primary/90"
              onClick={() => setStep('recipient')}
            >
              {t('next')}
            </button>
          </div>
        </div>
      )}

      {/* Step 5: Recipient Selection */}
      {step === 'recipient' && (
        <div className="flex flex-col gap-4">
          <h2 className="text-base font-semibold">{t('recipientTitle')}</h2>

          {recipients.length === 0 ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {t('noRecipientsAvailable')}
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {pathologists.length > 0 && (
                <>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {t('pathologists')}
                  </p>
                  {pathologists.map((r) => (
                    <RecipientOption
                      key={r.id}
                      recipient={r}
                      selected={selectedRecipient?.id === r.id}
                      onSelect={() => setSelectedRecipient(r)}
                      t={t}
                    />
                  ))}
                </>
              )}
              {referenceLabs.length > 0 && (
                <>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {t('referenceLabs')}
                  </p>
                  {referenceLabs.map((r) => (
                    <RecipientOption
                      key={r.id}
                      recipient={r}
                      selected={selectedRecipient?.id === r.id}
                      onSelect={() => setSelectedRecipient(r)}
                      t={t}
                    />
                  ))}
                </>
              )}
            </div>
          )}

          <div className="flex gap-3 self-end">
            <button
              className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted"
              onClick={() => setStep(knowledgeCardId ? 'knowledge-card' : 'photos')}
            >
              {t('back')}
            </button>
            <button
              className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!selectedRecipient || isFormatting}
              onClick={handleRequestFormatting}
            >
              {isFormatting ? t('formatting') : t('requestAiFormatting')}
            </button>
          </div>
        </div>
      )}

      {/* Step 6: AI Formatting Preview */}
      {step === 'ai-preview' && aiOutput && (
        <div className="flex flex-col gap-4">
          <h2 className="text-base font-semibold">{t('aiPreviewTitle')}</h2>

          {/* Confidence inversion warning (Story 53.5) */}
          <p className="text-sm text-muted-foreground">{t('aiPreviewHint')}</p>

          {/* Side-by-side: AI suggestion vs tech edit */}
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">{t('aiSuggestion')}</p>
              <AiOutputWrapper confidence={aiOutput.confidence} context="consultation-formatter">
                <pre className="rounded-lg bg-muted p-3 text-sm whitespace-pre-wrap border border-border">
                  {aiOutput.formattedText}
                </pre>
              </AiOutputWrapper>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">{t('yourVersion')}</p>
              <textarea
                className="min-h-[200px] w-full rounded-lg border border-border p-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={editedText}
                onChange={(e) => setEditedText(e.target.value)}
                dir="auto"
              />
            </div>
          </div>

          {/* Mandatory confirmation checkbox — CLAUDE.md Rule #2 */}
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-primary bg-primary/10 p-4">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-border"
            />
            <span className="text-sm font-medium text-primary">{t('confirmationLabel')}</span>
          </label>

          {submitError && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {submitError}
            </p>
          )}

          <div className="flex gap-3 self-end">
            <button
              className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted"
              onClick={() => setStep('recipient')}
            >
              {t('back')}
            </button>
            <button
              className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!confirmed || editedText.trim() === '' || isSubmitting}
              onClick={handleSubmit}
            >
              {t('submit')}
            </button>
          </div>
        </div>
      )}

      {/* Cancel button at bottom */}
      {step !== 'submitted' && (
        <button
          className="self-center text-sm text-muted-foreground hover:underline"
          onClick={onCancel}
        >
          {t('cancel')}
        </button>
      )}
    </div>
  )
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function ResultSummaryView({
  resultSummary,
  t,
}: {
  resultSummary: ResultSummaryData
  t: ReturnType<typeof useTranslations<'consultation'>>
}) {
  return (
    <div className="rounded-lg border border-border bg-muted p-4">
      <p className="mb-3 text-sm font-semibold text-foreground">
        {resultSummary.templateName}{' '}
        <span className="font-normal text-muted-foreground">({resultSummary.templateLoincCode})</span>
      </p>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-xs text-muted-foreground">
            <th className="pb-1 text-start">{t('fieldName')}</th>
            <th className="pb-1 text-end">{t('fieldValue')}</th>
            <th className="pb-1 text-end">{t('fieldUnit')}</th>
            <th className="pb-1 text-end">{t('fieldFlag')}</th>
          </tr>
        </thead>
        <tbody>
          {resultSummary.fields.map((field, i) => (
            <tr
              key={i}
              className={field.flag ? 'font-medium' : ''}
            >
              <td className="py-1">{field.name}</td>
              <td className="py-1 text-end">{field.value ?? '—'}</td>
              <td className="py-1 text-end text-muted-foreground">{field.unit}</td>
              <td className="py-1 text-end">
                {field.flag && (
                  <span
                    className={`rounded px-1.5 py-0.5 text-xs font-bold ${
                      field.flag === 'LL' || field.flag === 'HH'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    {field.flag}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function RecipientOption({
  recipient,
  selected,
  onSelect,
  t,
}: {
  recipient: ConsultationRecipient
  selected: boolean
  onSelect: () => void
  t: ReturnType<typeof useTranslations<'consultation'>>
}) {
  return (
    <button
      onClick={onSelect}
      className={`flex w-full items-start gap-3 rounded-lg border p-3 text-start transition-colors ${
        selected
          ? 'border-primary bg-primary/10'
          : 'border-border hover:border-border hover:bg-muted'
      } ${!recipient.isAvailable ? 'opacity-50' : ''}`}
      disabled={!recipient.isAvailable}
    >
      <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 border-current mt-0.5">
        {selected && <div className="h-2 w-2 rounded-full bg-primary" />}
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium">{recipient.name}</span>
        <span className="text-xs text-muted-foreground">{recipient.specialization}</span>
        {!recipient.isAvailable && (
          <span className="text-xs text-amber-600">{t('recipientUnavailable')}</span>
        )}
      </div>
    </button>
  )
}

const STEP_ORDER: Step[] = [
  'result-summary',
  'observations',
  'photos',
  'knowledge-card',
  'recipient',
  'ai-preview',
]

function StepIndicator({
  step,
  knowledgeCardId,
  t,
}: {
  step: Step
  knowledgeCardId: string | null
  t: ReturnType<typeof useTranslations<'consultation'>>
}) {
  const effectiveSteps = knowledgeCardId
    ? STEP_ORDER
    : STEP_ORDER.filter((s) => s !== 'knowledge-card')
  const currentIdx = effectiveSteps.indexOf(step)
  const totalSteps = effectiveSteps.length

  if (step === 'submitted') return null

  return (
    <div className="flex items-center gap-1 text-xs text-muted-foreground">
      <span>
        {t('stepOf', { current: currentIdx + 1, total: totalSteps })}
      </span>
      <div className="ms-2 flex gap-1">
        {effectiveSteps.map((s, i) => (
          <div
            key={s}
            className={`h-1.5 w-6 rounded-full ${
              i <= currentIdx ? 'bg-primary' : 'bg-muted'
            }`}
          />
        ))}
      </div>
    </div>
  )
}
