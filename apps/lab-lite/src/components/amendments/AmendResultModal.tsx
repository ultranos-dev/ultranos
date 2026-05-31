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

const REASON_CODE_LABELS: Record<AmendmentReasonCode, string> = {
  [AmendmentReasonCode.CLERICAL_ERROR]: 'Clerical Error',
  [AmendmentReasonCode.INSTRUMENT_MALFUNCTION]: 'Instrument Malfunction',
  [AmendmentReasonCode.WRONG_PATIENT]: 'Wrong Patient',
  [AmendmentReasonCode.QC_FAILURE_POST_RELEASE]: 'QC Failure Discovered Post-Release',
  [AmendmentReasonCode.TRANSCRIPTION_ERROR]: 'Transcription Error',
  [AmendmentReasonCode.OTHER]: 'Other (requires detailed explanation)',
}

/**
 * AmendResultModal — full amendment workflow wizard.
 *
 * "Amend" button is enabled ONLY when:
 *   - All mandatory fields are filled (reason code, reason text ≥10 chars)
 *   - Supervisor has authorized (step 3 completed)
 * (AC #1, AC #2, task 4.6)
 */
export function AmendResultModal({ result, onSuccess, onCancel }: AmendResultModalProps) {
  const session = useAuthSessionStore.getState().session

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
      setError('Failed to initiate amendment. Please try again.')
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
      setError(msg.includes('supervisor') ? msg : 'Failed to commit amendment. Please try again.')
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
        <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 flex flex-col max-h-[90vh]">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 id="amend-modal-title" className="text-lg font-semibold text-gray-900">
              Amend Result — Step {step} of 4
            </h2>
            <div className="mt-2 flex gap-2" aria-hidden="true">
              {([1, 2, 3, 4] as Step[]).map((s) => (
                <div
                  key={s}
                  className={`h-1.5 flex-1 rounded-full ${s <= step ? 'bg-blue-600' : 'bg-gray-200'}`}
                />
              ))}
            </div>
          </div>

          {/* Body — scrollable */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {/* Step 1: Original vs corrected values */}
            {step === 1 && (
              <div className="space-y-4">
                <p className="text-sm text-gray-600">
                  Review the original result. Enter corrected values in the editable fields below.
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 mb-2">Original Values (read-only)</h3>
                    <div className="bg-gray-50 border border-gray-200 rounded-md p-3 text-sm text-gray-700 min-h-[80px]">
                      <p className="text-xs text-gray-500 mb-1">Conclusion:</p>
                      <p>{result.conclusion ?? '—'}</p>
                    </div>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 mb-2">Corrected Values</h3>
                    <div className="space-y-2">
                      <label className="block text-xs text-gray-500">Conclusion:</label>
                      <textarea
                        value={correctedConclusion}
                        onChange={(e) => setCorrectedConclusion(e.target.value)}
                        rows={4}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                <p className="text-sm text-gray-600">
                  Select a reason code and provide a detailed explanation for the amendment.
                </p>
                <div>
                  <label htmlFor="reason-code-select" className="block text-sm font-medium text-gray-700 mb-1">
                    Reason Code <span className="text-red-600" aria-hidden="true">*</span>
                  </label>
                  <select
                    id="reason-code-select"
                    value={reasonCode}
                    onChange={(e) => setReasonCode(e.target.value as AmendmentReasonCode)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    data-testid="reason-code-select"
                  >
                    <option value="">Select a reason…</option>
                    {Object.entries(REASON_CODE_LABELS).map(([code, label]) => (
                      <option key={code} value={code}>{label}</option>
                    ))}
                  </select>
                </div>

                {reasonCode === AmendmentReasonCode.WRONG_PATIENT && (
                  <div className="bg-orange-50 border border-orange-200 rounded-md p-3 text-sm text-orange-800" role="alert">
                    <strong>Warning:</strong> "Wrong Patient" will mark the original report as{' '}
                    <code>entered-in-error</code> per FHIR semantics. Ensure the correct patient is
                    identified before proceeding.
                  </div>
                )}

                <div>
                  <label htmlFor="reason-text-input" className="block text-sm font-medium text-gray-700 mb-1">
                    Detailed Explanation <span className="text-red-600" aria-hidden="true">*</span>
                  </label>
                  <textarea
                    id="reason-text-input"
                    value={reasonText}
                    onChange={(e) => setReasonText(e.target.value)}
                    rows={4}
                    placeholder="Provide a detailed explanation (minimum 10 characters)…"
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    data-testid="reason-text-input"
                  />
                  <p className={`text-xs mt-1 ${reasonText.trim().length < 10 ? 'text-red-500' : 'text-green-600'}`}>
                    {reasonText.trim().length}/10 characters minimum
                  </p>
                </div>
              </div>
            )}

            {/* Step 3: Supervisor authorization (handled by SupervisorAuthGate overlay) */}
            {step === 3 && (
              <div className="space-y-4 text-center py-8">
                {supervisorAuth ? (
                  <div className="text-green-600">
                    <p className="text-lg font-medium">✓ Supervisor Authorized</p>
                    <p className="text-sm text-gray-600 mt-1">
                      Authorized by: {supervisorAuth.supervisorId}
                    </p>
                  </div>
                ) : (
                  <>
                    <p className="text-sm text-gray-600">
                      Supervisor authorization is required before the amendment can be committed.
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowSupervisorGate(true)}
                      className="px-4 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700"
                      data-testid="open-supervisor-gate-btn"
                    >
                      Authorize with Supervisor
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Step 4: Confirmation diff summary */}
            {step === 4 && (
              <div className="space-y-4">
                <p className="text-sm text-gray-600">
                  Review all changes before committing. This action cannot be undone without creating
                  another amendment.
                </p>

                <div className="border border-gray-200 rounded-md overflow-hidden">
                  <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                    <h3 className="text-sm font-medium text-gray-700">Amendment Summary</h3>
                  </div>
                  <div className="p-4 space-y-3 text-sm">
                    <div className="flex gap-2">
                      <span className="font-medium w-32 shrink-0">Reason Code:</span>
                      <span>{reasonCode ? REASON_CODE_LABELS[reasonCode as AmendmentReasonCode] : '—'}</span>
                    </div>
                    <div className="flex gap-2">
                      <span className="font-medium w-32 shrink-0">Explanation:</span>
                      <span className="text-gray-700">{reasonText}</span>
                    </div>
                    <div className="flex gap-2">
                      <span className="font-medium w-32 shrink-0">Authorized by:</span>
                      <span>{supervisorAuth?.supervisorId ?? '—'}</span>
                    </div>
                    <hr className="border-gray-200" />
                    <div>
                      <p className="font-medium mb-1">Conclusion:</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <p className="text-xs text-gray-500 mb-1">Original:</p>
                          <p className="bg-red-50 border border-red-200 rounded px-2 py-1 line-through text-red-700">
                            {result.conclusion ?? '—'}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 mb-1">Corrected:</p>
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
          <div className="px-6 py-4 border-t border-gray-200 flex justify-between items-center">
            <button
              type="button"
              onClick={step === 1 ? onCancel : () => setStep((s) => Math.max(1, s - 1) as Step)}
              disabled={loading}
              className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
              data-testid="modal-back-btn"
            >
              {step === 1 ? 'Cancel' : 'Back'}
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
                className="px-4 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                data-testid="modal-next-btn"
              >
                {loading ? 'Processing…' : step === 3 ? 'Authorize' : 'Next'}
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
                {loading ? 'Committing…' : 'Commit Amendment'}
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
