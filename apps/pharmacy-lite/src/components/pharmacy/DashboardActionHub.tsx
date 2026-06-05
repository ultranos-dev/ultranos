'use client'

import { useCallback } from 'react'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { PatientSearchBar } from './PatientSearchBar'
import { usePatientStore } from '@/stores/patient-store'
import type { LocalPatient } from '@/lib/db'
import { Scan, FileText, UserPlus } from '@ultranos/ui-kit/icons'

export function DashboardActionHub() {
  const locale = useLocale()
  const t = useTranslations('dashboard')
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
      <div className="rounded-2xl border border-border bg-card p-5">
        <h3 className="mb-3 text-sm font-semibold text-foreground">{t('findOrRegisterPatient')}</h3>
        <PatientSearchBar
          onSelectPatient={handleSelectPatient}
          onRegisterNew={handleRegisterNew}
        />
      </div>

      {/* Three entry paths */}
      <div className="grid grid-cols-3 gap-3">
        <Link
          href="/scan"
          className="flex flex-col items-center gap-2 rounded-2xl border border-primary-200 bg-primary-50/50 p-4 text-center transition-colors hover:bg-primary-50"
          data-testid="action-scan-qr"
        >
          <Scan size={24} className="text-primary-700" />
          <span className="text-xs font-semibold text-primary-800">{t('scanQrRx')}</span>
          <span className="text-[10px] text-muted-foreground">{t('fromOpdLite')}</span>
        </Link>

        <Link
          href="/paper-rx"
          className="flex flex-col items-center gap-2 rounded-2xl border border-warning/20 bg-warning/10 p-4 text-center transition-colors hover:bg-warning/20"
          data-testid="action-paper-rx"
        >
          <FileText size={24} className="text-warning" />
          <span className="text-xs font-semibold text-warning">{t('paperRx')}</span>
          <span className="text-[10px] text-muted-foreground">{t('ocrScan')}</span>
        </Link>

        <Link
          href="/register-patient"
          className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-muted/50 p-4 text-center transition-colors hover:bg-accent"
          data-testid="action-walk-in"
        >
          <UserPlus size={24} className="text-foreground" />
          <span className="text-xs font-semibold text-foreground">{t('walkIn')}</span>
          <span className="text-[10px] text-muted-foreground">{t('newPatient')}</span>
        </Link>
      </div>
    </div>
  )
}
