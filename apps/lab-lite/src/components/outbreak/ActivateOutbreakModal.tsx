'use client'

/**
 * Outbreak Mode Activation Modal — Story 54.5
 *
 * Role-gated form for activating Outbreak Mode.
 * Only visible to health_officer and lab_supervisor roles (AC #2).
 *
 * RTL-safe: uses logical CSS properties (margin-inline-start, etc.).
 * No PHI: form collects pathogen codes and administrative metadata only.
 */

import { useState } from 'react'
import { AlertTriangle, ChevronDown } from '@ultranos/ui-kit/icons'
import { DirectionalIcon } from '@ultranos/ui-kit'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { isOutbreakAuthorized } from '@/lib/outbreak-service'
import type { LabRole } from '@ultranos/shared-types'
import type { TargetPathogen, ActivateOutbreakInput } from '@/types/outbreak'

// ---------------------------------------------------------------------------
// Common pathogens list for autocomplete (AC #5.2)
// ---------------------------------------------------------------------------

const COMMON_PATHOGENS: TargetPathogen[] = [
  { code: 'MALARIA', display: 'Malaria' },
  { code: 'TB', display: 'Tuberculosis (TB)' },
  { code: 'CHOLERA', display: 'Cholera' },
  { code: 'MEASLES', display: 'Measles' },
  { code: 'COVID19', display: 'COVID-19' },
  { code: 'DENGUE', display: 'Dengue' },
  { code: 'HEP_A', display: 'Hepatitis A' },
  { code: 'HEP_B', display: 'Hepatitis B' },
  { code: 'HEP_C', display: 'Hepatitis C' },
  { code: 'HEP_E', display: 'Hepatitis E' },
]

// ---------------------------------------------------------------------------
// LOINC codes commonly associated with each pathogen
// ---------------------------------------------------------------------------

