'use client'

import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Alert } from '@ultranos/ui-kit/components/ui/alert'
import { formatDate } from '@ultranos/ui-kit'
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
 */
export function ConsentExpiryBanner({ patientId, expiryDate }: ConsentExpiryBannerProps) {
  const locale = useLocale() as 'en' | 'ar' | 'prs' | 'ps'
  const t = useTranslations('consent')
  const [showModal, setShowModal] = useState(false)
  const [renewed, setRenewed] = useState(false)

  if (renewed) return null

  const formattedDate = formatDate(expiryDate, locale)

  return (
    <>
      <Alert variant="warning" role="alert" className="mb-4">
        <div className="flex items-center justify-between gap-3">
          <p>
            {t('expiryWarning', { date: formattedDate })}
          </p>
          <Button
            variant="warning"
            className="shrink-0"
            type="button"
            onClick={() => setShowModal(true)}
          >
            {t('renewConsent')}
          </Button>
        </div>
      </Alert>

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
