'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { ModalHeader } from '@/components/ui/dialog'
import { AllergyBanner } from './AllergyBanner'
import { RecallAlertBanner } from './RecallAlertBanner'
import { InteractionCheckBanner, type InteractionStatus } from './InteractionCheckBanner'
import { getRecallAlertsForAtc } from '@/lib/drug-catalog-queries'
import { runDispenseInteractionCheck } from '@/lib/dispense-interaction-check'
import { fetchActiveMedications } from '@/lib/active-medications'
import type { RecallAlert } from '@ultranos/shared-types'
import type { FulfillmentItem } from '@/stores/fulfillment-store'

interface DispensingConfirmationModalProps {
  items: FulfillmentItem[]
  patientName?: string
  patientAllergies?: string[]
  /**
   * Story 57.1 (AC 2): true when the patient's allergy record could not be
   * obtained (offline with no local record, hub error). Requires the same
   * override-with-reason path as an UNAVAILABLE interaction check — the
   * existing `_ultranos.reviewOverride` machinery is reused, not forked.
   */
  allergyStatusUnknown?: boolean
  onConfirm: (override?: { reason: string; supervisorName: string }) => void
  onCancel: () => void
}

export function DispensingConfirmationModal({
  items,
  patientName,
  patientAllergies,
  allergyStatusUnknown = false,
  onConfirm,
  onCancel,
}: DispensingConfirmationModalProps) {
  const [acknowledged, setAcknowledged] = useState(false)
  const [recalls, setRecalls] = useState<RecallAlert[]>([])
  const [interaction, setInteraction] = useState<InteractionStatus>({ state: 'checking' })
  // Story 57.4 (M-PHARM-1): true when the active-medication dimension could not
  // be loaded (offline/no-token/error). `null` while still loading — never
  // treated as an implicit "no active meds" clear.
  const [activeMedIncomplete, setActiveMedIncomplete] = useState<boolean | null>(null)
  const [overrideReason, setOverrideReason] = useState('')
  const [supervisorName, setSupervisorName] = useState('')
  const t = useTranslations('dispensingConfirmation')

  useEffect(() => {
    let cancelled = false
    void Promise.all(
      items.map((i) => (i.prescription.atc ? getRecallAlertsForAtc(i.prescription.atc) : Promise.resolve([]))),
    ).then((lists) => { if (!cancelled) setRecalls(lists.flat()) })
    return () => { cancelled = true }
  }, [items])

  useEffect(() => {
    let cancelled = false
    const meds = items.map((i) => i.prescription.medN)
    const patientId = items[0]?.prescription.pat
    void (async () => {
      // Story 57.4 (M-PHARM-1, AC 4): distinguish "active-med check could not run"
      // from "checked, none found". When there is no patient id at all we also
      // treat the dimension as incomplete (cannot have run) rather than clear.
      const activeResult = patientId
        ? await fetchActiveMedications(patientId)
        : { meds: [] as string[], complete: false }
      const status = await runDispenseInteractionCheck(meds, patientAllergies ?? [], activeResult.meds)
      if (!cancelled) {
        setInteraction(status)
        setActiveMedIncomplete(!activeResult.complete)
      }
    })()
    return () => { cancelled = true }
  }, [items, patientAllergies])

  // Block on a contraindication AND while any dimension is still running —
  // never allow dispense before the checks have resolved (safety race). The
  // active-med dimension is still loading while `activeMedIncomplete === null`.
  const blockedByInteraction =
    interaction.state === 'contraindicated' ||
    interaction.state === 'checking' ||
    activeMedIncomplete === null

  // Override is required for warning or unavailable states — the pharmacist must
  // provide a reason and supervisor name before proceeding.
  // Story 57.1 (AC 2): an UNKNOWN allergy status is treated exactly like an
  // unavailable interaction check — dispensing requires override-with-reason.
  // Story 57.4 (M-PHARM-1, AC 4): an INCOMPLETE active-medication dimension is
  // treated the same way — a degraded check, never an implicit clear.
  const needsOverride =
    interaction.state === 'warning' ||
    interaction.state === 'unavailable' ||
    allergyStatusUnknown ||
    activeMedIncomplete === true

  const overrideValid =
    !needsOverride || (overrideReason.trim().length >= 10 && supervisorName.trim().length > 0)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/50"
      role="dialog"
      aria-modal="true"
      aria-label={t('ariaLabel')}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div className="w-full max-w-lg rounded-2xl bg-card p-6 shadow-card mx-4 max-h-[80vh] overflow-y-auto">
        <ModalHeader title={t('title')} inset />

        {recalls.length > 0 && (
          <div className="mb-4">
            <RecallAlertBanner alerts={recalls} />
          </div>
        )}
        <div className="mb-4">
          <AllergyBanner allergies={patientAllergies} patientName={patientName} />
        </div>
        <div className="mb-4">
          <InteractionCheckBanner status={interaction} />
        </div>

        {/* Story 57.4 (M-PHARM-1, AC 4): active-medication dimension degraded —
            surface explicitly as a warning, mirroring the UNAVAILABLE interaction
            pattern. Never let an empty active-med list read as an implicit clear. */}
        {activeMedIncomplete === true && (
          <div
            role="alert"
            className="mb-4 rounded-lg border-2 border-warning bg-warning/10 p-4"
            data-testid="active-med-unavailable"
          >
            <p className="text-sm font-bold text-warning">{t('activeMedUnavailableTitle')}</p>
            <p className="text-xs font-semibold text-warning mt-2">{t('activeMedUnavailableCaution')}</p>
          </div>
        )}

        {/* Override sub-form — rendered only for warning/unavailable states */}
        {needsOverride && (
          <div className="mb-4 rounded-xl border border-warning/40 bg-warning/10 p-4 space-y-3">
            <p className="text-sm font-semibold text-warning">{t('overrideRequiredTitle')}</p>
            {allergyStatusUnknown && (
              <p className="text-xs font-semibold text-warning" data-testid="override-allergy-unknown-notice">
                {t('overrideAllergyUnknownNotice')}
              </p>
            )}
            <p className="text-xs text-warning">{t('overrideReviewNotice')}</p>

            <div>
              <label
                htmlFor="override-reason-input"
                className="mb-1 block text-xs font-medium text-warning"
              >
                {t('overrideReasonLabel')}
              </label>
              <textarea
                id="override-reason-input"
                data-testid="override-reason"
                dir="auto"
                rows={3}
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder={t('overrideReasonPlaceholder')}
                className="w-full rounded-lg border border-warning/40 bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-warning focus:outline-none focus:ring-1 focus:ring-warning resize-none"
              />
            </div>

            <div>
              <label
                htmlFor="override-supervisor-input"
                className="mb-1 block text-xs font-medium text-warning"
              >
                {t('overrideSupervisorLabel')}
              </label>
              <input
                id="override-supervisor-input"
                data-testid="override-supervisor"
                dir="auto"
                type="text"
                value={supervisorName}
                onChange={(e) => setSupervisorName(e.target.value)}
                placeholder={t('overrideSupervisorPlaceholder')}
                className="w-full rounded-lg border border-warning/40 bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-warning focus:outline-none focus:ring-1 focus:ring-warning"
              />
            </div>
          </div>
        )}

        <div className="mb-4">
          <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
            {t('dispensingTo', { count: items.length })}
          </p>
          <p className="text-sm font-semibold text-foreground mb-3">{patientName ?? t('unknownPatient')}</p>

          <ul className="space-y-2">
            {items.map((item) => (
              <li key={item.prescription.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-foreground">{item.prescription.medT}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.prescription.dos.qty} {item.prescription.dos.unit} | {item.prescription.dur} days
                  </p>
                </div>
                {item.brandName && (
                  <span className="text-xs text-muted-foreground">{item.brandName}</span>
                )}
              </li>
            ))}
          </ul>
        </div>

        <label className="flex items-start gap-3 rounded-2xl border border-border bg-muted p-3 cursor-pointer mb-4">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-border text-primary-600"
            data-testid="dispensing-ack-checkbox"
          />
          <span className="text-sm text-foreground">
            {t('ackText')}
          </span>
        </label>

        <div className="flex gap-3">
          <Button
            variant="default"
            type="button"
            className="w-full"
            disabled={!acknowledged || blockedByInteraction || !overrideValid}
            onClick={() => onConfirm(needsOverride ? { reason: overrideReason.trim(), supervisorName: supervisorName.trim() } : undefined)}
            data-testid="modal-confirm-dispensing-btn"
          >
            {t('dispenseMedication')}
          </Button>
          <Button variant="secondary" type="button" onClick={onCancel}>
            {t('cancel')}
          </Button>
        </div>
      </div>
    </div>
  )
}
