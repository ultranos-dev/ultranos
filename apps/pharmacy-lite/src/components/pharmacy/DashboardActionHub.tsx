'use client'

import { useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { PatientSearchBar } from './PatientSearchBar'
import { usePatientStore } from '@/stores/patient-store'
import type { LocalPatient } from '@/lib/db'
import { Scan, FileText, UserPlus } from '@ultranos/ui-kit/icons'

export function DashboardActionHub() {
  const locale = useLocale()
  const router = useRouter()
  const t = useTranslations('dashboard')
  const setActivePatient = usePatientStore((s) => s.setActivePatient)

  // Story 57.1 (AC 4): locale-aware SPA navigation. The previous
  // `window.location.href = '/scan'` full reload wiped the in-memory zustand
  // patient store (making setActivePatient a no-op) AND dropped the locale
  // prefix (C-SYS-3 evidence chain).
  const handleSelectPatient = useCallback((patient: LocalPatient) => {
    setActivePatient(patient)
    router.push(`/${locale}/scan`)
  }, [setActivePatient, router, locale])

  const handleRegisterNew = useCallback((name?: string) => {
    const params = name ? `?nameGiven=${encodeURIComponent(name)}` : ''
    router.push(`/${locale}/register-patient${params}`)
  }, [router, locale])

  return (
    <div className="space-y-4" data-testid="dashboard-action-hub">
      {/* Patient Search — primary action for walk-ins */}
      <div className="rounded-xl bg-card p-5 shadow-card ring-[0.65px] ring-border/50">
        <h3 className="mb-3 text-sm font-semibold text-foreground">{t('findOrRegisterPatient')}</h3>
        <PatientSearchBar
          onSelectPatient={handleSelectPatient}
          onRegisterNew={handleRegisterNew}
        />
      </div>

      {/* Three entry paths */}
      <div className="grid grid-cols-3 gap-4">
        <Link
          href="/scan"
          className="flex flex-col items-center gap-2 rounded-xl bg-card p-5 text-center shadow-card ring-[0.65px] ring-border/50 transition-colors hover:bg-muted/40"
          data-testid="action-scan-qr"
        >
          <Scan size={24} className="text-primary" />
          <span className="text-xs font-semibold text-foreground">{t('scanQrRx')}</span>
          <span className="text-[10px] text-muted-foreground">{t('fromOpdLite')}</span>
        </Link>

        <Link
          href="/paper-rx"
          className="flex flex-col items-center gap-2 rounded-xl bg-card p-5 text-center shadow-card ring-[0.65px] ring-border/50 transition-colors hover:bg-muted/40"
          data-testid="action-paper-rx"
        >
          <FileText size={24} className="text-primary" />
          <span className="text-xs font-semibold text-foreground">{t('paperRx')}</span>
          <span className="text-[10px] text-muted-foreground">{t('ocrScan')}</span>
        </Link>

        <Link
          href="/register-patient"
          className="flex flex-col items-center gap-2 rounded-xl bg-card p-5 text-center shadow-card ring-[0.65px] ring-border/50 transition-colors hover:bg-muted/40"
          data-testid="action-walk-in"
        >
          <UserPlus size={24} className="text-primary" />
          <span className="text-xs font-semibold text-foreground">{t('walkIn')}</span>
          <span className="text-[10px] text-muted-foreground">{t('newPatient')}</span>
        </Link>
      </div>
    </div>
  )
}
