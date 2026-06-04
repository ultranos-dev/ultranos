'use client'

import { useState } from 'react'
import type { FhirPatient, PatientAddress } from '@ultranos/shared-types'
import { ChevronDown } from '@ultranos/ui-kit/icons'

interface PatientDetailsAccordionProps {
  patient: FhirPatient
}

/** Format a PatientAddress as "village, district, province" (omitting blanks). */
function formatAddress(addr?: PatientAddress): string | null {
  if (!addr) return null
  const parts = [addr.village, addr.district, addr.province].filter(Boolean)
  return parts.length > 0 ? parts.join(', ') : null
}

/** Check if two addresses are effectively the same. */
function addressesMatch(
  a?: PatientAddress,
  b?: PatientAddress,
): boolean {
  if (!a && !b) return true
  if (!a || !b) return false
  return (
    a.province === b.province &&
    a.district === b.district &&
    (a.village ?? '') === (b.village ?? '')
  )
}

/** Format ISO date string to locale date. */
function formatDate(iso?: string): string {
  if (!iso) return '--'
  try {
    return new Date(iso).toLocaleDateString()
  } catch {
    return iso
  }
}

/** Mask a hash value for display: first 6 + last 4 chars. */
function maskHash(hash: string): string {
  if (hash.length <= 12) return hash
  return `${hash.slice(0, 6)}...${hash.slice(-4)}`
}

/**
 * Collapsible accordion showing extended patient details.
 * Collapsed by default. Read-only — no edit controls.
 *
 * Sections:
 * - Address & Geography (origin, current, nomadic status)
 * - Identity & Records (tier, registration, consent, identifiers, status, biometric)
 */
export function PatientDetailsAccordion({
  patient,
}: PatientDetailsAccordionProps) {
  const [isOpen, setIsOpen] = useState(false)

  const ext = patient._ultranos

  const originStr = formatAddress(ext.addressOrigin)
  const currentStr = formatAddress(ext.addressCurrent)
  const isSameAddress = addressesMatch(ext.addressOrigin, ext.addressCurrent)

  return (
    <div className="rounded-xl bg-card-bg shadow-sm ring-[0.65px] ring-gray-400/40">
      {/* Toggle header */}
      <button
        type="button"
        className="flex w-full items-center justify-between px-5 py-4 text-start"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-controls="patient-details-content"
      >
        <span className="text-sm font-semibold text-foreground">
          Patient Details
        </span>
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
          aria-hidden="true"
        />
      </button>

      {/* Collapsible content */}
      {isOpen && (
        <div id="patient-details-content" className="px-5 pb-5">
          {/* ── Address & Geography ─────────────────────── */}
          <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Address &amp; Geography
          </h4>

          <dl className="space-y-1 text-sm text-foreground">
            <div className="flex gap-2">
              <dt className="font-medium text-muted-foreground shrink-0">Origin:</dt>
              <dd>{originStr ?? '--'}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="font-medium text-muted-foreground shrink-0">Current:</dt>
              <dd>
                {isSameAddress
                  ? 'Same as origin'
                  : currentStr ?? '--'}
              </dd>
            </div>
          </dl>

          {ext.isNomadic && (
            <span className="mt-2 inline-block rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
              Nomadic
            </span>
          )}

          <hr className="my-4 border-neutral-200" />

          {/* ── Identity & Records ──────────────────────── */}
          <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Identity &amp; Records
          </h4>

          <dl className="space-y-1 text-sm text-foreground">
            {/* Tier */}
            <div className="flex items-center gap-2">
              <dt className="font-medium text-muted-foreground shrink-0">Tier:</dt>
              <dd>
                <span
                  className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    ext.patient_tier === 'PREMIUM'
                      ? 'bg-purple-100 text-purple-800'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {ext.patient_tier}
                </span>
              </dd>
            </div>

            {/* Registered */}
            <div className="flex gap-2">
              <dt className="font-medium text-muted-foreground shrink-0">Registered:</dt>
              <dd>{formatDate(ext.createdAt)}</dd>
            </div>

            {/* Consent version */}
            <div className="flex gap-2">
              <dt className="font-medium text-muted-foreground shrink-0">Consent:</dt>
              <dd>{ext.consentVersion ?? '--'}</dd>
            </div>

            {/* Identifiers */}
            {ext.identifiers && ext.identifiers.length > 0 && (
              <div>
                <dt className="font-medium text-muted-foreground mb-1">Identifiers:</dt>
                <dd>
                  <ul className="ms-4 list-disc space-y-0.5 text-xs text-muted-foreground">
                    {ext.identifiers.map((ident, idx) => (
                      <li key={idx}>
                        <span className="font-medium">{ident.displayType}</span>
                        {' — '}
                        {maskHash(ident.valueHash)}
                        {/* Tazkira fields */}
                        {(ident.jild || ident.safa || ident.shumara) && (
                          <span className="ms-1 text-muted-foreground">
                            (Jild: {ident.jild ?? '--'} / Safa: {ident.safa ?? '--'} / Shumara: {ident.shumara ?? '--'})
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </dd>
              </div>
            )}

            {/* Status */}
            <div className="flex items-center gap-2">
              <dt className="font-medium text-muted-foreground shrink-0">Status:</dt>
              <dd>
                <span
                  className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    ext.isActive
                      ? 'bg-green-100 text-green-800'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {ext.isActive ? 'Active' : 'Inactive'}
                </span>
              </dd>
            </div>

            {/* Biometric */}
            <div className="flex items-center gap-2">
              <dt className="font-medium text-muted-foreground shrink-0">Biometric:</dt>
              <dd>
                <span
                  className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    ext.biometricFingerprintHash
                      ? 'bg-green-100 text-green-800'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {ext.biometricFingerprintHash ? 'Enrolled' : 'Not enrolled'}
                </span>
              </dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  )
}
