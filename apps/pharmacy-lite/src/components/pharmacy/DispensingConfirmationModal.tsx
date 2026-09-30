'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { ModalHeader } from '@/components/ui/dialog'
import { Checkbox } from '@ultranos/ui-kit/components/ui/checkbox'
import { AllergyBanner } from './AllergyBanner'
import { RecallAlertBanner } from './RecallAlertBanner'
import { InteractionCheckBanner, type InteractionStatus } from './InteractionCheckBanner'
import { getRecallAlertsForAtc } from '@/lib/drug-catalog-queries'
import { runDispenseInteractionCheck } from '@/lib/dispense-interaction-check'
import { fetchActiveMedications } from '@/lib/active-medications'
import { ChevronDown } from '@ultranos/ui-kit/icons'
import { OverrideReasonCode, type RecallAlert } from '@ultranos/shared-types'
import type { FulfillmentItem } from '@/stores/fulfillment-store'
import type { DispenseOverride } from '@/lib/medication-dispense'

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
  onConfirm: (override?: DispenseOverride) => void
  onCancel: () => void
}

/** Ordered list of override reason codes surfaced in the modal select. */
const OVERRIDE_REASON_CODES: OverrideReasonCode[] = [
  OverrideReasonCode.CONTRAINDICATED_CLINICALLY_INDICATED,
  OverrideReasonCode.ALLERGY_PREVIOUSLY_TOLERATED,
  OverrideReasonCode.CHECK_UNAVAILABLE_CLINICAL_JUDGEMENT,
  OverrideReasonCode.BENEFIT_OUTWEIGHS_RISK,
  OverrideReasonCode.NO_ALTERNATIVE_AVAILABLE,
  OverrideReasonCode.OTHER,
]

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
  // Story 57.2: structured reason code + real supervisor credential.
  const [reasonCode, setReasonCode] = useState<OverrideReasonCode | ''>('')
  const [supervisorId, setSupervisorId] = useState('')
  const [supervisorPin, setSupervisorPin] = useState('')
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
        : { meds: [] as string[], complete: false, consentLimited: false }
      const status = await runDispenseInteractionCheck(meds, patientAllergies ?? [], activeResult.meds)
      if (!cancelled) {
        setInteraction(status)
        // Story 58.4 (H-HUB-7): a consent-limited active-med read is a DEGRADED
        // dimension too — meds is empty by consent policy, not because none exist —
        // so treat it exactly like an incomplete/unavailable check (require override).
        setActiveMedIncomplete(!activeResult.complete || activeResult.consentLimited)
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

  // Story 57.2: a valid override now requires a structured reason code AND a real
  // supervisor credential (supervisor id + PIN), not just free text + a name.
  const overrideValid =
    !needsOverride ||
    (reasonCode !== '' &&
      overrideReason.trim().length >= 10 &&
      supervisorName.trim().length > 0 &&
      supervisorId.trim().length > 0 &&
      supervisorPin.trim().length > 0)

  // Story 57.2 offline trust model: when offline, the supervisor PIN cannot be
  // verified at the point of care — the override is attested locally and the Hub
  // verifies it at drain. Surfaced to the pharmacist so they know verification is deferred.
  const isOffline = typeof navigator !== 'undefined' && !navigator.onLine

  function buildOverride(): DispenseOverride {
    return {
      reason: overrideReason.trim(),
      supervisorName: supervisorName.trim(),
      reasonCode: reasonCode as OverrideReasonCode,
      supervisorId: supervisorId.trim(),
      supervisorPin: supervisorPin.trim(),
      ...(isOffline ? { attestedOffline: true } : {}),
    }
  }

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

            {/* Story 57.2: structured reason code (required) */}
            <div>
              <label
                htmlFor="override-reason-code"
                className="mb-1 block text-xs font-medium text-warning"
              >
                {t('overrideReasonCodeLabel')}
              </label>
              <div className="relative">
                <select
                  id="override-reason-code"
                  data-testid="override-reason-code"
                  value={reasonCode}
                  onChange={(e) => setReasonCode(e.target.value as OverrideReasonCode | '')}
                  className="h-9 w-full appearance-none rounded-lg border border-warning/40 bg-card ps-3 pe-9 text-sm text-foreground focus:border-warning focus:outline-none focus:ring-1 focus:ring-warning"
                >
                  <option value="">{t('overrideReasonCodePlaceholder')}</option>
                  {OVERRIDE_REASON_CODES.map((code) => (
                    <option key={code} value={code}>
                      {t(`overrideReasonCode.${code}`)}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={16}
                  aria-hidden
                  className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-warning"
                />
              </div>
            </div>

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

            {/* Story 57.2: real supervisor credential — the Hub verifies these
                server-side (distinct supervisor-capable practitioner, same org,
                valid PIN). A pharmacist cannot supervise their own override. */}
            <div>
              <label
                htmlFor="override-supervisor-id"
                className="mb-1 block text-xs font-medium text-warning"
              >
                {t('overrideSupervisorIdLabel')}
              </label>
              <input
                id="override-supervisor-id"
                data-testid="override-supervisor-id"
                dir="auto"
                type="text"
                autoComplete="off"
                value={supervisorId}
                onChange={(e) => setSupervisorId(e.target.value)}
                placeholder={t('overrideSupervisorIdPlaceholder')}
                className="w-full rounded-lg border border-warning/40 bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-warning focus:outline-none focus:ring-1 focus:ring-warning"
              />
            </div>

            <div>
              <label
                htmlFor="override-supervisor-pin"
                className="mb-1 block text-xs font-medium text-warning"
              >
                {t('overrideSupervisorPinLabel')}
              </label>
              <input
                id="override-supervisor-pin"
                data-testid="override-supervisor-pin"
                type="password"
                autoComplete="off"
                inputMode="numeric"
                value={supervisorPin}
                onChange={(e) => setSupervisorPin(e.target.value)}
                placeholder={t('overrideSupervisorPinPlaceholder')}
                className="w-full rounded-lg border border-warning/40 bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-warning focus:outline-none focus:ring-1 focus:ring-warning"
              />
            </div>

            {isOffline && (
              <p className="text-xs text-warning" data-testid="override-offline-notice">
                {t('overrideOfflineNotice')}
              </p>
            )}
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
          <Checkbox
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            className="mt-0.5"
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
            onClick={() => onConfirm(needsOverride ? buildOverride() : undefined)}
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
