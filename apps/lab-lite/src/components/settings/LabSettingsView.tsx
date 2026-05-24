'use client'

import { useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'

export function LabSettingsView() {
  const t = useTranslations('settings')
  const session = useAuthSessionStore((s) => s.session)

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
                  {t('labTechnician')}
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
    </div>
  )
}
