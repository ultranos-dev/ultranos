'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useFulfillmentStore, type FulfillmentItem } from '@/stores/fulfillment-store'
import { Button } from '@/components/ui/button'
import { DispensingConfirmationModal } from './DispensingConfirmationModal'
import { AllergyBanner } from './AllergyBanner'
import { usePatientStore } from '@/stores/patient-store'
import { usePosStore } from '@/stores/pos-store'

interface FulfillmentChecklistProps {
  onConfirm?: (selectedItems: FulfillmentItem[]) => void
}

function formatFrequency(freqN?: number, perU?: string): string {
  if (!freqN) return ''
  const unitLabel = perU === 'd' ? 'daily' : perU === 'h' ? 'hourly' : perU ?? ''
  return `${freqN}× ${unitLabel}`
}

export function FulfillmentChecklist({ onConfirm }: FulfillmentChecklistProps) {
  const t = useTranslations('fulfillment')
  const tD = useTranslations('dispensing')
  const { phase, items, practitionerName, patientName, patientAge, toggleItem, selectAll, deselectAll, setBrandName, setBatchLot } =
    useFulfillmentStore()
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [dispensingComplete, setDispensingComplete] = useState(false)
  const activePatient = usePatientStore((s) => s.activePatient)
  const activeInvoice = usePosStore((s) => s.activeInvoice)

  if (phase === 'empty' || items.length === 0) {
    return (
      <div data-testid="fulfillment-empty-state" className="rounded-2xl border border-border p-8 text-center">
        <p className="text-muted-foreground">{t('emptyState')}</p>
      </div>
    )
  }

  const hasSelection = items.some((i) => i.selected)

  return (
    <div className="space-y-4" dir="auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{t('title')}</h2>
          {patientName && (
            <p data-testid="patient-info" className="text-sm font-medium text-foreground">
              {patientAge != null ? t('patientInfoWithAge', { name: patientName, age: patientAge }) : t('patientInfo', { name: patientName })}
            </p>
          )}
          {practitionerName && (
            <p className="text-sm text-muted-foreground">{t('prescribedBy', { name: practitionerName })}</p>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            data-testid="select-all-btn"
            type="button"
            onClick={selectAll}
          >
            {t('selectAll')}
          </Button>
          <Button
            variant="secondary"
            data-testid="deselect-all-btn"
            type="button"
            onClick={deselectAll}
          >
            {t('deselectAll')}
          </Button>
        </div>
      </div>

      {/* Allergy banner — SAFETY-CRITICAL: highest display prominence */}
      <AllergyBanner allergies={activePatient?.allergies} patientName={activePatient?.nameGiven} />

      {/* Medication items */}
      <ul className="space-y-3" role="list">
        {items.map((item) => (
          <li
            key={item.prescription.id}
            className={`rounded-2xl border p-4 transition-colors ${
              item.selected ? 'border-primary-300 bg-primary-50/50' : 'border-border bg-muted'
            }`}
          >
            <div className="flex items-start gap-3">
              {/* Selection checkbox */}
              <input
                type="checkbox"
                data-testid={`fulfill-checkbox-${item.prescription.id}`}
                checked={item.selected}
                onChange={() => toggleItem(item.prescription.id)}
                className="mt-1 h-5 w-5 rounded border-border text-primary-600 focus:ring-primary-500"
                aria-label={`Fulfill ${item.prescription.medN}`}
              />

              <div className="min-w-0 flex-1">
                {/* Medication info */}
                <p className="font-medium text-foreground">{item.prescription.medT}</p>
                <p className="text-sm text-muted-foreground">
                  {item.prescription.dos.qty} {item.prescription.dos.unit}
                  {item.prescription.dos.freqN && (
                    <span> &middot; {formatFrequency(item.prescription.dos.freqN, item.prescription.dos.perU)}</span>
                  )}
                  <span> &middot; {item.prescription.dur} days</span>
                </p>

                {/* Brand / Batch inputs — only for selected items */}
                {item.selected && (
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div>
                      <label
                        htmlFor={`brand-${item.prescription.id}`}
                        className="mb-1 block text-xs font-medium text-muted-foreground"
                      >
                        {t('brandName')}
                      </label>
                      <input
                        id={`brand-${item.prescription.id}`}
                        data-testid={`brand-input-${item.prescription.id}`}
                        type="text"
                        value={item.brandName}
                        onChange={(e) => setBrandName(item.prescription.id, e.target.value)}
                        placeholder={t('brandPlaceholder')}
                        className="w-full rounded-md border border-border px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor={`batch-${item.prescription.id}`}
                        className="mb-1 block text-xs font-medium text-muted-foreground"
                      >
                        {t('batchLot')} <span className="text-muted-foreground">{t('batchOptional')}</span>
                      </label>
                      <input
                        id={`batch-${item.prescription.id}`}
                        data-testid={`batch-input-${item.prescription.id}`}
                        type="text"
                        value={item.batchLot}
                        onChange={(e) => setBatchLot(item.prescription.id, e.target.value)}
                        placeholder={t('batchPlaceholder')}
                        className="w-full rounded-md border border-border px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>

      {/* Confirm Dispensing button — "Primary Green Pill" per UX spec */}
      <Button
        variant="default"
        className="w-full"
        data-testid="confirm-dispensing-btn"
        type="button"
        disabled={!hasSelection}
        onClick={() => setShowConfirmModal(true)}
      >
        {t('confirmDispensing')}
      </Button>

      {dispensingComplete && (
        <div className="rounded-2xl border-2 border-success/20 bg-success/10 p-4 space-y-3" data-testid="dispensing-complete-card">
          <p className="text-sm font-bold text-success">{tD('dispensingComplete')}</p>
          {activeInvoice && (
            <Link href="/pos">
              <Button variant="default" className="w-full" type="button" data-testid="collect-payment-cta">
                {tD('collectPayment', { invoiceNumber: activeInvoice.invoiceNumber })}
              </Button>
            </Link>
          )}
        </div>
      )}

      {showConfirmModal && (
        <DispensingConfirmationModal
          items={items.filter((i) => i.selected)}
          patientName={activePatient?.nameGiven ?? patientName}
          patientAllergies={activePatient?.allergies}
          onConfirm={() => {
            setShowConfirmModal(false)
            const selected = items.filter((i) => i.selected)
            onConfirm?.(selected)
            setDispensingComplete(true)
          }}
          onCancel={() => setShowConfirmModal(false)}
        />
      )}
    </div>
  )
}
