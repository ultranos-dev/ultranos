'use client'

import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/Button'

interface ReviewStepProps {
  patientFirstName: string
  patientAge: number
  loincDisplay: string
  fileName: string
  fileSize: number
  collectionDate: string
  onSubmit: () => void
  submitting: boolean
  error: string | null
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function ReviewStep({
  patientFirstName,
  patientAge,
  loincDisplay,
  fileName,
  fileSize,
  collectionDate,
  onSubmit,
  submitting,
  error,
}: ReviewStepProps) {
  const t = useTranslations('results')

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-neutral-900">{t('reviewTitle')}</h2>

      <dl className="divide-y divide-neutral-100 rounded-lg border border-neutral-200 bg-white">
        <div className="flex justify-between px-4 py-3">
          <dt className="text-sm font-medium text-neutral-500">{t('patient')}</dt>
          <dd className="text-sm text-neutral-900">{t('patientValue', { firstName: patientFirstName, age: patientAge })}</dd>
        </div>
        <div className="flex justify-between px-4 py-3">
          <dt className="text-sm font-medium text-neutral-500">{t('testCategory')}</dt>
          <dd className="text-sm text-neutral-900">{loincDisplay}</dd>
        </div>
        <div className="flex justify-between px-4 py-3">
          <dt className="text-sm font-medium text-neutral-500">{t('file')}</dt>
          <dd className="text-sm text-neutral-900">{t('fileValue', { fileName, fileSize: formatFileSize(fileSize) })}</dd>
        </div>
        <div className="flex justify-between px-4 py-3">
          <dt className="text-sm font-medium text-neutral-500">{t('collectionDate')}</dt>
          <dd className="text-sm text-neutral-900">{collectionDate}</dd>
        </div>
      </dl>

      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}

      <Button
        variant="primary"
        type="submit"
        onClick={onSubmit}
        disabled={submitting}
      >
        {submitting ? t('submitting') : t('confirmSubmit')}
      </Button>
    </div>
  )
}
