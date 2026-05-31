'use client'

import { useCallback } from 'react'
import Link from 'next/link'
import { useLocale } from 'next-intl'
import { PatientSearchBar } from './PatientSearchBar'
import { usePatientStore } from '@/stores/patient-store'
import type { LocalPatient } from '@/lib/db'
import { Scan, FileText, UserPlus } from '@ultranos/ui-kit/icons'

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
          <Scan size={24} className="text-primary-700" />
          <span className="text-xs font-semibold text-primary-800">Scan QR Rx</span>
          <span className="text-[10px] text-neutral-500">From OPD-Lite</span>
        </Link>

        <Link
          href="/paper-rx"
          className="flex flex-col items-center gap-2 rounded-xl border border-amber-200 bg-amber-50/50 p-4 text-center transition-colors hover:bg-amber-50"
          data-testid="action-paper-rx"
        >
          <FileText size={24} className="text-amber-700" />
          <span className="text-xs font-semibold text-amber-800">Paper Rx</span>
          <span className="text-[10px] text-neutral-500">OCR Scan</span>
        </Link>

        <Link
          href="/register-patient"
          className="flex flex-col items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50/50 p-4 text-center transition-colors hover:bg-neutral-50"
          data-testid="action-walk-in"
        >
          <UserPlus size={24} className="text-neutral-700" />
          <span className="text-xs font-semibold text-neutral-800">Walk-in</span>
          <span className="text-[10px] text-neutral-500">New Patient</span>
        </Link>
      </div>
    </div>
  )
}
