'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { trpc } from '@/lib/trpc'
import { TopHeader } from '@/components/TopHeader'
import { PatientComparisonTable } from '@/components/patients/PatientComparisonTable'
import { MergePreview } from '@/components/patients/MergePreview'
import { Check } from '@ultranos/ui-kit/icons'

interface Patient {
  id: string
  name_given: string | null
  name_father: string | null
  name_grandfather: string | null
  gender: string | null
  birth_year: number | null
  address_district_origin: string | null
  address_province_origin: string | null
  mpi_score: number | null
  mpi_warn: boolean | null
  patient_tier: string | null
  is_active: boolean
  created_at: string | null
}

const MERGE_FIELDS = [
  'name_given',
  'name_father',
  'name_grandfather',
  'gender',
  'birth_year',
  'address_district_origin',
  'address_province_origin',
]

function PatientCard({ patient, label }: { patient: Patient; label: string }) {
  return (
    <div className="rounded-3xl bg-white p-5 border border-border">
      <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide">{label}</p>
      <p className="mt-2 text-lg font-semibold text-text-primary">
        {[patient.name_given, patient.name_father].filter(Boolean).join(' ') || 'Unknown'}
      </p>
      <div className="mt-3 space-y-1 text-sm text-text-muted">
        <p>Gender: {patient.gender ?? '-'}</p>
        <p>Birth Year: {patient.birth_year ?? '-'}</p>
        <p>District: {patient.address_district_origin ?? '-'}</p>
        <p>Province: {patient.address_province_origin ?? '-'}</p>
        <p>MPI Score: {patient.mpi_score ?? '-'}</p>
      </div>
    </div>
  )
}

function formatName(p: Patient): string {
  return [p.name_given, p.name_father].filter(Boolean).join(' ') || 'Unknown'
}

