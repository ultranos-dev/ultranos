'use client'

import { useTranslations } from 'next-intl'
import { PatientQueueManager } from '@/components/queue/PatientQueueManager'

export default function QueuePage() {
  const t = useTranslations('patientQueue')

  return (
    <div className="mx-auto max-w-3xl flex flex-col gap-4">
      <h1 className="text-2xl font-bold text-foreground mb-4">
        {t('title')}
      </h1>
      <PatientQueueManager />
    </div>
  )
}