const PATHOGEN_LOINC_MAP: Record<string, Array<{ code: string; display: string }>> = {
  MALARIA: [
    { code: '51587-4', display: 'Malaria rapid diagnostic test (RDT)' },
    { code: '10701-1', display: 'Plasmodium sp. Ab' },
  ],
  TB: [
    { code: '14957-5', display: 'Sputum AFB smear' },
    { code: '94563-4', display: 'Mycobacterium tuberculosis NAAT' },
  ],
  CHOLERA: [
    { code: '9830-1', display: 'Vibrio cholerae culture' },
    { code: '47083-8', display: 'Vibrio cholerae Ag' },
  ],
  MEASLES: [
    { code: '21300-2', display: 'Measles virus IgM Ab' },
    { code: '58452-4', display: 'Measles virus NAAT' },
  ],
  COVID19: [
    { code: '94500-6', display: 'SARS-CoV-2 NAAT' },
    { code: '97097-0', display: 'SARS-CoV-2 Ag rapid' },
  ],
  DENGUE: [
    { code: '23831-4', display: 'Dengue virus NS1 Ag' },
    { code: '6812-1', display: 'Dengue virus Ab' },
  ],
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface Props {
  labLocationIds: string[]
  onActivated: (input: ActivateOutbreakInput) => Promise<void>
  onCancel: () => void
}

export function ActivateOutbreakModal({ labLocationIds, onActivated, onCancel }: Props) {
  const session = useAuthSessionStore((s) => s.session)

  // Role gate: only render for authorized roles
  const authorized = session
    ? isOutbreakAuthorized({
        actorId: session.userId,
        actorRole: session.role,
        actorLabRole: session.labRole as LabRole | null,
      })
    : false

  const [pathogenQuery, setPathogenQuery] = useState('')
  const [selectedPathogen, setSelectedPathogen] = useState<TargetPathogen | null>(null)
  const [showPathogenDropdown, setShowPathogenDropdown] = useState(false)
  const [selectedTestCodes, setSelectedTestCodes] = useState<string[]>([])
  const [selectedScope, setSelectedScope] = useState<string[]>(labLocationIds)
  const [activationReason, setActivationReason] = useState('')
  const [surgeMultiplier, setSurgeMultiplier] = useState(3)
  const [showConfirm, setShowConfirm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!authorized) return null

  const filteredPathogens = pathogenQuery
    ? COMMON_PATHOGENS.filter((p) =>
        p.display.toLowerCase().includes(pathogenQuery.toLowerCase()),
      )
    : COMMON_PATHOGENS

  const availableLoincCodes = selectedPathogen
    ? PATHOGEN_LOINC_MAP[selectedPathogen.code] ?? []
    : []

  function handlePathogenSelect(pathogen: TargetPathogen) {
    setSelectedPathogen(pathogen)
    setPathogenQuery(pathogen.display)
    setShowPathogenDropdown(false)
    // Auto-select all LOINC codes for this pathogen
    const codes = (PATHOGEN_LOINC_MAP[pathogen.code] ?? []).map((c) => c.code)
    setSelectedTestCodes(codes)
  }

  function handleCustomPathogen() {
    if (!pathogenQuery.trim()) return
    setSelectedPathogen({ code: pathogenQuery.toUpperCase().replace(/\s+/g, '_'), display: pathogenQuery.trim() })
    setShowPathogenDropdown(false)
  }

  function toggleTestCode(code: string) {
    setSelectedTestCodes((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
    )
  }

  function toggleScope(locationId: string) {
    setSelectedScope((prev) =>
      prev.includes(locationId)
        ? prev.filter((id) => id !== locationId)
        : [...prev, locationId],
    )
  }

  function validateForm(): string | null {
    if (!selectedPathogen) return 'Please select a target pathogen.'
    if (selectedTestCodes.length === 0) return 'Please select at least one target test.'
    if (selectedScope.length === 0) return 'Please select at least one lab location.'
    if (!activationReason.trim()) return 'Please enter an activation reason.'
    if (surgeMultiplier < 1.5 || surgeMultiplier > 10) return 'Surge multiplier must be between 1.5 and 10.'
    return null
  }

  function handleSubmitClick() {
    const validationError = validateForm()
    if (validationError) {
      setError(validationError)
      return
    }
    setError(null)
    setShowConfirm(true)
  }

  async function handleConfirm() {
    if (!selectedPathogen || !session) return
    setSubmitting(true)
    setError(null)
    try {
      const input: ActivateOutbreakInput = {
        activatedBy: session.practitionerId,
        targetPathogen: selectedPathogen,
        targetTestCodes: selectedTestCodes,
        affectedScope: selectedScope,
        activationReason: activationReason.trim(),
        surgeMultiplier,
      }
      await onActivated(input)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Activation failed. Please try again.')
      setShowConfirm(false)
    } finally {
      setSubmitting(false)
    }
  }

  if (showConfirm) {
    return (
      <div role="dialog" aria-modal="true" aria-label="Confirm Outbreak Mode Activation"
        style={{
          position: 'fixed', inset: 0, zIndex: 10000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backgroundColor: 'rgba(0,0,0,0.6)',
        }}
      >
        <div style={{
          backgroundColor: '#fff', borderRadius: '8px', padding: '2rem',
          maxWidth: '480px', width: '90%',
          border: '3px solid #dc2626',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBlockEnd: '1rem' }}>
            <AlertTriangle size={28} color="#dc2626" aria-hidden="true" />
            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#dc2626' }}>
              Confirm Outbreak Mode Activation
            </h2>
          </div>

          <p style={{ marginBlockEnd: '0.75rem' }}>
            You are activating <strong>Outbreak Mode</strong> for{' '}
            <strong>{selectedPathogen!.display}</strong> across{' '}
            <strong>{selectedScope.length} location{selectedScope.length !== 1 ? 's' : ''}</strong>.
          </p>

          <ul style={{ marginBlockEnd: '1rem', paddingInlineStart: '1.5rem' }}>
            <li>Target tests: <strong>{selectedTestCodes.join(', ')}</strong></li>
            <li>Surge multiplier: <strong>{surgeMultiplier}×</strong></li>
            <li>Reporting switches to <strong>real-time</strong></li>
            <li>Queue priority enabled for target pathogen samples</li>
            <li>Inventory alerts recalibrated for surge demand</li>
          </ul>

          <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBlockEnd: '1.5rem' }}>
            <strong>Reason:</strong> {activationReason}
          </p>

          {error && (
            <p role="alert" style={{ color: '#dc2626', marginBlockEnd: '1rem', fontSize: '0.875rem' }}>
              {error}
            </p>
          )}

          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={() => setShowConfirm(false)}
              disabled={submitting}
              style={{
                padding: '0.5rem 1.25rem', borderRadius: '6px',
                border: '1px solid #d1d5db', cursor: 'pointer', backgroundColor: '#fff',
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={submitting}
              style={{
                padding: '0.5rem 1.25rem', borderRadius: '6px',
                backgroundColor: '#dc2626', color: '#fff',
                border: 'none', cursor: 'pointer', fontWeight: 600,
              }}
            >
              {submitting ? 'Activating…' : 'Activate Outbreak Mode'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Activate Outbreak Mode"
      style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.5)',
      }}
    >
      <div style={{
        backgroundColor: '#fff', borderRadius: '8px', padding: '2rem',
        maxWidth: '600px', width: '90%', maxHeight: '90vh', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBlockEnd: '1.5rem' }}>
          <AlertTriangle size={24} color="#dc2626" aria-hidden="true" />
          <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>
            Activate Outbreak Mode
          </h2>
        </div>

        {/* Target Pathogen */}
        <div style={{ marginBlockEnd: '1rem' }}>
          <label htmlFor="pathogen-input" style={{ display: 'block', fontWeight: 600, marginBlockEnd: '0.375rem' }}>
            Target Pathogen *
          </label>
          <div style={{ position: 'relative' }}>
            <input
              id="pathogen-input"
              type="text"
              value={pathogenQuery}
              onChange={(e) => {
                setPathogenQuery(e.target.value)
                setShowPathogenDropdown(true)
              }}
              onFocus={() => setShowPathogenDropdown(true)}
              onBlur={() => setTimeout(() => setShowPathogenDropdown(false), 150)}
              placeholder="Search pathogens or enter custom…"
              style={{
                width: '100%', padding: '0.5rem 0.75rem', borderRadius: '6px',
                border: '1px solid #d1d5db', fontSize: '0.9375rem', boxSizing: 'border-box',
              }}
            />
            <DirectionalIcon category="navigation">
              <ChevronDown size={16} style={{ position: 'absolute', insetInlineEnd: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', pointerEvents: 'none' }} aria-hidden="true" />
            </DirectionalIcon>
            {showPathogenDropdown && (
              <ul role="listbox" style={{
                position: 'absolute', top: '100%', insetInlineStart: 0, insetInlineEnd: 0,
                backgroundColor: '#fff', border: '1px solid #d1d5db', borderRadius: '6px',
                listStyle: 'none', margin: '2px 0 0', padding: 0, zIndex: 100,
                maxHeight: '200px', overflowY: 'auto', boxShadow: '0 4px 8px rgba(0,0,0,0.1)',
              }}>
                {filteredPathogens.map((p) => (
                  <li key={p.code} role="option" aria-selected={selectedPathogen?.code === p.code}
                    onMouseDown={() => handlePathogenSelect(p)}
                    style={{
                      padding: '0.5rem 0.75rem', cursor: 'pointer',
                      backgroundColor: selectedPathogen?.code === p.code ? '#fee2e2' : 'transparent',
                    }}
                  >
                    {p.display}
                  </li>
                ))}
                {pathogenQuery.trim() && !filteredPathogens.find((p) => p.display.toLowerCase() === pathogenQuery.toLowerCase()) && (
                  <li role="option"
                    onMouseDown={handleCustomPathogen}
                    style={{ padding: '0.5rem 0.75rem', cursor: 'pointer', color: '#6b7280', fontStyle: 'italic' }}
                  >
                    Use &ldquo;{pathogenQuery}&rdquo; as custom pathogen
                  </li>
                )}
              </ul>
            )}
          </div>
        </div>

        {/* Target Test Codes */}
        {availableLoincCodes.length > 0 && (
          <div style={{ marginBlockEnd: '1rem' }}>
            <p style={{ fontWeight: 600, marginBlockEnd: '0.375rem' }}>Target Test Codes *</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
              {availableLoincCodes.map(({ code, display }) => (
                <label key={code} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={selectedTestCodes.includes(code)}
                    onChange={() => toggleTestCode(code)}
                  />
                  <span>{display} <span style={{ color: '#6b7280', fontSize: '0.8125rem' }}>({code})</span></span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Affected Scope */}
        {labLocationIds.length > 0 && (
          <div style={{ marginBlockEnd: '1rem' }}>
            <p style={{ fontWeight: 600, marginBlockEnd: '0.375rem' }}>Affected Lab Locations *</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
              {labLocationIds.map((locationId) => (
                <label key={locationId} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={selectedScope.includes(locationId)}
                    onChange={() => toggleScope(locationId)}
                  />
                  <span>{locationId}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Activation Reason */}
        <div style={{ marginBlockEnd: '1rem' }}>
          <label htmlFor="activation-reason" style={{ display: 'block', fontWeight: 600, marginBlockEnd: '0.375rem' }}>
            Activation Reason *
          </label>
          <textarea
            id="activation-reason"
            value={activationReason}
            onChange={(e) => setActivationReason(e.target.value)}
            placeholder='e.g. "WHO outbreak alert", "Provincial directive #12"'
            rows={3}
            style={{
              width: '100%', padding: '0.5rem 0.75rem', borderRadius: '6px',
              border: '1px solid #d1d5db', fontSize: '0.9375rem', resize: 'vertical', boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Surge Multiplier */}
        <div style={{ marginBlockEnd: '1.5rem' }}>
          <label htmlFor="surge-multiplier" style={{ display: 'block', fontWeight: 600, marginBlockEnd: '0.375rem' }}>
            Surge Inventory Multiplier
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <input
              id="surge-multiplier"
              type="number"
              min={1.5}
              max={10}
              step={0.5}
              value={surgeMultiplier}
              onChange={(e) => setSurgeMultiplier(Number(e.target.value))}
              style={{
                width: '80px', padding: '0.5rem 0.75rem', borderRadius: '6px',
                border: '1px solid #d1d5db', fontSize: '0.9375rem',
              }}
            />
            <span style={{ color: '#6b7280', fontSize: '0.875rem' }}>
              × normal consumption rate (range: 1.5× – 10×, default 3×)
            </span>
          </div>
        </div>

        {error && (
          <p role="alert" style={{ color: '#dc2626', marginBlockEnd: '1rem', fontSize: '0.875rem' }}>
            {error}
          </p>
        )}

        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: '0.5rem 1.25rem', borderRadius: '6px',
              border: '1px solid #d1d5db', cursor: 'pointer', backgroundColor: '#fff',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmitClick}
            style={{
              padding: '0.5rem 1.25rem', borderRadius: '6px',
              backgroundColor: '#dc2626', color: '#fff',
              border: 'none', cursor: 'pointer', fontWeight: 600,
            }}
          >
            Review &amp; Confirm
          </button>
        </div>
      </div>
    </div>
  )
}
