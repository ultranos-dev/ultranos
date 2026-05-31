'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { LabRole } from '@ultranos/shared-types'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { useDataBudgetStore } from '@/stores/data-budget-store'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { reportDataBudgetConfigEvent } from '@/lib/audit-client'
import { Button } from '@/components/ui/Button'
import { SecurityAlertFlow } from '@/components/security/SecurityAlertFlow'
import { ConfidencePrincipleInfo } from '@/components/ai/ConfidencePrincipleInfo'
import { DEFAULT_TAT_PROFILES, type TestTatProfile } from '@/lib/test-tat-database'
import { getTatOverrides, putTatOverride, removeTatOverride, type TatOverrideEntry, getDailyLogSettings, saveDailyLogSettings } from '@/lib/db'
import type { DailyLogSettings } from '@/lib/daily-log-types'

/** Map LabRole enum to i18n key under settings namespace */
const ROLE_I18N_KEY: Record<LabRole, string> = {
  [LabRole.LAB_TECH]: 'labTech',
  [LabRole.SENIOR_TECH]: 'seniorTech',
  [LabRole.SUPERVISOR]: 'supervisor',
  [LabRole.LAB_MANAGER]: 'labManager',
}

export function LabSettingsView() {
  const t = useTranslations('settings')
  const tScheduler = useTranslations('scheduler.nav')
  const tData = useTranslations('dataBudget')
  const tSecurity = useTranslations('security')
  const session = useAuthSessionStore((s) => s.session)
  const [showSecurityAlert, setShowSecurityAlert] = useState(false)
  const isManager = session?.labRole === LabRole.LAB_MANAGER
  const {
    planSizeMB,
    billingCycleDay,
    lowDataMode,
    isLoaded,
    loadFromDexie,
    updateConfig,
  } = useDataBudgetStore()

  // TAT override state (Task 6 — Story 45.5)
  const [tatOverrides, setTatOverrides] = useState<Partial<Record<string, TatOverrideEntry>>>({})
  const [tatEdits, setTatEdits] = useState<Record<string, number>>({})

  useEffect(() => {
    if (!isLoaded) void loadFromDexie()
  }, [isLoaded, loadFromDexie])

  useEffect(() => {
    getTatOverrides().then((overrides) => {
      setTatOverrides(overrides)
      const edits: Record<string, number> = {}
      for (const p of DEFAULT_TAT_PROFILES) {
        edits[p.loincCode] = overrides[p.loincCode]?.estimatedMinutes ?? p.estimatedMinutes
      }
      setTatEdits(edits)
    })
  }, [])

  async function handleSaveTatOverride(profile: TestTatProfile, newMinutes: number) {
    const entry: TatOverrideEntry = {
      ...profile,
      estimatedMinutes: newMinutes,
      updatedAt: new Date().toISOString(),
    }
    await putTatOverride(entry)
    setTatOverrides((prev) => ({ ...prev, [profile.loincCode]: entry }))
  }

  async function handleResetTatOverride(loincCode: string) {
    await removeTatOverride(loincCode)
    const defaultProfile = DEFAULT_TAT_PROFILES.find((p) => p.loincCode === loincCode)
    setTatOverrides((prev) => {
      const next = { ...prev }
      delete next[loincCode]
      return next
    })
    if (defaultProfile) {
      setTatEdits((prev) => ({ ...prev, [loincCode]: defaultProfile.estimatedMinutes }))
    }
  }

  const handleSignOut = useCallback(async () => {
    useAuthSessionStore.getState().clearSession()
    await getSupabaseBrowserClient().auth.signOut()
    window.location.href = '/login'
  }, [])

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="text-2xl font-bold text-neutral-900 mb-6">{t('title')}</h1>

      <div className="flex flex-col gap-4">
        {/* Profile Card */}
        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-neutral-500 mb-3">{t('profile')}</h2>
          <dl className="space-y-2">
            <div className="flex justify-between">
              <dt className="text-sm text-neutral-600">{t('email')}</dt>
              <dd className="text-sm font-medium text-neutral-900">{session?.email ?? '--'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-sm text-neutral-600">{t('role')}</dt>
              <dd>
                <span className="inline-flex rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                  {session?.labRole
                    ? t(ROLE_I18N_KEY[session.labRole as LabRole] ?? 'labTech')
                    : t('labTech')}
                </span>
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-sm text-neutral-600">{t('practitionerId')}</dt>
              <dd className="text-sm font-medium text-neutral-900 font-mono">
                {session?.practitionerId
                  ? session.practitionerId.slice(0, 8)
                  : '--'}
              </dd>
            </div>
          </dl>
        </div>

        {/* Lab Info Card */}
        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-neutral-500 mb-3">{t('labInfo')}</h2>
          <dl className="space-y-2">
            <div className="flex justify-between">
              <dt className="text-sm text-neutral-600">{t('labName')}</dt>
              <dd className="text-sm font-medium text-neutral-900">
                {/* labName is used in LabIdentityCard via session but not in AuthSession interface */}
                {(session as Record<string, unknown>)?.labName as string ?? 'Lab'}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-sm text-neutral-600">{t('accreditation')}</dt>
              <dd className="text-sm text-neutral-400">--</dd>
            </div>
          </dl>
        </div>

        {/* Data & Connectivity */}
        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-neutral-500 mb-3">{tData('settingsTitle')}</h2>
          <div className="space-y-3">
            {/* Plan size */}
            <div className="flex items-center justify-between">
              <label htmlFor="planSizeMB" className="text-sm text-neutral-600">
                {tData('planSize')}
              </label>
              <input
                id="planSizeMB"
                type="number"
                min={1}
                max={99999}
                value={planSizeMB}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10)
                  if (!isNaN(val) && val > 0) {
                    const old = String(planSizeMB)
                    void updateConfig({ planSizeMB: val })
                    reportDataBudgetConfigEvent({
                      action: 'DATA_BUDGET_CONFIG_UPDATED',
                      field: 'planSizeMB',
                      oldValue: old,
                      newValue: String(val),
                    })
                  }
                }}
                className="w-24 rounded border border-neutral-300 px-2 py-1 text-sm text-end"
              />
            </div>

            {/* Billing cycle day */}
            <div className="flex items-center justify-between">
              <label htmlFor="billingCycleDay" className="text-sm text-neutral-600">
                {tData('billingCycleDay')}
              </label>
              <select
                id="billingCycleDay"
                value={billingCycleDay}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10)
                  const old = String(billingCycleDay)
                  void updateConfig({ billingCycleDay: val })
                  reportDataBudgetConfigEvent({
                    action: 'DATA_BUDGET_CONFIG_UPDATED',
                    field: 'billingCycleDay',
                    oldValue: old,
                    newValue: String(val),
                  })
                }}
                className="w-24 rounded border border-neutral-300 px-2 py-1 text-sm"
              >
                {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>

            {/* Low Data Mode toggle */}
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm text-neutral-600">{tData('lowDataMode')}</span>
                <p className="text-xs text-neutral-400">{tData('lowDataModeDesc')}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={lowDataMode}
                onClick={() => {
                  const old = String(lowDataMode)
                  const next = !lowDataMode
                  void updateConfig({ lowDataMode: next })
                  reportDataBudgetConfigEvent({
                    action: 'DATA_BUDGET_CONFIG_UPDATED',
                    field: 'lowDataMode',
                    oldValue: old,
                    newValue: String(next),
                  })
                }}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors ${
                  lowDataMode ? 'bg-blue-600' : 'bg-neutral-300'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform mt-0.5 ${
                    lowDataMode ? 'translate-x-5 ms-0.5' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>

            {/* Link to full dashboard */}
            <Link
              href="/settings/data-budget"
              className="block text-sm text-blue-600 hover:text-blue-700 mt-2"
            >
              {tData('viewDashboard')} &rarr;
            </Link>
          </div>
        </div>

        {/* Turnaround Times — Task 6, Story 45.5 */}
        <div
          className="rounded-lg border border-neutral-200 bg-white p-4"
          data-testid="tat-settings-section"
        >
          <h2 className="text-sm font-semibold text-neutral-500 mb-3">
            {t('turnaroundTimes')}
          </h2>
          <div className="space-y-2">
            {DEFAULT_TAT_PROFILES.map((profile) => {
              const currentMinutes = tatEdits[profile.loincCode] ?? profile.estimatedMinutes
              const isOverridden = !!tatOverrides[profile.loincCode]
              return (
                <div key={profile.loincCode} className="flex items-center justify-between gap-2">
                  <span className="text-sm text-neutral-700 flex-1">{profile.loincDisplay}</span>
                  {isManager ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        max={9999}
                        value={currentMinutes}
                        data-testid={`tat-input-${profile.loincCode}`}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10)
                          if (!isNaN(val) && val > 0) {
                            setTatEdits((prev) => ({ ...prev, [profile.loincCode]: val }))
                          }
                        }}
                        onBlur={async () => {
                          const val = tatEdits[profile.loincCode]
                          if (val !== undefined && val !== profile.estimatedMinutes) {
                            await handleSaveTatOverride(profile, val)
                          }
                        }}
                        className="w-20 rounded border border-neutral-300 px-2 py-1 text-sm text-end"
                      />
                      <span className="text-xs text-neutral-400">{t('min')}</span>
                      {isOverridden && (
                        <button
                          type="button"
                          data-testid={`tat-reset-${profile.loincCode}`}
                          onClick={() => handleResetTatOverride(profile.loincCode)}
                          className="text-xs text-blue-600 hover:text-blue-700"
                        >
                          {t('tatReset')}
                        </button>
                      )}
                    </div>
                  ) : (
                    <span
                      className="text-sm font-medium text-neutral-900"
                      data-testid={`tat-display-${profile.loincCode}`}
                    >
                      {currentMinutes} {t('min')}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Power & Scheduling */}
        <Link
          href="/settings/power-schedule"
          className="rounded-lg border border-neutral-200 bg-white p-4 flex items-center justify-between hover:bg-neutral-50 transition-colors"
        >
          <div>
            <h2 className="text-sm font-semibold text-neutral-500">{tScheduler('powerScheduling')}</h2>
            <p className="text-xs text-neutral-400 mt-0.5">
              Generator schedule &amp; test time estimates
            </p>
          </div>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-400 rtl:-scale-x-100">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </Link>

        {/* Reference Ranges — Story 43.8 (AC #1) */}
        <Link
          href="/settings/reference-ranges"
          data-testid="reference-ranges-link"
          className="rounded-lg border border-neutral-200 bg-white p-4 flex items-center justify-between hover:bg-neutral-50 transition-colors"
        >
          <div>
            <h2 className="text-sm font-semibold text-neutral-500">{t('referenceRanges')}</h2>
            <p className="text-xs text-neutral-400 mt-0.5">
              {t('referenceRangesDesc')}
            </p>
          </div>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-400 rtl:-scale-x-100">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </Link>

        {/* Security Alert — lab_manager only (Story 49.4) */}
        {isManager && (
          <button
            type="button"
            data-testid="security-alert-button"
            onClick={() => setShowSecurityAlert(true)}
            className="
              w-full rounded-lg border-2 border-red-500 bg-red-50 p-4
              flex items-center gap-3
              hover:bg-red-100 transition-colors
              focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2
              focus-visible:outline-red-600
            "
          >
            <span className="text-2xl" aria-hidden="true">⚠️</span>
            <div className="text-start">
              <p className="text-sm font-bold text-red-800">{tSecurity('settings.button')}</p>
              <p className="text-xs text-red-600 mt-0.5">{tSecurity('settings.buttonDescription')}</p>
            </div>
          </button>
        )}

        {/* AI Behavior — Confidence Inversion Principle (Story 53.5, AC #5) */}
        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-neutral-500 mb-3">{t('aiBehavior')}</h2>
          <ConfidencePrincipleInfo variant="panel" />
        </div>

        {/* Sign Out */}
        <Button
          variant="danger"
          fullWidth
          type="button"
          onClick={handleSignOut}
        >
          {t('signOut')}
        </Button>
      </div>

      {/* Security Alert Flow — full-screen overlay */}
      {showSecurityAlert && (
        <SecurityAlertFlow onClose={() => setShowSecurityAlert(false)} />
      )}
    </div>
  )
}
