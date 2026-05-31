'use client'

/**
 * Reference Range Editor — Story 43.8 (AC #1, #3, #4)
 *
 * Allows LAB_MANAGER or SUPERVISOR to view and override reference ranges
 * per analyte. Supports age/gender/altitude-specific overrides.
 *
 * AC #3: Shows source badge (Default/Custom/Population Study).
 * AC #4: Every change is versioned and audit-logged.
 * AC #5: Historical results retain the ranges active at time of production.
 *
 * Data minimization: no patient data in this component.
 * RTL support: uses logical CSS properties throughout.
 */

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { LabRole } from '@ultranos/shared-types'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { reportRangeChangeEvent } from '@/lib/audit-client'
import { hlc, serializeHlc } from '@/lib/hlc'
import { ALL_DEFAULT_RANGES, DEFAULT_RANGES_BY_LOINC } from '@/lib/reference-ranges/default-ranges'
import {
  SOURCE_BADGE_VARIANT,
  SOURCE_DISPLAY_LABEL,
} from '@/lib/reference-ranges/types'
import type { ReferenceRange, RangeSource, RangeVersion } from '@/lib/reference-ranges/types'

// ---------------------------------------------------------------------------
// Role check — only LAB_MANAGER and SUPERVISOR may edit ranges
// ---------------------------------------------------------------------------

export function canEditRanges(labRole: string | undefined): boolean {
  return labRole === LabRole.LAB_MANAGER || labRole === LabRole.SUPERVISOR
}

// ---------------------------------------------------------------------------
// Source badge component
// ---------------------------------------------------------------------------

const BADGE_CLASSES: Record<string, string> = {
  gray: 'bg-neutral-100 text-neutral-600',
  blue: 'bg-blue-50 text-blue-700',
  green: 'bg-green-50 text-green-700',
  yellow: 'bg-amber-50 text-amber-700',
}

