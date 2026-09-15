'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { AppToaster, notify } from '@ultranos/ui-kit/components/ui/app-toaster'
import { sourceAppIcon, sourceAppNameKey, deriveSourceApp } from '@ultranos/ui-kit/notification-presentation'
import { useNotificationPoll } from '@/lib/use-notification-poll'

/**
 * Mounts the global toast container (once, in the app shell) and fires a toast
 * for every notification that arrives after the initial page load.
 *
 * The first poll seeds seenIds so the existing backlog does NOT produce toasts.
 * Only genuinely new arrivals (present in a subsequent poll but absent from
 * seenIds) trigger notify().
 *
 * Task 11 — notification presentation enrichment.
 */
export function NotificationToaster() {
  const router = useRouter()
  const tNotif = useTranslations('notifications')
  const { newNotifications } = useNotificationPoll()

  useEffect(() => {
    for (const n of newNotifications) {
      const app = n.sourceApp ?? deriveSourceApp(n.type)
      const appName = tNotif(sourceAppNameKey(app) as Parameters<typeof tNotif>[0])
      const subject = tNotif(
        (`subject.${n.subjectKey ?? n.type}`) as Parameters<typeof tNotif>[0],
      )
      notify({
        icon: sourceAppIcon(app),
        appName,
        subject,
        urgent: n.type === 'LAB_RESULT_ESCALATION',
        onClick: () => router.push('/notifications'),
        actionLabel: tNotif('viewDetails' as Parameters<typeof tNotif>[0]),
      })
    }
  }, [newNotifications, router, tNotif])

  return <AppToaster />
}
