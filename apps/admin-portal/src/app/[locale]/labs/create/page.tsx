'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function CreateLabPage() {
  const router = useRouter()
  const t = useTranslations('labs')
  const tCommon = useTranslations('common')
  const [labName, setLabName] = useState('')
  const [licenseRef, setLicenseRef] = useState('')
  const [accreditationRef, setAccreditationRef] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = labName.trim() !== '' && licenseRef.trim() !== '' && !submitting

  async function handleSubmit() {
    if (!canSubmit) return
    try {
      setSubmitting(true)
      setError(null)
      await trpc.admin.createLab.mutate({
        labName: labName.trim(),
        licenseRef: licenseRef.trim(),
        ...(accreditationRef.trim() && { accreditationRef: accreditationRef.trim() }),
      })
      router.push('/labs')
    } catch (err: unknown) {
      setError((err as Error)?.message ?? t('createError'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl flex flex-col gap-4">
        <Button variant="outline" onClick={() => router.push('/labs')}>
          {t('backToLabs')}
        </Button>

        <div className="rounded-2xl border border-border bg-popover p-6 flex flex-col gap-4">
          <div>
            <label
              htmlFor="lab-name"
              className="block text-sm font-medium text-muted-foreground mb-1"
            >
              {t('labName')} <span className="text-destructive">*</span>
            </label>
            <Input
              id="lab-name"
              aria-label={t('labName')}
              type="text"
              value={labName}
              onChange={(e) => setLabName(e.target.value)}
              placeholder={t('labNamePlaceholder')}
            />
          </div>

          <div>
            <label
              htmlFor="license-ref"
              className="block text-sm font-medium text-muted-foreground mb-1"
            >
              {t('licenseRef')} <span className="text-destructive">*</span>
            </label>
            <Input
              id="license-ref"
              aria-label={t('licenseRef')}
              type="text"
              value={licenseRef}
              onChange={(e) => setLicenseRef(e.target.value)}
              placeholder={t('licenseRefPlaceholder')}
            />
          </div>

          <div>
            <label
              htmlFor="accreditation-ref"
              className="block text-sm font-medium text-muted-foreground mb-1"
            >
              {t('accreditationRef')}{' '}
              <span className="text-muted-foreground text-xs font-normal">(optional)</span>
            </label>
            <Input
              id="accreditation-ref"
              aria-label={t('accreditationRef')}
              type="text"
              value={accreditationRef}
              onChange={(e) => setAccreditationRef(e.target.value)}
              placeholder="e.g. ACCR-ISO15189-001"
            />
          </div>

          {error && (
            <div role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => router.push('/labs')}>
              {tCommon('cancel')}
            </Button>
            <Button onClick={handleSubmit} disabled={!canSubmit}>
              {submitting ? t('creating') : t('createPageTitle')}
            </Button>
          </div>
        </div>
      </div>
  )
}
