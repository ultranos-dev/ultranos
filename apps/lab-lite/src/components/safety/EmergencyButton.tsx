'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { EmergencyActionMenu } from './EmergencyActionMenu'

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
        {/* Biohazard/Alert icon — using SVG for reliability */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <span className="sr-only">{t('buttonLabel')}</span>
      </button>

      {menuOpen && (
        <EmergencyActionMenu onClose={() => setMenuOpen(false)} />
      )}
    </>
  )
}
