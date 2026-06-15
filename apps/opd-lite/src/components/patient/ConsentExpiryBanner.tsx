'use client'

import { useState } from 'react'
import { ConsentRenewalModal } from './ConsentRenewalModal'
import { Button } from '@/components/ui/Button'

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
        className="mb-4 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning"
      >
        <div className="flex items-center justify-between gap-3">
          <p>
            {/* TODO: t('consent.expiryWarning', { date: formattedDate }) */}
            Consent expires on {formattedDate}
          </p>
          <Button
            variant="warning"
            className="shrink-0"
            type="button"
            onClick={() => setShowModal(true)}
          >
            {/* TODO: t('consent.renewConsent') */}
            Renew Consent
          </Button>
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
