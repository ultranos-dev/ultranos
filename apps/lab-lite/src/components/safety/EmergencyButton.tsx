'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { EmergencyActionMenu } from './EmergencyActionMenu'
import { AlertTriangle } from '@ultranos/ui-kit/icons'

export function EmergencyButton() {
  const t = useTranslations('safety.emergency')
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setMenuOpen(true)}
        aria-label={t('buttonAriaLabel')}
        style={{
          position: 'fixed',
          insetInlineEnd: '1rem',
          bottom: '1rem',
          zIndex: 9999,
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          backgroundColor: '#dc2626', // red-600
          color: 'white',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
        }}
        className="hover:bg-red-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
      >
        {/* Alert icon */}
        <AlertTriangle size={28} aria-hidden="true" strokeWidth={2.5} />
        <span className="sr-only">{t('buttonLabel')}</span>
      </button>

      {menuOpen && (
        <EmergencyActionMenu onClose={() => setMenuOpen(false)} />
      )}
    </>
  )
}
