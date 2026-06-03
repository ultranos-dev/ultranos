'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { trpc } from '@/lib/trpc'
import { TopHeader } from '@/components/TopHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function CreateLabPage() {
  const router = useRouter()
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
    } catch (err: any) {
      setError(err?.message ?? 'Failed to create lab')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <TopHeader title="Create Lab" description="Register a new lab for your organisation." />
      <div className="mx-auto max-w-2xl px-8 py-6">
        <Button variant="outline" onClick={() => router.push('/labs')}>
          &larr; Back to Labs
        </Button>

        <div className="mt-6 rounded-2xl border border-border bg-popover p-6">
          <div className="space-y-5">
            <div>
              <label
                htmlFor="lab-name"
                className="block text-sm font-medium text-muted-foreground mb-1"
              >
                Lab Name <span className="text-destructive">*</span>
              </label>
              <Input
                id="lab-name"
                aria-label="Lab Name"
                type="text"
                value={labName}
                onChange={(e) => setLabName(e.target.value)}
                placeholder="e.g. Central Diagnostics Lab"
              />
            </div>

            <div>
              <label
                htmlFor="license-ref"
                className="block text-sm font-medium text-muted-foreground mb-1"
              >
                License Reference <span className="text-destructive">*</span>
              </label>
              <Input
                id="license-ref"
                aria-label="License Reference"
                type="text"
                value={licenseRef}
                onChange={(e) => setLicenseRef(e.target.value)}
                placeholder="e.g. LIC-2026-001"
              />
            </div>

            <div>
              <label
                htmlFor="accreditation-ref"
                className="block text-sm font-medium text-muted-foreground mb-1"
              >
                Accreditation Reference{' '}
                <span className="text-muted-foreground text-xs font-normal">(optional)</span>
              </label>
              <Input
                id="accreditation-ref"
                aria-label="Accreditation Reference"
                type="text"
                value={accreditationRef}
                onChange={(e) => setAccreditationRef(e.target.value)}
                placeholder="e.g. ACCR-ISO15189-001"
              />
            </div>
          </div>

          {error && (
            <div role="alert" className="mt-4 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="mt-6 flex justify-end gap-3">
            <Button variant="outline" onClick={() => router.push('/labs')}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={!canSubmit}>
              {submitting ? 'Creating…' : 'Create Lab'}
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}