export default function MergeWizardPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const survivorIdParam = searchParams.get('survivor')

  // Wizard step
  const [step, setStep] = useState(1)

  // Step 1: patient selection
  const [survivor, setSurvivor] = useState<Patient | null>(null)
  const [duplicate, setDuplicate] = useState<Patient | null>(null)
  const [duplicateSearch, setDuplicateSearch] = useState('')
  const [duplicateResults, setDuplicateResults] = useState<Patient[]>([])
  const [searchLoading, setSearchLoading] = useState(false)

  // Step 2: field resolutions
  const [resolutions, setResolutions] = useState<Record<string, 'survivor' | 'duplicate'>>({})

  // Step 3: confirm
  const [confirmText, setConfirmText] = useState('')
  const [merging, setMerging] = useState(false)
  const [mergeResult, setMergeResult] = useState<{ success: boolean; mergeAuditId: string } | null>(null)

  // Shared
  const [error, setError] = useState<string | null>(null)
  const [loadingSurvivor, setLoadingSurvivor] = useState(false)

  // Load survivor from URL param
  useEffect(() => {
    if (!survivorIdParam) return
    async function loadSurvivor() {
      try {
        setLoadingSurvivor(true)
        setError(null)
        const result = await trpc.patientAdmin.getById.query({ patientId: survivorIdParam! })
        setSurvivor(result.patient as Patient)
      } catch (err: any) {
        setError(err?.message ?? 'Failed to load survivor patient')
      } finally {
        setLoadingSurvivor(false)
      }
    }
    loadSurvivor()
  }, [survivorIdParam])

  // Search for duplicate
  const searchDuplicates = useCallback(async () => {
    if (!duplicateSearch.trim()) {
      setDuplicateResults([])
      return
    }
    try {
      setSearchLoading(true)
      const result = await trpc.patientAdmin.adminSearch.query({
        query: duplicateSearch.trim(),
        includeInactive: false,
        limit: 10,
      })
      const patients = result.patients as Patient[]
      // Exclude survivor from results
      setDuplicateResults(patients.filter((p) => p.id !== survivor?.id))
    } catch {
      // Silently handle search errors in the duplicate picker
      setDuplicateResults([])
    } finally {
      setSearchLoading(false)
    }
  }, [duplicateSearch, survivor?.id])

  useEffect(() => {
    const timer = setTimeout(searchDuplicates, 400)
    return () => clearTimeout(timer)
  }, [searchDuplicates])

  // Initialize resolutions to all 'survivor' when entering step 2
  function proceedToStep2() {
    const initial: Record<string, 'survivor' | 'duplicate'> = {}
    for (const field of MERGE_FIELDS) {
      initial[field] = 'survivor'
    }
    setResolutions(initial)
    setStep(2)
  }

  function handleResolve(field: string, source: 'survivor' | 'duplicate') {
    setResolutions((prev) => ({ ...prev, [field]: source }))
  }

  // All fields must be resolved to proceed
  const allResolved = MERGE_FIELDS.every((f) => resolutions[f] !== undefined)

  async function handleMerge() {
    if (!survivor || !duplicate) return
    try {
      setMerging(true)
      setError(null)
      const result = await trpc.patientAdmin.merge.mutate({
        survivorId: survivor.id,
        duplicateId: duplicate.id,
        fieldResolutions: resolutions,
      })
      setMergeResult(result)
    } catch (err: any) {
      setError(err?.message ?? 'Merge failed')
    } finally {
      setMerging(false)
    }
  }

  // Success state
  if (mergeResult?.success && survivor) {
    return (
      <>
        <TopHeader title="Merge Complete" description="The patients have been merged successfully." />
        <div className="mx-auto max-w-7xl px-8 py-6">
          <div className="rounded-3xl bg-white p-8 border border-border text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success-subtle">
              <Check className="h-8 w-8 text-success" />
            </div>
            <p className="mt-4 text-lg font-semibold text-text-primary">Patients merged successfully</p>
            <p className="mt-1 text-sm text-text-muted">
              Merge audit ID: {mergeResult.mergeAuditId}
            </p>
            <p className="mt-1 text-sm text-text-muted">
              This merge can be reversed within 72 hours.
            </p>
            <div className="mt-6 flex items-center justify-center gap-3">
              <Link
                href={`/patients/${survivor.id}`}
                className="rounded-full bg-brand-lime px-5 py-2 text-sm font-semibold text-black hover:bg-brand-lime/90 transition-colors"
              >
                View Survivor Record
              </Link>
              <Link
                href="/patients"
                className="rounded-full border border-border px-4 py-1.5 text-sm font-medium hover:bg-surface transition-colors"
              >
                Back to Patients
              </Link>
            </div>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <TopHeader title="Merge Patients" description="Combine duplicate patient records into one." />
      <div className="mx-auto max-w-7xl px-8 py-6">
        <Link href="/patients" className="text-sm text-text-secondary hover:text-text-primary transition-colors">&larr; Back to Patients</Link>

        {error && (
          <div className="mt-4 rounded-2xl bg-danger-subtle p-3 text-sm text-danger">{error}</div>
        )}

        {/* Step indicator */}
        <div className="mt-6 flex items-center gap-2 text-sm">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                  s === step
                    ? 'bg-brand-lime text-black'
                    : s < step
                      ? 'bg-success-subtle text-success'
                      : 'bg-surface border border-border text-text-muted'
                }`}
              >
                {s < step ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  s
                )}
              </span>
              <span className={`text-sm ${s === step ? 'font-semibold text-text-primary' : 'text-text-muted'}`}>
                {s === 1 ? 'Select Patients' : s === 2 ? 'Resolve Fields' : 'Preview & Confirm'}
              </span>
              {s < 3 && <span className="mx-2 h-px w-8 bg-border" />}
            </div>
          ))}
        </div>

        {/* ── Step 1: Select Patients ───────────────────────────── */}
        {step === 1 && (
          <div className="mt-6 space-y-6">
            {/* Survivor */}
            <div>
              <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wide mb-3">Survivor Patient</h3>
              {loadingSurvivor ? (
                <div className="text-sm text-text-secondary">Loading survivor...</div>
              ) : survivor ? (
                <PatientCard patient={survivor} label="Survivor (will be kept)" />
              ) : (
                <div className="rounded-3xl border border-dashed border-border bg-white p-6 text-center">
                  <p className="text-sm text-text-muted">
                    No survivor selected. Navigate from a patient detail page or provide a <code className="text-xs bg-surface rounded px-1">?survivor=</code> URL parameter.
                  </p>
                </div>
              )}
            </div>

            {/* Duplicate search */}
            {survivor && (
              <div>
                <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wide mb-3">Find Duplicate</h3>
                <input
                  type="text"
                  placeholder="Search by name to find duplicate..."
                  value={duplicateSearch}
                  onChange={(e) => setDuplicateSearch(e.target.value)}
                  className="w-full max-w-md rounded-xl border border-border px-4 py-2.5 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
                  aria-label="Search for duplicate patient"
                />

                {searchLoading && (
                  <div className="mt-2 text-sm text-text-secondary">Searching...</div>
                )}

                {duplicateResults.length > 0 && !duplicate && (
                  <div className="mt-3 space-y-2">
                    {duplicateResults.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => setDuplicate(p)}
                        className="w-full text-start rounded-2xl border border-border bg-white p-4 hover:bg-brand-lime/5 transition-colors"
                      >
                        <p className="text-sm font-medium text-text-primary">{formatName(p)}</p>
                        <p className="text-xs text-text-muted">
                          {p.gender ?? '-'} | Birth: {p.birth_year ?? '-'} | District: {p.address_district_origin ?? '-'}
                        </p>
                      </button>
                    ))}
                  </div>
                )}

                {duplicate && (
                  <div className="mt-3">
                    <PatientCard patient={duplicate} label="Duplicate (will be deactivated)" />
                    <button
                      onClick={() => setDuplicate(null)}
                      className="mt-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
                    >
                      Change selection
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Proceed to step 2 */}
            {survivor && duplicate && (
              <div className="flex gap-3">
                <button
                  onClick={proceedToStep2}
                  className="rounded-full bg-brand-lime px-5 py-2 text-sm font-semibold text-black hover:bg-brand-lime/90 transition-colors"
                >
                  Continue to Field Resolution
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Step 2: Field Resolution ──────────────────────────── */}
        {step === 2 && survivor && duplicate && (
          <div className="mt-6 space-y-6">
            <p className="text-sm text-text-secondary">
              For each field, choose whether to keep the survivor&apos;s value or use the duplicate&apos;s value.
              Fields with different values are highlighted.
            </p>

            <PatientComparisonTable
              survivor={survivor as unknown as Record<string, unknown>}
              duplicate={duplicate as unknown as Record<string, unknown>}
              fields={MERGE_FIELDS}
              resolutions={resolutions}
              onResolve={handleResolve}
            />

            <div className="flex gap-3">
              <button
                onClick={() => setStep(1)}
                className="rounded-full border border-border px-4 py-1.5 text-sm font-medium hover:bg-surface transition-colors"
              >
                Back
              </button>
              <button
                onClick={() => setStep(3)}
                disabled={!allResolved}
                className="rounded-full bg-brand-lime px-5 py-2 text-sm font-semibold text-black disabled:opacity-50 hover:bg-brand-lime/90 transition-colors"
              >
                Continue to Preview
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: Preview & Confirm ─────────────────────────── */}
        {step === 3 && survivor && duplicate && (
          <div className="mt-6 space-y-6">
            <MergePreview
              survivorName={formatName(survivor)}
              duplicateName={formatName(duplicate)}
              resolutions={resolutions}
              fields={MERGE_FIELDS}
            />

            {/* Confirmation input */}
            <div className="rounded-3xl bg-white p-5 border border-border">
              <p className="text-sm text-text-secondary">
                Type <span className="font-mono font-semibold text-text-primary">MERGE</span> below to confirm this operation.
              </p>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder='Type "MERGE" to confirm'
                className="mt-3 w-full max-w-xs rounded-xl border border-border px-4 py-2.5 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
                aria-label="Type MERGE to confirm"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep(2)}
                className="rounded-full border border-border px-4 py-1.5 text-sm font-medium hover:bg-surface transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleMerge}
                disabled={confirmText !== 'MERGE' || merging}
                className="rounded-full border border-danger/30 bg-danger-subtle px-6 py-2.5 text-sm font-semibold text-danger disabled:opacity-50 hover:bg-danger-subtle/80 transition-colors"
              >
                {merging ? 'Merging...' : 'Confirm Merge'}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
