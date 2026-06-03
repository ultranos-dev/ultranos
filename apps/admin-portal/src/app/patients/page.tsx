'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { trpc } from '@/lib/trpc'
import { TopHeader } from '@/components/TopHeader'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

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
  if (!warn) return <span className="text-xs font-medium text-muted-foreground">-</span>
  return <Badge variant="warning">Warning</Badge>
}

function StatusBadge({ active }: { active: boolean }) {
  if (active) return <Badge variant="success">Active</Badge>
  return <Badge variant="destructive">Inactive</Badge>
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
              className="w-72 rounded-full border border-border bg-card px-4 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              aria-label="Search patients"
            />

            {/* MPI Warnings Only checkbox */}
            <label className="flex items-center gap-1.5 text-sm text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={mpiWarnOnly}
                onChange={handleMpiWarnToggle}
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary/30"
              />
              MPI Warnings Only
            </label>

            {/* Include Inactive checkbox */}
            <label className="flex items-center gap-1.5 text-sm text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={includeInactive}
                onChange={handleIncludeInactiveToggle}
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary/30"
              />
              Include Inactive
            </label>
          </div>

          <Button asChild>
            <Link href="/patients/merge">Merge Patients</Link>
          </Button>
        </div>

        {error && (
          <div className="mt-4 rounded-2xl bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
        )}

        {!search.trim() && !loading ? (
          <div className="mt-6 rounded-3xl border border-border bg-card p-12 text-center">
            <p className="text-lg font-medium text-foreground">Search for patients</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Enter a name to begin searching patient records.
            </p>
          </div>
        ) : loading ? (
          <div className="mt-6 text-muted-foreground">Searching patients...</div>
        ) : patients.length === 0 ? (
          <div className="mt-6 rounded-3xl border border-border bg-card p-12 text-center">
            <p className="text-lg font-medium text-foreground">No patients found</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Try a different search term or adjust filters.
            </p>
          </div>
        ) : (
          <>
            {/* Patients table */}
            <div className="mt-4 overflow-hidden rounded-2xl border border-border">
              <table className="w-full text-sm">
                <thead className="bg-card">
                  <tr>
                    <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">Name</th>
                    <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">Gender</th>
                    <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">Birth Year</th>
                    <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">District</th>
                    <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">MPI Score</th>
                    <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">MPI Warn</th>
                    <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">Status</th>
                    <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">Tier</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-popover">
                  {patients.map((patient) => (
                    <tr
                      key={patient.id}
                      onClick={() => router.push(`/patients/${patient.id}`)}
                      className="cursor-pointer transition-colors hover:bg-primary/5"
                    >
                      <td className="px-4 py-3 font-medium text-foreground">
                        <Link
                          href={`/patients/${patient.id}`}
                          className="hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {formatName(patient)}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{patient.gender ?? '-'}</td>
                      <td className="px-4 py-3 text-muted-foreground">{patient.birth_year ?? '-'}</td>
                      <td className="px-4 py-3 text-muted-foreground">{patient.address_district_origin ?? '-'}</td>
                      <td className="px-4 py-3 text-muted-foreground">{patient.mpi_score != null ? patient.mpi_score : '-'}</td>
                      <td className="px-4 py-3"><MpiWarnBadge warn={patient.mpi_warn} /></td>
                      <td className="px-4 py-3"><StatusBadge active={patient.is_active} /></td>
                      <td className="px-4 py-3 text-muted-foreground">{patient.patient_tier ?? '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
              <span>
                Showing {(page - 1) * PAGE_SIZE + 1}&ndash;{(page - 1) * PAGE_SIZE + patients.length}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page === 1}
                >
                  Previous
                </Button>
                <span className="flex items-center px-2">Page {page}</span>
                <Button
                  variant="outline"
                  onClick={() => setPage(page + 1)}
                  disabled={!hasMore}
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  )
}
