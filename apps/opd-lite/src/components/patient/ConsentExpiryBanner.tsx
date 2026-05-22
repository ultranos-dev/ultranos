'use client'

import { useState } from 'react'
import { ConsentRenewalModal } from './ConsentRenewalModal'

interface ConsentExpiryBannerProps {
  patientId: string
  expiryDate: string // ISO date
}

/**
 * Amber warning banner shown on patient views when the patient's consent
 * is approaching expiry. Includes a "Renew Consent" button that opens
 * the renewal modal.
 *
 * TODO i18n: add keys under "consent" namespace:
 *   expiryWarning, renewConsent
 */
export function ConsentExpiryBanner({ patientId, expiryDate }: ConsentExpiryBannerProps) {
  const [showModal, setShowModal] = useState(false)
  const [renewed, setRenewed] = useState(false)

  if (renewed) return null

  const formattedDate = new Date(expiryDate).toLocaleDateString()

  return (
    <>
      <div
        role="alert"
        className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800"
      >
        <div className="flex items-center justify-between gap-3">
          <p>
            {/* TODO: t('consent.expiryWarning', { date: formattedDate }) */}
            Consent expires on {formattedDate}
          </p>
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500"
          >
            {/* TODO: t('consent.renewConsent') */}
            Renew Consent
          </button>
        </div>
      </div>

      {showModal && (
        <ConsentRenewalModal
          patientId={patientId}
          onClose={() => setShowModal(false)}
          onRenewed={() => setRenewed(true)}
        />
      )}
    </>
  )
}