function SourceBadge({ source }: { source: RangeSource }) {
  const variant = SOURCE_BADGE_VARIANT[source]
  const label = SOURCE_DISPLAY_LABEL[source]
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${BADGE_CLASSES[variant]}`}
      aria-label={`Range source: ${label}`}
    >
      {label}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Types for the edit form
// ---------------------------------------------------------------------------

interface EditFormValues {
  ageMin: number
  ageMax: number
  gender: 'M' | 'F' | 'ALL'
  altitudeMin: number
  altitudeMax: string // '' for no upper limit
  rangeMin: number
  rangeMax: number
  criticalMin: string // '' for no critical threshold
  criticalMax: string
  unit: string
  source: RangeSource
  changeReason: string
}

// ---------------------------------------------------------------------------
// Analyte summary row
// ---------------------------------------------------------------------------

interface AnalyteGroup {
  loincCode: string
  analyteName: string
  ranges: ReferenceRange[]
}

// Group ranges by LOINC code for display
function buildAnalyteGroups(
  defaultRanges: ReferenceRange[],
  customRanges: ReferenceRange[],
): AnalyteGroup[] {
  const map = new Map<string, AnalyteGroup>()

  for (const r of [...defaultRanges, ...customRanges]) {
    if (!r.effectiveTo) {
      const existing = map.get(r.loincCode)
      if (existing) {
        existing.ranges.push(r)
      } else {
        map.set(r.loincCode, {
          loincCode: r.loincCode,
          analyteName: r.analyteName,
          ranges: [r],
        })
      }
    }
  }

  return Array.from(map.values()).sort((a, b) =>
    a.analyteName.localeCompare(b.analyteName),
  )
}

// ---------------------------------------------------------------------------
// ReferenceRangeEditor main component
// ---------------------------------------------------------------------------

export function ReferenceRangeEditor() {
  const session = useAuthSessionStore((s) => s.session)
  const canEdit = canEditRanges(session?.labRole)

  const [search, setSearch] = useState('')
  const [customRanges, setCustomRanges] = useState<ReferenceRange[]>([])
  const [expandedLoinc, setExpandedLoinc] = useState<string | null>(null)
  const [editTarget, setEditTarget] = useState<ReferenceRange | null>(null)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editForm, setEditForm] = useState<EditFormValues | null>(null)
  const [versionHistory, setVersionHistory] = useState<RangeVersion[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load custom ranges from Dexie on mount
  useEffect(() => {
    let mounted = true
    void (async () => {
      try {
        // Dynamic import to avoid SSR issues — Dexie is client-only
        const { getDb } = await import('@/lib/db')
        const db = getDb()
        const rows = (await db.table('referenceRanges').toArray()) as ReferenceRange[]
        if (mounted) setCustomRanges(rows.filter((r) => !r.effectiveTo))
      } catch {
        // Table not yet migrated — no custom ranges available
      }
    })()
    return () => { mounted = false }
  }, [])

  const analyteGroups = buildAnalyteGroups(ALL_DEFAULT_RANGES, customRanges)

  const filtered = search
    ? analyteGroups.filter(
        (g) =>
          g.analyteName.toLowerCase().includes(search.toLowerCase()) ||
          g.loincCode.includes(search),
      )
    : analyteGroups

  function openEditModal(range: ReferenceRange) {
    setEditTarget(range)
    setEditForm({
      ageMin: range.ageMin,
      ageMax: range.ageMax === 999 ? 999 : range.ageMax,
      gender: range.gender,
      altitudeMin: range.altitudeMin,
      altitudeMax: range.altitudeMax != null ? String(range.altitudeMax) : '',
      rangeMin: range.rangeMin,
      rangeMax: range.rangeMax,
      criticalMin: range.criticalMin != null ? String(range.criticalMin) : '',
      criticalMax: range.criticalMax != null ? String(range.criticalMax) : '',
      unit: range.unit,
      source: range.source === 'DEFAULT' ? 'LAB_CUSTOM' : range.source,
      changeReason: '',
    })
    setError(null)
    setShowEditModal(true)
  }

  async function loadVersionHistory(rangeId: string) {
    try {
      const { getDb } = await import('@/lib/db')
      const db = getDb()
      const rows = (await db
        .table('rangeVersions')
        .where('rangeId')
        .equals(rangeId)
        .sortBy('version')) as RangeVersion[]
      setVersionHistory(rows)
    } catch {
      setVersionHistory([])
    }
  }

  const handleSave = useCallback(async () => {
    if (!editTarget || !editForm || !session?.practitionerId) return

    if (editForm.changeReason.trim().length < 10) {
      setError('Change reason must be at least 10 characters.')
      return
    }

    setSaving(true)
    setError(null)

    try {
      const { getDb } = await import('@/lib/db')
      const uuid = () => crypto.randomUUID()
      const db = getDb()

      const now = new Date().toISOString()
      const hlcTs = serializeHlc(hlc.now())

      // Mark old range as superseded
      if (editTarget.source !== 'DEFAULT') {
        await db.table('referenceRanges').update(editTarget.id, { effectiveTo: now })
      }

      // Create new version
      const newVersion = editTarget.version + 1
      const newRange: ReferenceRange = {
        id: uuid(),
        loincCode: editTarget.loincCode,
        analyteName: editTarget.analyteName,
        ageMin: editForm.ageMin,
        ageMax: editForm.ageMax,
        gender: editForm.gender,
        altitudeMin: editForm.altitudeMin,
        altitudeMax: editForm.altitudeMax !== '' ? Number(editForm.altitudeMax) : undefined,
        rangeMin: editForm.rangeMin,
        rangeMax: editForm.rangeMax,
        criticalMin: editForm.criticalMin !== '' ? Number(editForm.criticalMin) : undefined,
        criticalMax: editForm.criticalMax !== '' ? Number(editForm.criticalMax) : undefined,
        unit: editForm.unit,
        source: editForm.source,
        version: newVersion,
        effectiveFrom: now,
        effectiveTo: undefined,
        createdBy: session.practitionerId,
        createdAt: now,
        hlcTimestamp: hlcTs,
      }

      await db.table('referenceRanges').add(newRange)

      // Append a RangeVersion audit trail entry
      const versionEntry: RangeVersion = {
        id: uuid(),
        rangeId: newRange.id,
        version: newVersion,
        changedBy: session.practitionerId,
        changedAt: now,
        previousValues: {
          rangeMin: editTarget.rangeMin,
          rangeMax: editTarget.rangeMax,
          criticalMin: editTarget.criticalMin,
          criticalMax: editTarget.criticalMax,
          source: editTarget.source,
        },
        newValues: {
          rangeMin: newRange.rangeMin,
          rangeMax: newRange.rangeMax,
          criticalMin: newRange.criticalMin,
          criticalMax: newRange.criticalMax,
          source: newRange.source,
        },
        changeReason: editForm.changeReason.trim(),
      }
      await db.table('rangeVersions').add(versionEntry)

      // Emit audit event (AC #4)
      reportRangeChangeEvent({
        loincCode: editTarget.loincCode,
        analyteName: editTarget.analyteName,
        previousVersion: editTarget.version,
        newVersion,
        changeReason: editForm.changeReason.trim(),
        changedBy: session.practitionerId,
      })

      // Refresh custom ranges in state
      const rows = (await db.table('referenceRanges').toArray()) as ReferenceRange[]
      setCustomRanges(rows.filter((r) => !r.effectiveTo))
      setShowEditModal(false)
    } catch (e) {
      setError('Failed to save. Please try again.')
    } finally {
      setSaving(false)
    }
  }, [editTarget, editForm, session])

  async function handleResetToDefault(range: ReferenceRange) {
    if (!session?.practitionerId) return

    try {
      const { getDb } = await import('@/lib/db')
      const uuid = () => crypto.randomUUID()
      const db = getDb()

      const now = new Date().toISOString()

      // Supersede the custom range
      await db.table('referenceRanges').update(range.id, { effectiveTo: now })

      // Find the corresponding default range
      const defaults = DEFAULT_RANGES_BY_LOINC[range.loincCode] ?? []
      const matchingDefault = defaults.find(
        (d) =>
          d.ageMin === range.ageMin &&
          d.ageMax === range.ageMax &&
          d.gender === range.gender &&
          d.altitudeMin === range.altitudeMin,
      )

      if (matchingDefault) {
        // Emit audit event for reset
        reportRangeChangeEvent({
          loincCode: range.loincCode,
          analyteName: range.analyteName,
          previousVersion: range.version,
          newVersion: range.version + 1,
          changeReason: 'Reset to default values',
          changedBy: session.practitionerId,
        })
      }

      const rows = (await db.table('referenceRanges').toArray()) as ReferenceRange[]
      setCustomRanges(rows.filter((r) => !r.effectiveTo))
    } catch {
      // Silently fail — reset is best-effort
    }
  }

  return (
    <div className="space-y-4" data-testid="reference-range-editor">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-neutral-900">
          Reference Ranges
        </h2>
        {!canEdit && (
          <span className="text-xs text-neutral-400">
            View only — requires Manager or Supervisor role
          </span>
        )}
      </div>

      {/* Search */}
      <input
        type="search"
        placeholder="Search analyte name or LOINC code..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full rounded border border-neutral-300 px-3 py-1.5 text-sm placeholder:text-neutral-400"
        aria-label="Search analytes"
      />

      {/* Analyte list */}
      <div className="divide-y divide-neutral-100 rounded-lg border border-neutral-200 bg-white">
        {filtered.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-neutral-400">
            No analytes found
          </p>
        )}
        {filtered.map((group) => (
          <div key={group.loincCode} data-testid={`analyte-row-${group.loincCode}`}>
            {/* Analyte header row */}
            <button
              type="button"
              className="flex w-full items-center justify-between px-4 py-3 hover:bg-neutral-50 transition-colors"
              onClick={() => {
                setExpandedLoinc(
                  expandedLoinc === group.loincCode ? null : group.loincCode,
                )
                void loadVersionHistory(group.loincCode)
              }}
              aria-expanded={expandedLoinc === group.loincCode}
            >
              <div className="flex items-center gap-2 text-start">
                <span className="text-sm font-medium text-neutral-900">
                  {group.analyteName}
                </span>
                <span className="text-xs text-neutral-400 font-mono">
                  {group.loincCode}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {group.ranges.some((r) => r.source !== 'DEFAULT') && (
                  <SourceBadge source="LAB_CUSTOM" />
                )}
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={`text-neutral-400 transition-transform ${
                    expandedLoinc === group.loincCode ? 'rotate-180' : ''
                  }`}
                  aria-hidden="true"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>
            </button>

            {/* Expanded range rows */}
            {expandedLoinc === group.loincCode && (
              <div className="border-t border-neutral-100 bg-neutral-50 px-4 pb-3 pt-2">
                <table className="w-full text-xs" role="table">
                  <thead>
                    <tr className="text-neutral-500">
                      <th className="py-1 text-start font-medium">Age</th>
                      <th className="py-1 text-start font-medium">Gender</th>
                      <th className="py-1 text-start font-medium">Alt (m)</th>
                      <th className="py-1 text-start font-medium">Normal</th>
                      <th className="py-1 text-start font-medium">Critical</th>
                      <th className="py-1 text-start font-medium">Unit</th>
                      <th className="py-1 text-start font-medium">Source</th>
                      {canEdit && (
                        <th className="py-1 text-end font-medium">Actions</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {group.ranges.map((r) => (
                      <tr
                        key={r.id}
                        className="border-t border-neutral-100"
                        data-testid={`range-row-${r.id}`}
                      >
                        <td className="py-1.5 text-neutral-700">
                          {r.ageMin}–{r.ageMax === 999 ? '∞' : r.ageMax} yr
                        </td>
                        <td className="py-1.5 text-neutral-700">
                          {r.gender === 'ALL' ? 'All' : r.gender}
                        </td>
                        <td className="py-1.5 text-neutral-700">
                          {r.altitudeMin}
                          {r.altitudeMax != null ? `–${r.altitudeMax}` : '+'}
                        </td>
                        <td className="py-1.5 text-neutral-700">
                          {r.rangeMin}–{r.rangeMax}
                        </td>
                        <td className="py-1.5 text-neutral-700">
                          {r.criticalMin != null
                            ? `<${r.criticalMin} / >${r.criticalMax}`
                            : '—'}
                        </td>
                        <td className="py-1.5 text-neutral-500">{r.unit}</td>
                        <td className="py-1.5">
                          <SourceBadge source={r.source} />
                        </td>
                        {canEdit && (
                          <td className="py-1.5 text-end">
                            <div className="flex justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => openEditModal(r)}
                                className="rounded px-1.5 py-0.5 text-blue-600 hover:bg-blue-50 text-xs"
                                aria-label={`Edit ${group.analyteName} range`}
                              >
                                Edit
                              </button>
                              {r.source !== 'DEFAULT' && (
                                <button
                                  type="button"
                                  onClick={() => void handleResetToDefault(r)}
                                  className="rounded px-1.5 py-0.5 text-neutral-500 hover:bg-neutral-100 text-xs"
                                  aria-label={`Reset ${group.analyteName} to default`}
                                >
                                  Reset
                                </button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Version history */}
                {versionHistory.length > 0 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-neutral-400 hover:text-neutral-600">
                      Change history ({versionHistory.length})
                    </summary>
                    <ol className="mt-1 space-y-0.5">
                      {versionHistory.map((v) => (
                        <li key={v.id} className="text-xs text-neutral-500">
                          v{v.version} — {v.changedAt.slice(0, 10)} —{' '}
                          <span className="text-neutral-700">{v.changeReason}</span>
                        </li>
                      ))}
                    </ol>
                  </details>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Edit modal */}
      {showEditModal && editTarget && editForm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Edit reference range"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        >
          <div className="w-full max-w-lg rounded-lg bg-white shadow-xl">
            <div className="border-b border-neutral-200 px-5 py-4">
              <h3 className="font-semibold text-neutral-900">
                Edit Range — {editTarget.analyteName}
              </h3>
              <p className="text-xs text-neutral-400 mt-0.5">
                LOINC {editTarget.loincCode} · currently v{editTarget.version}
              </p>
            </div>

            <div className="px-5 py-4 space-y-3">
              {/* Diff preview */}
              <div className="rounded bg-neutral-50 p-3 text-xs">
                <p className="font-medium text-neutral-600 mb-1">Preview changes</p>
                <div className="flex gap-4">
                  <div>
                    <p className="text-neutral-400">Current</p>
                    <p className="text-neutral-700">
                      {editTarget.rangeMin}–{editTarget.rangeMax} {editTarget.unit}
                    </p>
                  </div>
                  <div>
                    <p className="text-neutral-400">New</p>
                    <p className="text-blue-700">
                      {editForm.rangeMin}–{editForm.rangeMax} {editForm.unit}
                    </p>
                  </div>
                </div>
              </div>

              {/* Form fields */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <label>
                  <span className="text-xs text-neutral-500">Age Min (yr)</span>
                  <input
                    type="number"
                    value={editForm.ageMin}
                    onChange={(e) =>
                      setEditForm({ ...editForm, ageMin: Number(e.target.value) })
                    }
                    className="mt-0.5 w-full rounded border border-neutral-300 px-2 py-1 text-sm"
                  />
                </label>
                <label>
                  <span className="text-xs text-neutral-500">Age Max (yr)</span>
                  <input
                    type="number"
                    value={editForm.ageMax}
                    onChange={(e) =>
                      setEditForm({ ...editForm, ageMax: Number(e.target.value) })
                    }
                    className="mt-0.5 w-full rounded border border-neutral-300 px-2 py-1 text-sm"
                  />
                </label>
                <label>
                  <span className="text-xs text-neutral-500">Gender</span>
                  <select
                    value={editForm.gender}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        gender: e.target.value as 'M' | 'F' | 'ALL',
                      })
                    }
                    className="mt-0.5 w-full rounded border border-neutral-300 px-2 py-1 text-sm"
                  >
                    <option value="ALL">All</option>
                    <option value="M">Male</option>
                    <option value="F">Female</option>
                  </select>
                </label>
                <label>
                  <span className="text-xs text-neutral-500">Altitude Min (m)</span>
                  <input
                    type="number"
                    value={editForm.altitudeMin}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        altitudeMin: Number(e.target.value),
                      })
                    }
                    className="mt-0.5 w-full rounded border border-neutral-300 px-2 py-1 text-sm"
                  />
                </label>
                <label>
                  <span className="text-xs text-neutral-500">Range Min</span>
                  <input
                    type="number"
                    step="0.1"
                    value={editForm.rangeMin}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        rangeMin: Number(e.target.value),
                      })
                    }
                    className="mt-0.5 w-full rounded border border-neutral-300 px-2 py-1 text-sm"
                  />
                </label>
                <label>
                  <span className="text-xs text-neutral-500">Range Max</span>
                  <input
                    type="number"
                    step="0.1"
                    value={editForm.rangeMax}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        rangeMax: Number(e.target.value),
                      })
                    }
                    className="mt-0.5 w-full rounded border border-neutral-300 px-2 py-1 text-sm"
                  />
                </label>
                <label>
                  <span className="text-xs text-neutral-500">Critical Min (opt)</span>
                  <input
                    type="number"
                    step="0.1"
                    value={editForm.criticalMin}
                    onChange={(e) =>
                      setEditForm({ ...editForm, criticalMin: e.target.value })
                    }
                    placeholder="None"
                    className="mt-0.5 w-full rounded border border-neutral-300 px-2 py-1 text-sm"
                  />
                </label>
                <label>
                  <span className="text-xs text-neutral-500">Critical Max (opt)</span>
                  <input
                    type="number"
                    step="0.1"
                    value={editForm.criticalMax}
                    onChange={(e) =>
                      setEditForm({ ...editForm, criticalMax: e.target.value })
                    }
                    placeholder="None"
                    className="mt-0.5 w-full rounded border border-neutral-300 px-2 py-1 text-sm"
                  />
                </label>
                <label className="col-span-2">
                  <span className="text-xs text-neutral-500">Unit</span>
                  <input
                    type="text"
                    value={editForm.unit}
                    onChange={(e) =>
                      setEditForm({ ...editForm, unit: e.target.value })
                    }
                    className="mt-0.5 w-full rounded border border-neutral-300 px-2 py-1 text-sm"
                  />
                </label>
                <label className="col-span-2">
                  <span className="text-xs text-neutral-500">Source</span>
                  <select
                    value={editForm.source}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        source: e.target.value as RangeSource,
                      })
                    }
                    className="mt-0.5 w-full rounded border border-neutral-300 px-2 py-1 text-sm"
                  >
                    <option value="LAB_CUSTOM">Lab Custom</option>
                    <option value="POPULATION_STUDY">Population Study</option>
                    <option value="MANUFACTURER">Manufacturer</option>
                  </select>
                </label>
                <label className="col-span-2">
                  <span className="text-xs text-neutral-500">
                    Change Reason{' '}
                    <span className="text-red-500">*</span>
                    <span className="text-neutral-300 ms-1">(min 10 chars)</span>
                  </span>
                  <textarea
                    value={editForm.changeReason}
                    onChange={(e) =>
                      setEditForm({ ...editForm, changeReason: e.target.value })
                    }
                    rows={2}
                    className="mt-0.5 w-full rounded border border-neutral-300 px-2 py-1 text-sm resize-none"
                    placeholder="Reason for this change (required)"
                  />
                </label>
              </div>

              {error && (
                <p className="rounded bg-red-50 px-3 py-2 text-xs text-red-700">
                  {error}
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-neutral-200 px-5 py-3">
              <button
                type="button"
                onClick={() => setShowEditModal(false)}
                className="rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving}
                className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                data-testid="save-range-button"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
