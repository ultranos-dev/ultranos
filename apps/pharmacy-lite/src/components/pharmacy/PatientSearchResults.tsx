'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Avatar } from '@ultranos/ui-kit/components/ui/avatar'
import { highlightQuery } from '@ultranos/ui-kit/lib/highlight'
import type { LocalPatient } from '@/lib/db'
import { getPatientPhotoUrl } from '@/lib/patient-photo-api'

interface PatientSearchResultsProps {
  results: LocalPatient[]
  query: string
  onSelect: (patient: LocalPatient) => void
  onRegisterNew: () => void
}

export function PatientSearchResults({
  results,
  query,
  onSelect,
  onRegisterNew,
}: PatientSearchResultsProps) {
  // Rule #7 (revised 2026-09-24): show patient photos. Fetch short-lived signed URLs
  // by patient id (Hub resolves the opaque key server-side); initials fallback on
  // miss/offline. Keyed by patient id.
  const [photoUrls, setPhotoUrls] = useState<Map<string, string>>(new Map())
  useEffect(() => {
    const ids = results.map((r) => r.id)
    if (ids.length === 0) { setPhotoUrls(new Map()); return }
    let cancelled = false
    const controller = new AbortController()
    ;(async () => {
      const entries = await Promise.all(
        ids.map(async (id) => [id, await getPatientPhotoUrl(id, controller.signal)] as const),
      )
      if (cancelled) return
      const map = new Map<string, string>()
      for (const [id, url] of entries) if (url) map.set(id, url)
      setPhotoUrls(map)
    })()
    return () => { cancelled = true; controller.abort() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results.map((r) => r.id).join(',')])
  if (results.length === 0) {
    return (
      <div
        className="mt-2 rounded-2xl border border-border bg-card p-4"
        data-testid="patient-no-results"
      >
        <p className="text-sm text-muted-foreground">
          No patients found for &ldquo;{query}&rdquo;
        </p>
        <button
          type="button"
          onClick={onRegisterNew}
          className="mt-2 text-sm font-semibold text-primary-700 hover:text-primary-800"
          data-testid="register-new-patient-link"
        >
          + Register new patient
        </button>
      </div>
    )
  }

  return (
    <ul
      className="mt-2 divide-y divide-border rounded-2xl border border-border bg-card overflow-hidden"
      data-testid="patient-search-results"
      role="listbox"
    >
      {results.map((patient) => (
        <li
          key={patient.id}
          role="option"
          className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-accent transition-colors"
          onClick={() => onSelect(patient)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(patient) } }}
          tabIndex={0}
          data-testid={`patient-result-${patient.id}`}
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <Avatar src={photoUrls.get(patient.id) ?? null} name={patient.nameGiven} size={28} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground truncate">
                {[patient.nameGiven, patient.nameFather].filter(Boolean).map((seg, i) => (
                  <span key={i}>
                    {i > 0 && (
                      <span
                        className="mx-2 inline-block h-2 w-2 rounded-full border-2 border-muted-foreground/40 align-middle select-none"
                        aria-hidden="true"
                      />
                    )}
                    {highlightQuery(seg ?? '', query)}
                  </span>
                ))}
              </p>
              <p className="text-xs text-muted-foreground">
                {patient.gender}{patient.birthYear ? ` | ${new Date().getFullYear() - patient.birthYear} y/o` : ''}
                {patient.phone ? ` | ${patient.phone}` : ''}
              </p>
            </div>
          </div>
          {patient.allergies && patient.allergies.length > 0 && (
            <Badge variant="outline" className="ms-2 bg-destructive/10 text-destructive border-destructive/20 font-bold">
              ALLERGIES
            </Badge>
          )}
        </li>
      ))}
      {results.length < 5 && (
        <li className="px-4 py-3 bg-muted">
          <button
            type="button"
            onClick={onRegisterNew}
            className="text-sm font-semibold text-primary-700 hover:text-primary-800"
            data-testid="register-new-from-results"
          >
            + Register new patient
          </button>
        </li>
      )}
    </ul>
  )
}
