'use client'

import type { LocalPatient } from '@/lib/db'

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
  if (results.length === 0) {
    return (
      <div
        className="mt-2 rounded-lg border border-neutral-200 bg-white p-4"
        data-testid="patient-no-results"
      >
        <p className="text-sm text-neutral-600">
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
      className="mt-2 divide-y divide-neutral-100 rounded-lg border border-neutral-200 bg-white overflow-hidden"
      data-testid="patient-search-results"
      role="listbox"
    >
      {results.map((patient) => (
        <li
          key={patient.id}
          role="option"
          className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-neutral-50 transition-colors"
          onClick={() => onSelect(patient)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(patient) } }}
          tabIndex={0}
          data-testid={`patient-result-${patient.id}`}
        >
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-neutral-900 truncate">
              {patient.nameGiven}
              {patient.nameFather ? ` ${patient.nameFather}` : ''}
            </p>
            <p className="text-xs text-neutral-500">
              {patient.gender}{patient.birthYear ? ` | ${new Date().getFullYear() - patient.birthYear} y/o` : ''}
              {patient.phone ? ` | ${patient.phone}` : ''}
            </p>
          </div>
          {patient.allergies && patient.allergies.length > 0 && (
            <span className="ms-2 inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-800">
              ALLERGIES
            </span>
          )}
        </li>
      ))}
      {results.length < 5 && (
        <li className="px-4 py-3 bg-neutral-50">
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
