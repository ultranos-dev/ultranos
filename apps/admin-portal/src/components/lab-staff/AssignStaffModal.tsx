'use client'

import { useState, useEffect, useRef } from 'react'
import { trpc } from '@/lib/trpc'

type LabRole = 'LAB_TECH' | 'SENIOR_TECH' | 'SUPERVISOR' | 'LAB_MANAGER'

const LAB_ROLES: { value: LabRole; label: string }[] = [
  { value: 'LAB_TECH', label: 'Lab Tech' },
  { value: 'SENIOR_TECH', label: 'Senior Tech' },
  { value: 'SUPERVISOR', label: 'Supervisor' },
  { value: 'LAB_MANAGER', label: 'Lab Manager' },
]

interface LabOption {
  id: string
  labName: string
}

interface PractitionerResult {
  id: string
  name: string
  email: string
}

interface AssignStaffModalProps {
  /** Pre-fills and locks the lab field. Use from the per-lab staff page. */
  fixedLabId?: string
  /** Available labs for the dropdown. Use from the org-wide tab. */
  labs?: LabOption[]
  onAssigned: () => void
  onClose: () => void
}

export default function AssignStaffModal({
  fixedLabId,
  labs,
  onAssigned,
  onClose,
}: AssignStaffModalProps) {
  const [selectedLabId, setSelectedLabId] = useState(fixedLabId ?? '')
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<PractitionerResult[]>([])
  const [searching, setSearching] = useState(false)
  const [selectedPractitioner, setSelectedPractitioner] = useState<PractitionerResult | null>(null)
  const [selectedRole, setSelectedRole] = useState<LabRole>('LAB_TECH')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounced practitioner search
  useEffect(() => {
    if (search.length < 2) {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      setResults([])
      return
    }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      try {
        setSearching(true)
        const result = await trpc.admin.listUsers.query({ page: 1, pageSize: 8, search })
        setResults(
          result.users.map((u: { id: string; name: string; email: string }) => ({
            id: u.id,
            name: u.name,
            email: u.email,
          })),
        )
      } catch {
        // search errors are non-critical; just clear results
        setResults([])
      } finally {
        setSearching(false)
      }
    }, 300)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [search])

  const canSubmit = selectedLabId !== '' && selectedPractitioner !== null && !submitting

  async function handleSubmit() {
    if (!canSubmit || !selectedPractitioner) return
    try {
      setSubmitting(true)
      setError(null)
      await trpc.admin.assignStaffToLab.mutate({
        labId: selectedLabId,
        practitionerId: selectedPractitioner.id,
        initialRole: selectedRole,
      })
      onAssigned()
    } catch (err: any) {
      setError(err?.message ?? 'Failed to assign staff')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-surface-raised p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-text-primary">Assign Staff to Lab</h2>

        <div className="mt-4 space-y-4">
          {/* Lab selector — only shown in org-wide context */}
          {!fixedLabId && labs && (
            <div>
              <label
                htmlFor="assign-lab-select"
                className="block text-sm font-medium text-text-secondary mb-1"
              >
                Lab
              </label>
              <select
                id="assign-lab-select"
                aria-label="Lab"
                value={selectedLabId}
                onChange={(e) => setSelectedLabId(e.target.value)}
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
              >
                <option value="">Select a lab…</option>
                {labs.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.labName}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Practitioner search */}
          <div>
            <label
              htmlFor="assign-practitioner-search"
              className="block text-sm font-medium text-text-secondary mb-1"
            >
              Practitioner
            </label>
            <input
              id="assign-practitioner-search"
              type="text"
              placeholder="Search by name or email..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setSelectedPractitioner(null)
              }}
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-accent"
            />

            {/* Search results */}
            {search.length >= 2 && (
              <div className="mt-1 rounded-xl border border-border bg-surface-raised shadow-sm overflow-hidden">
                {searching ? (
                  <p className="px-3 py-2 text-sm text-text-secondary">Searching…</p>
                ) : results.length === 0 ? (
                  <p className="px-3 py-2 text-sm text-text-secondary">No practitioners found</p>
                ) : (
                  <ul>
                    {results.map((p) => (
                      <li
                        key={p.id}
                        onClick={() => {
                          setSelectedPractitioner(p)
                          setSearch(p.name)
                          setResults([])
                        }}
                        className={`px-3 py-2 cursor-pointer text-sm hover:bg-accent-subtle ${
                          selectedPractitioner?.id === p.id ? 'bg-accent-subtle font-medium' : ''
                        }`}
                      >
                        <span className="text-text-primary">{p.name}</span>
                        <span className="ml-2 text-text-secondary">{p.email}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          {/* Role selector */}
          <div>
            <label
              htmlFor="assign-role-select"
              className="block text-sm font-medium text-text-secondary mb-1"
            >
              Initial role
            </label>
            <select
              id="assign-role-select"
              aria-label="Initial role"
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value as LabRole)}
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
            >
              {LAB_ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-xl bg-danger-subtle p-3 text-sm text-danger">{error}</div>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-full border border-border px-6 py-2.5 text-sm text-text-primary hover:bg-surface hover:scale-[1.02] transition-transform duration-200"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="rounded-full bg-accent px-6 py-2.5 text-sm font-semibold text-text-primary disabled:opacity-50 hover:scale-[1.02] transition-transform duration-200"
          >
            {submitting ? 'Assigning…' : 'Assign'}
          </button>
        </div>
      </div>
    </div>
  )
}
