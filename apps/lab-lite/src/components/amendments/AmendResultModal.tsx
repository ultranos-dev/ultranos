'use client'

/**
 * Story 43.3 — Task 4: Amendment Result Modal
 *
 * Multi-step wizard for the full amendment workflow:
 *   Step 1: Display original result values (read-only) alongside editable corrected values
 *   Step 2: Mandatory reason code dropdown + free-text explanation (min 10 chars)
 *   Step 3: Supervisor authorization gate
 *   Step 4: Confirmation summary (diff of original vs. amended) before commit
 *
 * RTL support: all layout uses logical CSS properties (AC #8, task 4.8).
 * CLAUDE.md Rule #7: No PHI beyond patient name + age shown in Lab Portal.
 */

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { AmendmentReasonCode } from '@ultranos/shared-types'
import type { LabResultForAuthorization } from '@/types/authorization'
import { initiateAmendment, authorizeAmendment, commitAmendment } from '@/lib/amendment-service'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { SupervisorAuthGate } from './SupervisorAuthGate'
import type { SupervisorAuthResult } from './SupervisorAuthGate'

export interface AmendResultModalProps {
  /** The released/final lab result to amend */
  result: LabResultForAuthorization & { reportId: string }
  /** Called when amendment is successfully committed */
  onSuccess: (amendmentId: string) => void
  /** Called when user cancels */
  onCancel: () => void
}

type Step = 1 | 2 | 3 | 4

// REASON_CODE_LABELS moved into component to use translations

/**
 * AmendResultModal — full amendment workflow wizard.
 *
 * "Amend" button is enabled ONLY when:
 *   - All mandatory fields are filled (reason code, reason text ≥10 chars)
 *   - Supervisor has authorized (step 3 completed)
 * (AC #1, AC #2, task 4.6)
 */
