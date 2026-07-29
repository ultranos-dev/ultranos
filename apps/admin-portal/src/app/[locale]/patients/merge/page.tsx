'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { trpc } from '@/lib/trpc'
import { PatientComparisonTable } from '@/components/patients/PatientComparisonTable'
import { MergePreview } from '@/components/patients/MergePreview'
import { Check, Users } from '@ultranos/ui-kit/icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SearchInput } from '@/components/ui/search-input'
import { EmptyState } from '@/components/ui/empty-state'

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
    <div className="rounded-xl bg-card p-5 border border-border">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="mt-2 text-lg font-semibold text-foreground">
        {[patient.name_given, patient.name_father].filter(Boolean).join(' ') || 'Unknown'}
      </p>
      <div className="mt-3 space-y-1 text-sm text-muted-foreground">
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
  const t = useTranslations('patients')
  const _router = useRouter()
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
        setSurvivor(result.patient as unknown as Patient)
      } catch (err: unknown) {
        setError((err as Error)?.message ?? t('errorLoad'))
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
      const patients = result.patients as unknown as Patient[]
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
    } catch (err: unknown) {
      setError((err as Error)?.message ?? t('mergeError'))
    } finally {
      setMerging(false)
    }
  }

  // Success state
  if (mergeResult?.success && survivor) {
    return (
      <div className="flex flex-col gap-4">
          <div className="rounded-xl bg-card p-8 border border-border text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
              <Check className="h-8 w-8 text-success" />
            </div>
            <p className="mt-4 text-lg font-semibold text-foreground">{t('mergeSuccess')}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Merge audit ID: {mergeResult.mergeAuditId}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              This merge can be reversed within 72 hours.
            </p>
            <div className="mt-6 flex items-center justify-center gap-3">
              <Button asChild>
                <Link href={`/patients/${survivor.id}`}>View Survivor Record</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/patients">Back to Patients</Link>
              </Button>
            </div>
          </div>
        </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/patients" className="text-sm text-muted-foreground hover:text-foreground transition-colors">&larr; Back to Patients</Link>
          <h1 className="text-2xl font-semibold text-foreground">{t('mergePageTitle')}</h1>
        </div>

        {error && (
          <div className="rounded-2xl bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
        )}

        {/* Step indicator */}
        <div className="flex items-center gap-2 text-sm">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                  s === step
                    ? 'bg-primary text-primary-foreground'
                    : s < step
                      ? 'bg-success/10 text-success'
                      : 'bg-card border border-border text-muted-foreground'
                }`}
              >
                {s < step ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  s
                )}
              </span>
              <span className={`text-sm ${s === step ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
                {s === 1 ? t('mergeStep1') : s === 2 ? t('mergeStep2') : t('mergeStep3')}
              </span>
              {s < 3 && <span className="mx-2 h-px w-8 bg-border" />}
            </div>
          ))}
        </div>

        {/* ── Step 1: Select Patients ───────────────────────────── */}
        {step === 1 && (
          <div className="space-y-4">
            {/* Survivor */}
            <div>
              <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-3">{t('mergeSurvivorPatient')}</h3>
              {loadingSurvivor ? (
                <div className="text-sm text-muted-foreground">Loading survivor...</div>
              ) : survivor ? (
                <PatientCard patient={survivor} label="Survivor (will be kept)" />
              ) : (
                <div className="flex min-h-[12rem] items-center justify-center rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50">
                  <EmptyState
                    icon={Users}
                    title={t('mergeNoSurvivorTitle')}
                    description={t('mergeNoSurvivorDescription')}
                  />
                </div>
              )}
            </div>

            {/* Duplicate search */}
            {survivor && (
              <div>
                <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-3">{t('mergeFindDuplicate')}</h3>
                <SearchInput
                  placeholder={t('mergeSearchPlaceholder')}
                  value={duplicateSearch}
                  onChange={(e) => setDuplicateSearch(e.target.value)}
                  className="w-full max-w-md"
                  aria-label="Search for duplicate patient"
                />

                {searchLoading && (
                  <div className="mt-2 text-sm text-muted-foreground">Searching...</div>
                )}

                {duplicateResults.length > 0 && !duplicate && (
                  <div className="mt-3 space-y-2">
                    {duplicateResults.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => setDuplicate(p)}
                        className="w-full text-start rounded-xl border border-border bg-card p-4 hover:bg-primary/5 transition-colors"
                      >
                        <p className="text-sm font-medium text-foreground">{formatName(p)}</p>
                        <p className="text-xs text-muted-foreground">
                          {p.gender ?? '-'} | Birth: {p.birth_year ?? '-'} | District: {p.address_district_origin ?? '-'}
                        </p>
                      </button>
                    ))}
                  </div>
                )}

                {duplicate && (
                  <div className="mt-3">
                    <PatientCard patient={duplicate} label="Duplicate (will be deactivated)" />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDuplicate(null)}
                      className="mt-2"
                    >
                      Change selection
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Proceed to step 2 */}
            {survivor && duplicate && (
              <div className="flex gap-3">
                <Button onClick={proceedToStep2}>
                  {t('mergeContinueToFields')}
                </Button>
              </div>
            )}
          </div>
        )}

        {/* ── Step 2: Field Resolution ──────────────────────────── */}
        {step === 2 && survivor && duplicate && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
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
              <Button variant="outline" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button onClick={() => setStep(3)} disabled={!allResolved}>
                {t('mergeContinueToPreview')}
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 3: Preview & Confirm ─────────────────────────── */}
        {step === 3 && survivor && duplicate && (
          <div className="space-y-4">
            <MergePreview
              survivorName={formatName(survivor)}
              duplicateName={formatName(duplicate)}
              resolutions={resolutions}
              fields={MERGE_FIELDS}
            />

            {/* Confirmation input */}
            <div className="rounded-xl bg-card p-5 border border-border">
              <p className="text-sm text-muted-foreground">
                Type <span className="font-mono font-semibold text-foreground">MERGE</span> below to confirm this operation.
              </p>
              <Input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={t('mergeTypeToConfirm')}
                className="mt-3 w-full max-w-xs"
                aria-label="Type MERGE to confirm"
              />
            </div>

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep(2)}>
                Back
              </Button>
              <Button
                variant="destructive"
                onClick={handleMerge}
                disabled={confirmText !== 'MERGE' || merging}
              >
                {merging ? '…' : t('mergeConfirmButton')}
              </Button>
            </div>
          </div>
        )}
      </div>
  )
}
