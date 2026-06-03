'use client'

/**
 * Mentorship Page Route — Story 46.5 (Task 7)
 *
 * Protected by AuthGuard. Renders MentorshipDashboard for the currently
 * authenticated technician (mentor or mentee).
 *
 * No PHI: mentorship data is staff-only (no patient data).
 */

import { useTranslations } from 'next-intl'
import { AuthGuard } from '@/components/AuthGuard'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { MentorshipDashboard } from '@/components/mentorship/MentorshipDashboard'

export default function MentorshipPage() {
  const session = useAuthSessionStore((s) => s.session)
  const t = useTranslations('mentorship')

  return (
    <AuthGuard>
      <div className="p-6">
        <h1 className="text-2xl font-semibold mb-6">{t('pageTitle')}</h1>
        {session ? (
          <MentorshipDashboard currentUserId={session.userId} />
        ) : (
          <div className="animate-pulse h-8 w-32 bg-gray-200 rounded" />
        )}
      </div>
    </AuthGuard>
  )
}
