'use client'

import { useCallback } from 'react'
import Link from 'next/link'
import { useLocale } from 'next-intl'
import { PatientSearchBar } from './PatientSearchBar'
import { usePatientStore } from '@/stores/patient-store'
import type { LocalPatient } from '@/lib/db'

export function DashboardActionHub() {
  const locale = useLocale()
  const setActivePatient = usePatientStore((s) => s.setActivePatient)

  const handleSelectPatient = useCallback((patient: LocalPatient) => {
    setActivePatient(patient)
    window.location.href = '/scan'
  }, [setActivePatient])

  const handleRegisterNew = useCallback((name?: string) => {
    const params = name ? `?nameGiven=${encodeURIComponent(name)}` : ''
    window.location.href = `/${locale}/register-patient${params}`
  }, [locale])

  return (
    <div className="space-y-4" data-testid="dashboard-action-hub">
      {/* Patient Search — primary action for walk-ins */}
      <div className="rounded-xl border border-neutral-200 bg-white p-5">
        <h3 className="mb-3 text-sm font-semibold text-neutral-700">Find or Register Patient</h3>
        <PatientSearchBar
          onSelectPatient={handleSelectPatient}
          onRegisterNew={handleRegisterNew}
        />
      </div>

      {/* Three entry paths */}
      <div className="grid grid-cols-3 gap-3">
        <Link
          href="/scan"
          className="flex flex-col items-center gap-2 rounded-xl border border-primary-200 bg-primary-50/50 p-4 text-center transition-colors hover:bg-primary-50"
          data-testid="action-scan-qr"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary-700">
            <path d="M3 7V5a2 2 0 0 1 2-2h2" />
            <path d="M17 3h2a2 2 0 0 1 2 2v2" />
            <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
            <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
            <line x1="7" y1="12" x2="17" y2="12" />
          </svg>
          <span className="text-xs font-semibold text-primary-800">Scan QR Rx</span>
          <span className="text-[10px] text-neutral-500">From OPD-Lite</span>
        </Link>

        <Link
          href="/paper-rx"
          className="flex flex-col items-center gap-2 rounded-xl border border-amber-200 bg-amber-50/50 p-4 text-center transition-colors hover:bg-amber-50"
          data-testid="action-paper-rx"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-700">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
          <span className="text-xs font-semibold text-amber-800">Paper Rx</span>
          <span className="text-[10px] text-neutral-500">OCR Scan</span>
        </Link>

        <Link
          href="/register-patient"
          className="flex flex-col items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50/50 p-4 text-center transition-colors hover:bg-neutral-50"
          data-testid="action-walk-in"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-700">
            <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="8.5" cy="7" r="4" />
            <line x1="20" y1="8" x2="20" y2="14" />
            <line x1="23" y1="11" x2="17" y2="11" />
          </svg>
          <span className="text-xs font-semibold text-neutral-800">Walk-in</span>
          <span className="text-[10px] text-neutral-500">New Patient</span>
        </Link>
      </div>
    </div>
  )
}
