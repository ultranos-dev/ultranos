'use client'

/**
 * Story 42.5 — Authorization Queue Page
 * Task 9: Route guard + renders the AuthorizationQueue component.
 * Only accessible to SENIOR_TECH, SUPERVISOR, and LAB_MANAGER.
 */
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { AuthorizationQueue } from '@/components/authorization/AuthorizationQueue'
import { canAccessAuthorizationQueue } from '@/lib/permissions'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { LabRole } from '@ultranos/shared-types'

export default function AuthorizationQueuePage() {
  const t = useTranslations('authorization')
  const router = useRouter()
  const session = useAuthSessionStore((s) => s.session)
  const labRole = session?.labRole as LabRole | null

  useEffect(() => {
    // Redirect to dashboard if the user lacks authorization permissions
    if (session !== null && labRole !== null) {
      if (!canAccessAuthorizationQueue(labRole)) {
        router.replace('/')
      }
    }
  }, [session, labRole, router])

  // While session is resolving or role check pending, render nothing to avoid flash
  if (!session || !labRole || !canAccessAuthorizationQueue(labRole)) {
    return null
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {t('queueTitle')}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('queueSubtitle')}
          </p>
        </div>
      </div>
      <AuthorizationQueue />
    </div>
  )
}