export function AmendResultModal({ result, onSuccess, onCancel }: AmendResultModalProps) {
  const t = useTranslations('amendModal')
  const tAmend = useTranslations('amendments')
  const session = useAuthSessionStore.getState().session

  const REASON_CODE_LABELS: Record<AmendmentReasonCode, string> = {
    [AmendmentReasonCode.CLERICAL_ERROR]: tAmend('reasonCode.CLERICAL_ERROR'),
    [AmendmentReasonCode.INSTRUMENT_MALFUNCTION]: tAmend('reasonCode.INSTRUMENT_MALFUNCTION'),
    [AmendmentReasonCode.WRONG_PATIENT]: tAmend('reasonCode.WRONG_PATIENT'),
    [AmendmentReasonCode.QC_FAILURE_POST_RELEASE]: tAmend('reasonCode.QC_FAILURE_POST_RELEASE'),
    [AmendmentReasonCode.TRANSCRIPTION_ERROR]: tAmend('reasonCode.TRANSCRIPTION_ERROR'),
    [AmendmentReasonCode.OTHER]: tAmend('reasonCode.OTHER'),
  }

  const [step, setStep] = useState<Step>(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Step 1: editable corrected values
  const [correctedConclusion, setCorrectedConclusion] = useState(result.conclusion ?? '')

  // Step 2: mandatory amendment reason fields
  const [reasonCode, setReasonCode] = useState<AmendmentReasonCode | ''>('')
  const [reasonText, setReasonText] = useState('')

  // Step 3: supervisor auth
  const [supervisorAuth, setSupervisorAuth] = useState<SupervisorAuthResult | null>(null)
  const [showSupervisorGate, setShowSupervisorGate] = useState(false)

  // Amendment IDs from initiation
  const [amendmentId, setAmendmentId] = useState<string | null>(null)

  const reasonTextValid = reasonText.trim().length >= 10
  const allMandatoryFilled = reasonCode !== '' && reasonTextValid && supervisorAuth !== null

  // -------------------------------------------------------------------------
  // Step navigation
  // -------------------------------------------------------------------------

  async function handleInitiate() {
    if (!session) return
    setError(null)
    setLoading(true)
    try {
      const res = await initiateAmendment(result.reportId, session.userId)
      setAmendmentId(res.amendmentId)
      setStep(2)
    } catch (err) {
      setError(t('initiateError'))
    } finally {
      setLoading(false)
    }
  }

  function handleSupervisorAuthorized(auth: SupervisorAuthResult) {
    setSupervisorAuth(auth)
    setShowSupervisorGate(false)
    setStep(4)
  }

  async function handleCommit() {
    if (!amendmentId || !supervisorAuth || !reasonCode) return
    setError(null)
    setLoading(true)

    try {
      // Authorize the amendment with supervisor credentials and reason
      await authorizeAmendment(
        {
          amendmentId,
          reasonCode,
          reasonText: reasonText.trim(),
          supervisorId: supervisorAuth.supervisorId,
          amendedValues: { conclusion: correctedConclusion },
        },
        { userId: supervisorAuth.supervisorId, labRole: supervisorAuth.labRole },
      )

      // Commit: logbook, notifications, audit
      await commitAmendment(amendmentId)

      onSuccess(amendmentId)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Amendment commit failed'
      setError(msg.includes('supervisor') ? msg : t('commitError'))
    } finally {
      setLoading(false)
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="amend-modal-title"
        className="fixed inset-0 z-40 flex items-center justify-center bg-black/50"
        data-testid="amend-result-modal"
      >
        <div className="bg-card rounded-lg shadow-xl w-full max-w-2xl mx-4 flex flex-col max-h-[90vh]">
          {/* Header */}
          <div className="px-6 py-4 border-b border-border">
            <h2 id="amend-modal-title" className="text-lg font-semibold text-foreground">
              {t('title', { step })}
            </h2>
            <div className="mt-2 flex gap-2" aria-hidden="true">
              {([1, 2, 3, 4] as Step[]).map((s) => (
                <div
                  key={s}
                  className={`h-1.5 flex-1 rounded-full ${s <= step ? 'bg-primary' : 'bg-muted'}`}
                />
              ))}
            </div>
          </div>

          {/* Body — scrollable */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {/* Step 1: Original vs corrected values */}
            {step === 1 && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  {t('step1Review')}
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h3 className="text-sm font-medium text-foreground mb-2">{t('step1OriginalTitle')}</h3>
                    <div className="bg-muted border border-border rounded-md p-3 text-sm text-foreground min-h-[80px]">
                      <p className="text-xs text-muted-foreground mb-1">{t('step1ConclusionLabel')}</p>
                      <p>{result.conclusion ?? '—'}</p>
                    </div>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-foreground mb-2">{t('step1CorrectedTitle')}</h3>
                    <div className="space-y-2">
                      <label className="block text-xs text-muted-foreground">{t('step1ConclusionLabel')}</label>
                      <textarea
                        value={correctedConclusion}
                        onChange={(e) => setCorrectedConclusion(e.target.value)}
                        rows={4}
                        className="w-full border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        data-testid="corrected-conclusion-input"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Reason code + free-text */}
            {step === 2 && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  {t('step2Review')}
                </p>
                <div>
                  <label htmlFor="reason-code-select" className="block text-sm font-medium text-foreground mb-1">
                    {t('step2ReasonCodeLabel')} <span className="text-red-600" aria-hidden="true">*</span>
                  </label>
                  <select
                    id="reason-code-select"
                    value={reasonCode}
                    onChange={(e) => setReasonCode(e.target.value as AmendmentReasonCode)}
                    className="w-full border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    data-testid="reason-code-select"
                  >
                    <option value="">{t('step2ReasonCodePlaceholder')}</option>
                    {Object.entries(REASON_CODE_LABELS).map(([code, label]) => (
                      <option key={code} value={code}>{label}</option>
                    ))}
                  </select>
                </div>

                {reasonCode === AmendmentReasonCode.WRONG_PATIENT && (
                  <div className="bg-orange-50 border border-orange-200 rounded-md p-3 text-sm text-orange-800" role="alert">
                    {t('step2WrongPatientWarning')}
                  </div>
                )}

                <div>
                  <label htmlFor="reason-text-input" className="block text-sm font-medium text-foreground mb-1">
                    {t('step2ExplanationLabel')} <span className="text-red-600" aria-hidden="true">*</span>
                  </label>
                  <textarea
                    id="reason-text-input"
                    value={reasonText}
                    onChange={(e) => setReasonText(e.target.value)}
                    rows={4}
                    placeholder={t('step2ExplanationPlaceholder')}
                    className="w-full border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    data-testid="reason-text-input"
                  />
                  <p className={`text-xs mt-1 ${reasonText.trim().length < 10 ? 'text-red-500' : 'text-green-600'}`}>
                    {t('step2CharCount', { count: reasonText.trim().length })}
                  </p>
                </div>
              </div>
            )}

            {/* Step 3: Supervisor authorization (handled by SupervisorAuthGate overlay) */}
            {step === 3 && (
              <div className="space-y-4 text-center py-8">
                {supervisorAuth ? (
                  <div className="text-green-600">
                    <p className="text-lg font-medium">{t('step3AuthorizedTitle')}</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {t('step3AuthorizedBy', { supervisorId: supervisorAuth.supervisorId })}
                    </p>
                  </div>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground">
                      {t('step3AuthRequired')}
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowSupervisorGate(true)}
                      className="px-4 py-2 text-sm text-white bg-primary rounded-md hover:bg-primary/90"
                      data-testid="open-supervisor-gate-btn"
                    >
                      {t('step3AuthorizeButton')}
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Step 4: Confirmation diff summary */}
            {step === 4 && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  {t('step4Review')}
                </p>

                <div className="border border-border rounded-md overflow-hidden">
                  <div className="bg-muted px-4 py-2 border-b border-border">
                    <h3 className="text-sm font-medium text-foreground">{t('step4SummaryTitle')}</h3>
                  </div>
                  <div className="p-4 space-y-3 text-sm">
                    <div className="flex gap-2">
                      <span className="font-medium w-32 shrink-0">{t('step4ReasonCodeLabel')}</span>
                      <span>{reasonCode ? REASON_CODE_LABELS[reasonCode as AmendmentReasonCode] : '—'}</span>
                    </div>
                    <div className="flex gap-2">
                      <span className="font-medium w-32 shrink-0">{t('step4ExplanationLabel')}</span>
                      <span className="text-foreground">{reasonText}</span>
                    </div>
                    <div className="flex gap-2">
                      <span className="font-medium w-32 shrink-0">{t('step4AuthorizedByLabel')}</span>
                      <span>{supervisorAuth?.supervisorId ?? '—'}</span>
                    </div>
                    <hr className="border-border" />
                    <div>
                      <p className="font-medium mb-1">{t('step4ConclusionLabel')}</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">{t('step4OriginalLabel')}</p>
                          <p className="bg-red-50 border border-red-200 rounded px-2 py-1 line-through text-red-700">
                            {result.conclusion ?? '—'}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">{t('step4CorrectedLabel')}</p>
                          <p className="bg-green-50 border border-green-200 rounded px-2 py-1 text-green-800">
                            {correctedConclusion || '—'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {error && (
              <p role="alert" className="text-sm text-red-600 mt-4" data-testid="modal-error">
                {error}
              </p>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-border flex justify-between items-center">
            <button
              type="button"
              onClick={step === 1 ? onCancel : () => setStep((s) => Math.max(1, s - 1) as Step)}
              disabled={loading}
              className="px-4 py-2 text-sm text-foreground border border-border rounded-md hover:bg-muted disabled:opacity-50"
              data-testid="modal-back-btn"
            >
              {step === 1 ? t('cancelButton') : t('backButton')}
            </button>

            {step < 4 && (
              <button
                type="button"
                onClick={() => {
                  if (step === 1) handleInitiate()
                  else if (step === 2) setStep(3)
                  else if (step === 3) setShowSupervisorGate(true)
                }}
                disabled={
                  loading ||
                  (step === 2 && (!reasonCode || !reasonTextValid))
                }
                className="px-4 py-2 text-sm text-white bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                data-testid="modal-next-btn"
              >
                {loading ? t('processingButton') : step === 3 ? t('authorizeButton') : t('nextButton')}
              </button>
            )}

            {step === 4 && (
              <button
                type="button"
                onClick={handleCommit}
                disabled={loading || !allMandatoryFilled}
                className="px-4 py-2 text-sm text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
                data-testid="amend-commit-btn"
              >
                {loading ? t('committingButton') : t('commitButton')}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Supervisor Auth Gate overlay */}
      {showSupervisorGate && (
        <SupervisorAuthGate
          onAuthorized={handleSupervisorAuthorized}
          onCancel={() => setShowSupervisorGate(false)}
          currentUserLabRole={session?.labRole ?? undefined}
        />
      )}
    </>
  )
}
