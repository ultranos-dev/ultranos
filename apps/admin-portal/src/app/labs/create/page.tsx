'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { trpc } from '@/lib/trpc'
import { TopHeader } from '@/components/TopHeader'

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
        <button
          onClick={() => router.push('/labs')}
          className="text-sm text-text-secondary hover:text-text-primary transition-colors"
        >
          &larr; Back to Labs
        </button>

        <div className="mt-6 rounded-2xl border border-border bg-surface-raised p-6">
          <div className="space-y-5">
            <div>
              <label
                htmlFor="lab-name"
                className="block text-sm font-medium text-text-secondary mb-1"
              >
                Lab Name <span className="text-danger">*</span>
              </label>
              <input
                id="lab-name"
                aria-label="Lab Name"
                type="text"
                value={labName}
                onChange={(e) => setLabName(e.target.value)}
                placeholder="e.g. Central Diagnostics Lab"
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>

            <div>
              <label
                htmlFor="license-ref"
                className="block text-sm font-medium text-text-secondary mb-1"
              >
                License Reference <span className="text-danger">*</span>
              </label>
              <input
                id="license-ref"
                aria-label="License Reference"
                type="text"
                value={licenseRef}
                onChange={(e) => setLicenseRef(e.target.value)}
                placeholder="e.g. LIC-2026-001"
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>

            <div>
              <label
                htmlFor="accreditation-ref"
                className="block text-sm font-medium text-text-secondary mb-1"
              >
                Accreditation Reference{' '}
                <span className="text-text-muted text-xs font-normal">(optional)</span>
              </label>
              <input
                id="accreditation-ref"
                aria-label="Accreditation Reference"
                type="text"
                value={accreditationRef}
                onChange={(e) => setAccreditationRef(e.target.value)}
                placeholder="e.g. ACCR-ISO15189-001"
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>
          </div>

          {error && (
            <div className="mt-4 rounded-xl bg-danger-subtle p-3 text-sm text-danger">
              {error}
            </div>
          )}

          <div className="mt-6 flex justify-end gap-3">
            <button
              onClick={() => router.push('/labs')}
              className="rounded-full border border-border px-6 py-2.5 text-sm text-text-primary hover:bg-surface hover:scale-[1.02] transition-transform duration-200"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="rounded-full bg-brand-lime px-6 py-2.5 text-sm font-semibold text-black disabled:opacity-50 hover:scale-[1.02] transition-transform duration-200"
            >
              {submitting ? 'Creating…' : 'Create Lab'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
