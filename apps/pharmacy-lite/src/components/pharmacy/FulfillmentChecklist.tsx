'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useFulfillmentStore, type FulfillmentItem } from '@/stores/fulfillment-store'
import { Button } from '@/components/ui/Button'
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
  const { phase, items, practitionerName, patientName, patientAge, toggleItem, selectAll, deselectAll, setBrandName, setBatchLot } =
    useFulfillmentStore()
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [dispensingComplete, setDispensingComplete] = useState(false)
  const activePatient = usePatientStore((s) => s.activePatient)
  const activeInvoice = usePosStore((s) => s.activeInvoice)

  if (phase === 'empty' || items.length === 0) {
    return (
      <div data-testid="fulfillment-empty-state" className="rounded-lg border border-neutral-200 p-8 text-center">
        <p className="text-neutral-500">No prescriptions loaded. Scan a prescription QR code first.</p>
      </div>
    )
  }

  const hasSelection = items.some((i) => i.selected)

  return (
    <div className="space-y-4" dir="auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-neutral-800">Fulfillment Checklist</h2>
          {patientName && (
            <p data-testid="patient-info" className="text-sm font-medium text-neutral-700">
              Patient: {patientName}{patientAge != null ? `, ${patientAge} y/o` : ''}
            </p>
          )}
          {practitionerName && (
            <p className="text-sm text-neutral-500">Prescribed by {practitionerName}</p>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            data-testid="select-all-btn"
            type="button"
            onClick={selectAll}
          >
            Select All
          </Button>
          <Button
            variant="secondary"
            data-testid="deselect-all-btn"
            type="button"
            onClick={deselectAll}
          >
            Deselect All
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
            className={`rounded-lg border p-4 transition-colors ${
              item.selected ? 'border-primary-300 bg-primary-50/50' : 'border-neutral-200 bg-neutral-50'
            }`}
          >
            <div className="flex items-start gap-3">
              {/* Selection checkbox */}
              <input
                type="checkbox"
                data-testid={`fulfill-checkbox-${item.prescription.id}`}
                checked={item.selected}
                onChange={() => toggleItem(item.prescription.id)}
                className="mt-1 h-5 w-5 rounded border-neutral-300 text-primary-600 focus:ring-primary-500"
                aria-label={`Fulfill ${item.prescription.medN}`}
              />

              <div className="min-w-0 flex-1">
                {/* Medication info */}
                <p className="font-medium text-neutral-800">{item.prescription.medT}</p>
                <p className="text-sm text-neutral-600">
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
                        className="mb-1 block text-xs font-medium text-neutral-600"
                      >
                        Brand Name
                      </label>
                      <input
                        id={`brand-${item.prescription.id}`}
                        data-testid={`brand-input-${item.prescription.id}`}
                        type="text"
                        value={item.brandName}
                        onChange={(e) => setBrandName(item.prescription.id, e.target.value)}
                        placeholder="e.g. Amoxil"
                        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm placeholder:text-neutral-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor={`batch-${item.prescription.id}`}
                        className="mb-1 block text-xs font-medium text-neutral-600"
                      >
                        Batch / Lot No. <span className="text-neutral-400">(Optional)</span>
                      </label>
                      <input
                        id={`batch-${item.prescription.id}`}
                        data-testid={`batch-input-${item.prescription.id}`}
                        type="text"
                        value={item.batchLot}
                        onChange={(e) => setBatchLot(item.prescription.id, e.target.value)}
                        placeholder="e.g. LOT-2026-04A"
                        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm placeholder:text-neutral-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
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
        variant="primary"
        fullWidth
        data-testid="confirm-dispensing-btn"
        type="button"
        disabled={!hasSelection}
        onClick={() => setShowConfirmModal(true)}
      >
        Confirm Dispensing
      </Button>

      {dispensingComplete && (
        <div className="rounded-lg border-2 border-green-400 bg-green-50 p-4 space-y-3" data-testid="dispensing-complete-card">
          <p className="text-sm font-bold text-green-800">Dispensing Complete</p>
          {activeInvoice && (
            <Link href="/pos">
              <Button variant="primary" fullWidth type="button" data-testid="collect-payment-cta">
                Collect Payment — {activeInvoice.invoiceNumber}
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
