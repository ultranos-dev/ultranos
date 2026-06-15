'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { ExposureWorkflow } from './ExposureWorkflow'
import type { ExposureType } from '@/lib/safety/exposure-protocol'
import { ExposureType as ExposureTypeEnum } from '@/lib/safety/exposure-protocol'

interface EmergencyActionMenuProps {
  onClose: () => void
}

export function EmergencyActionMenu({ onClose }: EmergencyActionMenuProps) {
  const t = useTranslations('safety.emergency')
  const [selectedExposure, setSelectedExposure] = useState<ExposureType | null>(null)

  if (selectedExposure) {
    return (
      <ExposureWorkflow
        exposureType={selectedExposure}
        onClose={onClose}
      />
    )
  }

  const exposureButtons: Array<{ type: ExposureType; labelKey: string; color: string }> = [
    { type: ExposureTypeEnum.NEEDLESTICK, labelKey: 'exposureTypes.needlestick', color: '#dc2626' },
    { type: ExposureTypeEnum.SPLASH_MUCOUS, labelKey: 'exposureTypes.splashMucous', color: '#b45309' },
    { type: ExposureTypeEnum.SPLASH_BROKEN_SKIN, labelKey: 'exposureTypes.splashBrokenSkin', color: '#b45309' },
  ]

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="emergency-menu-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        backgroundColor: 'rgba(0,0,0,0.85)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
        gap: '1rem',
      }}
    >
      <h1
        id="emergency-menu-title"
        style={{
          color: 'white',
          fontSize: '1.75rem',
          fontWeight: 700,
          margin: 0,
          textAlign: 'center',
        }}
      >
        {t('menuTitle')}
      </h1>
      <p style={{ color: '#fca5a5', fontSize: '1.125rem', margin: 0 }}>
        {t('menuSubtitle')}
      </p>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
          width: '100%',
          maxWidth: '28rem',
        }}
      >
        {exposureButtons.map(({ type, labelKey, color }) => (
          <button
            key={type}
            type="button"
            onClick={() => setSelectedExposure(type)}
            style={{
              backgroundColor: color,
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              padding: '1.25rem 1.5rem',
              fontSize: '1.125rem',
              fontWeight: 700,
              cursor: 'pointer',
              minHeight: '64px',
              textAlign: 'center',
            }}
          >
            {t(labelKey as any)}
          </button>
        ))}

        {/* Spill emergency — navigates to spill protocol (Story 47.5 integration point) */}
        <button
          type="button"
          onClick={() => {
            // Story 47.5 integration point — stub navigation
            onClose()
          }}
          style={{
            backgroundColor: '#1d4ed8',
            color: 'white',
            border: 'none',
            borderRadius: '0.5rem',
            padding: '1.25rem 1.5rem',
            fontSize: '1.125rem',
            fontWeight: 700,
            cursor: 'pointer',
            minHeight: '64px',
            textAlign: 'center',
          }}
        >
          {t('exposureTypes.spill')}
        </button>

        <button
          type="button"
          onClick={onClose}
          style={{
            backgroundColor: 'transparent',
            color: '#9ca3af',
            border: '1px solid #4b5563',
            borderRadius: '0.5rem',
            padding: '1rem 1.5rem',
            fontSize: '1rem',
            cursor: 'pointer',
            minHeight: '56px',
            textAlign: 'center',
          }}
        >
          {t('cancel')}
        </button>
      </div>
    </div>
  )
}
