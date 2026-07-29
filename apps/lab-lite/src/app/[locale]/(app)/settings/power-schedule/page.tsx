'use client'

import { useTranslations } from 'next-intl'
import { PowerScheduleForm } from '@/components/scheduler/PowerScheduleForm'
import { TestTimeConfigPanel } from '@/components/scheduler/TestTimeConfigPanel'
import Link from 'next/link'

export default function PowerSchedulePage() {
  const t = useTranslations('scheduler')

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link
          href="/settings"
          className="w-fit text-sm font-medium text-primary hover:underline"
        >
          &larr; {t('powerSchedule.title')}
        </Link>
      </div>

      <h1 className="text-2xl font-bold text-foreground">
        {t('nav.powerScheduling')}
      </h1>

      <div className="flex flex-col gap-4">
        <PowerScheduleForm />
        <TestTimeConfigPanel />
      </div>
    </div>
  )
}
