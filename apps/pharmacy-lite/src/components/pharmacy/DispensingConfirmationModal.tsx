'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { AllergyBanner } from './AllergyBanner'
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/50"
      role="dialog"
      aria-modal="true"
      aria-label="Confirm Dispensing"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-lg mx-4 max-h-[80vh] overflow-y-auto">
        <h3 className="text-lg font-bold text-neutral-900 mb-4">Confirm Dispensing</h3>

        {patientAllergies && patientAllergies.length > 0 && (
          <div className="mb-4">
            <AllergyBanner allergies={patientAllergies} patientName={patientName} />
          </div>
        )}

        <div className="mb-4">
          <p className="text-xs font-medium text-neutral-500 mb-2 uppercase tracking-wide">
            Dispensing {items.length} medication{items.length !== 1 ? 's' : ''} to:
          </p>
          <p className="text-sm font-semibold text-neutral-900 mb-3">{patientName ?? 'Unknown Patient'}</p>

          <ul className="space-y-2">
            {items.map((item) => (
              <li key={item.prescription.id} className="flex items-center justify-between rounded-md border border-neutral-200 px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-neutral-900">{item.prescription.medT}</p>
                  <p className="text-xs text-neutral-500">
                    {item.prescription.dos.qty} {item.prescription.dos.unit} | {item.prescription.dur} days
                  </p>
                </div>
                {item.brandName && (
                  <span className="text-xs text-neutral-500">{item.brandName}</span>
                )}
              </li>
            ))}
          </ul>
        </div>

        <label className="flex items-start gap-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3 cursor-pointer mb-4">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-neutral-300 text-primary-600"
            data-testid="dispensing-ack-checkbox"
          />
          <span className="text-sm text-neutral-700">
            I confirm that I have verified the patient identity, checked for allergies and interactions, and the medications are correct.
          </span>
        </label>

        <div className="flex gap-3">
          <Button
            variant="primary"
            type="button"
            fullWidth
            disabled={!acknowledged}
            onClick={onConfirm}
            data-testid="modal-confirm-dispensing-btn"
          >
            Dispense Medication
          </Button>
          <Button variant="secondary" type="button" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  )
}
