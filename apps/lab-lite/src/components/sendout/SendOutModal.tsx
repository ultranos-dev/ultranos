'use client'

import { useState, useEffect } from 'react'
import { X, Send, ExternalLink } from '@ultranos/ui-kit/icons'
import { getLabsForTest } from '@/lib/reference-lab-config'
import { initiateSendOut } from '@/lib/sendout-service'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import type { ReferenceLab, CreateSendOutInput } from '@/types/reference-lab'

interface SendOutModalProps {
  sampleId: string
  loincCode: string
  loincDisplay: string
  sampleType: string
  onClose: () => void
  onSuccess: (sendOutId: string) => void
}

export function SendOutModal({
  sampleId,
  loincCode,
  loincDisplay,
  sampleType,
  onClose,
  onSuccess,
}: SendOutModalProps) {
  const session = useAuthSessionStore((s) => s.session)
  const [labs, setLabs] = useState<ReferenceLab[]>([])
  const [selectedLabId, setSelectedLabId] = useState('')
  const [clinicalContext, setClinicalContext] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showPreview, setShowPreview] = useState(false)

  useEffect(() => {
    getLabsForTest(loincCode).then(setLabs).catch(() => setLabs([]))
  }, [loincCode])

  const selectedLab = labs.find((l) => l.id === selectedLabId)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedLabId || !session?.userId) return
    setLoading(true)
    setError(null)
    try {
      const input: CreateSendOutInput = {
        sampleId,
        referenceLabId: selectedLabId,
        testRequested: { loincCode, loincDisplay },
        clinicalContext,
      }
      const sendOut = await initiateSendOut(input, session.userId)
      onSuccess(sendOut.id)
    } catch {
      setError('Failed to create send-out. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="sendout-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="w-full max-w-lg rounded-lg bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-4">
          <h2 id="sendout-modal-title" className="text-base font-semibold text-neutral-900">
            Send to Reference Lab
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          {/* Test info (read-only) */}
          <div className="rounded-md bg-neutral-50 p-3 text-sm">
            <p className="text-neutral-500">Test Requested</p>
            <p className="font-medium text-neutral-900">{loincDisplay}</p>
            <p className="text-xs text-neutral-400">{loincCode} · {sampleType}</p>
          </div>

          {/* Reference Lab selector */}
          <div>
            <label htmlFor="reflab-select" className="block text-sm font-medium text-neutral-700 mb-1">
              Reference Lab <span aria-hidden="true" className="text-red-500">*</span>
            </label>
            {labs.length === 0 ? (
              <p className="text-sm text-amber-600">
                No reference labs configured for this test. Contact your lab manager.
              </p>
            ) : (
              <select
                id="reflab-select"
                value={selectedLabId}
                onChange={(e) => setSelectedLabId(e.target.value)}
                required
                className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">Select a reference lab…</option>
                {labs.map((lab) => (
                  <option key={lab.id} value={lab.id}>
                    {lab.name} — Avg TAT: {lab.averageTATDays[loincCode] ?? '?'} days
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Clinical context */}
          <div>
            <label htmlFor="clinical-context" className="block text-sm font-medium text-neutral-700 mb-1">
              Clinical Context
            </label>
            <textarea
              id="clinical-context"
              value={clinicalContext}
              onChange={(e) => setClinicalContext(e.target.value)}
              rows={3}
              placeholder='e.g., suspected TB, follow-up after treatment'
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <p className="mt-1 text-xs text-neutral-400">
              Keep brief. No diagnosis codes or full medical history.
            </p>
          </div>

          {/* Referral form preview */}
          {selectedLab && (
            <button
              type="button"
              onClick={() => setShowPreview((p) => !p)}
              className="text-sm text-blue-600 underline"
            >
              {showPreview ? 'Hide' : 'Preview'} referral form
            </button>
          )}

          {showPreview && selectedLab && (
            <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm space-y-1">
              <p className="font-medium text-blue-900">Referral Form Preview</p>
              <p><span className="text-blue-700">Patient:</span> [first name + age only]</p>
              <p><span className="text-blue-700">Sample type:</span> {sampleType}</p>
              <p><span className="text-blue-700">Test:</span> {loincDisplay} ({loincCode})</p>
              <p><span className="text-blue-700">Context:</span> {clinicalContext || '—'}</p>
              <p><span className="text-blue-700">Reference Lab:</span> {selectedLab.name} (Accred. #{selectedLab.accreditationNumber})</p>
            </div>
          )}

          {error && (
            <p role="alert" className="text-sm text-red-600">{error}</p>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !selectedLabId}
              className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              <Send size={16} />
              {loading ? 'Sending…' : 'Confirm Send-Out'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
