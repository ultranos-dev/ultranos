'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { trpc } from '@/lib/trpc'
import { TopHeader } from '@/components/TopHeader'

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

function MpiWarnBadge({ warn }: { warn: boolean | null }) {
  if (!warn) return <span className="text-xs font-medium text-text-muted">-</span>
  return (
    <span className="inline-block rounded-full bg-warning-subtle px-2.5 py-0.5 text-xs font-medium text-warning">
      Warning
    </span>
  )
}

function StatusBadge({ active }: { active: boolean }) {
  if (active) {
    return (
      <span className="inline-block rounded-full bg-success-subtle px-2.5 py-0.5 text-xs font-medium text-success">
        Active
      </span>
    )
  }
  return (
    <span className="inline-block rounded-full bg-danger-subtle px-2.5 py-0.5 text-xs font-medium text-danger">
      Inactive
    </span>
  )
}

const PAGE_SIZE = 20

export default function PatientsPage() {
  const router = useRouter()
  const [patients, setPatients] = useState<Patient[]>([])
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [mpiWarnOnly, setMpiWarnOnly] = useState(false)
  const [includeInactive, setIncludeInactive] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)

  const fetchPatients = useCallback(async () => {
    if (!search.trim()) {
      setPatients([])
      setHasMore(false)
      return
    }
    try {
      setLoading(true)
      setError(null)
      const offset = (page - 1) * PAGE_SIZE
      const result = await trpc.patientAdmin.adminSearch.query({
        query: search.trim(),
        mpiWarnOnly: mpiWarnOnly || undefined,
        includeInactive: includeInactive || undefined,
        limit: PAGE_SIZE + 1,
        offset,
      })
      const fetched = result.patients as Patient[]
      if (fetched.length > PAGE_SIZE) {
        setHasMore(true)
        setPatients(fetched.slice(0, PAGE_SIZE))
      } else {
        setHasMore(false)
        setPatients(fetched)
      }
    } catch (err: any) {
      setError(err?.message ?? 'Failed to search patients')
    } finally {
      setLoading(false)
    }
  }, [search, page, mpiWarnOnly, includeInactive])

  useEffect(() => {
    fetchPatients()
  }, [fetchPatients])

  function handleSearchChange(value: string) {
    setSearch(value)
    setPage(1)
  }

  function handleMpiWarnToggle() {
    setMpiWarnOnly((prev) => !prev)
    setPage(1)
  }

  function handleIncludeInactiveToggle() {
    setIncludeInactive((prev) => !prev)
    setPage(1)
  }

  function formatName(p: Patient): string {
    return [p.name_given, p.name_father].filter(Boolean).join(' ') || 'Unknown'
  }

  return (
    <>
      <TopHeader title="Patients" description="Search and manage patient records." />
      <div className="mx-auto max-w-7xl px-8 py-6">
        {/* Top bar: search + filters */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Search input */}
            <input
              type="text"
              placeholder="Search by name..."
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="w-72 rounded-full border border-border bg-surface px-4 py-1.5 text-sm text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-accent"
              aria-label="Search patients"
            />

            {/* MPI Warnings Only checkbox */}
            <label className="flex items-center gap-1.5 text-sm text-text-secondary cursor-pointer">
              <input
                type="checkbox"
                checked={mpiWarnOnly}
                onChange={handleMpiWarnToggle}
                className="h-4 w-4 rounded border-border text-accent focus:ring-accent/30"
              />
              MPI Warnings Only
            </label>

            {/* Include Inactive checkbox */}
            <label className="flex items-center gap-1.5 text-sm text-text-secondary cursor-pointer">
              <input
                type="checkbox"
                checked={includeInactive}
                onChange={handleIncludeInactiveToggle}
                className="h-4 w-4 rounded border-border text-accent focus:ring-accent/30"
              />
              Include Inactive
            </label>
          </div>

          <Link
            href="/patients/merge"
            className="rounded-full bg-brand-lime px-5 py-2 text-sm font-semibold text-black hover:bg-brand-lime/90 transition-colors"
          >
            Merge Patients
          </Link>
        </div>

        {error && (
          <div className="mt-4 rounded-2xl bg-danger-subtle p-3 text-sm text-danger">{error}</div>
        )}

        {!search.trim() && !loading ? (
          <div className="mt-6 rounded-3xl border border-border bg-white p-12 text-center">
            <p className="text-lg font-medium text-text-primary">Search for patients</p>
            <p className="mt-1 text-sm text-text-muted">
              Enter a name to begin searching patient records.
            </p>
          </div>
        ) : loading ? (
          <div className="mt-6 text-text-secondary">Searching patients...</div>
        ) : patients.length === 0 ? (
          <div className="mt-6 rounded-3xl border border-border bg-white p-12 text-center">
            <p className="text-lg font-medium text-text-primary">No patients found</p>
            <p className="mt-1 text-sm text-text-muted">
              Try a different search term or adjust filters.
            </p>
          </div>
        ) : (
          <>
            {/* Patients table */}
            <div className="mt-4 overflow-hidden rounded-2xl border border-border">
              <table className="w-full text-sm">
                <thead className="bg-black">
                  <tr>
                    <th className="px-4 py-3 text-start font-medium text-white text-xs uppercase tracking-wide">Name</th>
                    <th className="px-4 py-3 text-start font-medium text-white text-xs uppercase tracking-wide">Gender</th>
                    <th className="px-4 py-3 text-start font-medium text-white text-xs uppercase tracking-wide">Birth Year</th>
                    <th className="px-4 py-3 text-start font-medium text-white text-xs uppercase tracking-wide">District</th>
                    <th className="px-4 py-3 text-start font-medium text-white text-xs uppercase tracking-wide">MPI Score</th>
                    <th className="px-4 py-3 text-start font-medium text-white text-xs uppercase tracking-wide">MPI Warn</th>
                    <th className="px-4 py-3 text-start font-medium text-white text-xs uppercase tracking-wide">Status</th>
                    <th className="px-4 py-3 text-start font-medium text-white text-xs uppercase tracking-wide">Tier</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-surface-raised">
                  {patients.map((patient) => (
                    <tr
                      key={patient.id}
                      onClick={() => router.push(`/patients/${patient.id}`)}
                      className="cursor-pointer transition-colors hover:bg-brand-lime/5"
                    >
                      <td className="px-4 py-3 font-medium text-text-primary">
                        <Link
                          href={`/patients/${patient.id}`}
                          className="hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {formatName(patient)}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-text-muted">{patient.gender ?? '-'}</td>
                      <td className="px-4 py-3 text-text-muted">{patient.birth_year ?? '-'}</td>
                      <td className="px-4 py-3 text-text-muted">{patient.address_district_origin ?? '-'}</td>
                      <td className="px-4 py-3 text-text-muted">{patient.mpi_score != null ? patient.mpi_score : '-'}</td>
                      <td className="px-4 py-3"><MpiWarnBadge warn={patient.mpi_warn} /></td>
                      <td className="px-4 py-3"><StatusBadge active={patient.is_active} /></td>
                      <td className="px-4 py-3 text-text-muted">{patient.patient_tier ?? '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="mt-4 flex items-center justify-between text-sm text-text-secondary">
              <span>
                Showing {(page - 1) * PAGE_SIZE + 1}&ndash;{(page - 1) * PAGE_SIZE + patients.length}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page === 1}
                  className="rounded-full border border-border px-4 py-1.5 text-sm font-medium disabled:opacity-50 hover:bg-surface hover:scale-[1.02] transition-transform duration-200"
                >
                  Previous
                </button>
                <span className="flex items-center px-2">Page {page}</span>
                <button
                  onClick={() => setPage(page + 1)}
                  disabled={!hasMore}
                  className="rounded-full border border-border px-4 py-1.5 text-sm font-medium disabled:opacity-50 hover:bg-surface hover:scale-[1.02] transition-transform duration-200"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  )
}
