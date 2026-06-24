'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { AllergyBanner } from './AllergyBanner'
import { RecallAlertBanner } from './RecallAlertBanner'
import { InteractionCheckBanner, type InteractionStatus } from './InteractionCheckBanner'
import { getRecallAlertsForAtc } from '@/lib/drug-catalog-queries'
import { runDispenseInteractionCheck } from '@/lib/dispense-interaction-check'
import type { RecallAlert } from '@ultranos/shared-types'
import type { FulfillmentItem } from '@/stores/fulfillment-store'

interface DispensingConfirmationModalProps {
  items: FulfillmentItem[]
  patientName?: string
  patientAllergies?: string[]
  onConfirm: () => void
  onCancel: () => void
}

export function DispensingConfirmationModal({
  items,
  patientName,
  patientAllergies,
  onConfirm,
  onCancel,
}: DispensingConfirmationModalProps) {
  const [acknowledged, setAcknowledged] = useState(false)
  const [recalls, setRecalls] = useState<RecallAlert[]>([])
  const [interaction, setInteraction] = useState<InteractionStatus>({ state: 'checking' })
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
    void runDispenseInteractionCheck(meds, patientAllergies ?? []).then((s) => { if (!cancelled) setInteraction(s) })
    return () => { cancelled = true }
  }, [items, patientAllergies])

  // Block on a contraindication AND while the check is still running —
  // never allow dispense before the interaction check has resolved (safety race).
  const blockedByInteraction = interaction.state === 'contraindicated' || interaction.state === 'checking'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/50"
      role="dialog"
      aria-modal="true"
      aria-label={t('ariaLabel')}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div className="w-full max-w-lg rounded-2xl bg-card p-6 shadow-card mx-4 max-h-[80vh] overflow-y-auto">
        <h3 className="text-lg font-bold text-foreground mb-4">{t('title')}</h3>

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
            disabled={!acknowledged || blockedByInteraction}
            onClick={onConfirm}
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
