'use client'

/**
 * LearningJournal — Story 46.5 Task 4
 *
 * Displays learning journal entries for a mentorship pairing in chronological
 * order (oldest first). Entries are fetched from the Dexie `learning_journal`
 * table and rendered with author role badge, title, body, photos, case context,
 * and a sync-pending badge.
 *
 * RTL-compatible: all spacing uses logical CSS Tailwind utilities.
 * No PHI: operates on mentorship journal data only. caseContext uses LOINC codes.
 */

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { getDb } from '@/lib/db'
import type { MentorshipPairing, LearningJournalEntry } from '@/lib/mentorship-types'
import { Button } from '@/components/ui/Button'

export interface LearningJournalProps {
  pairing: MentorshipPairing
  currentUserId: string
  onAddEntry: () => void
}

export function LearningJournal({
  pairing,
  currentUserId,
  onAddEntry,
}: LearningJournalProps) {
  const t = useTranslations('mentorship')

  const [entries, setEntries] = useState<LearningJournalEntry[]>([])
  const [loading, setLoading] = useState(true)

  // ---------------------------------------------------------------------------
  // Fetch entries from Dexie, ordered chronologically (oldest first)
  // ---------------------------------------------------------------------------

  const fetchEntries = useCallback(async () => {
    setLoading(true)
    try {
      const db = getDb()
      const results = await db.learning_journal
        .where('pairingId')
        .equals(pairing.id)
        .sortBy('createdAt')
      setEntries(results)
    } finally {
      setLoading(false)
    }
  }, [pairing.id])

  useEffect(() => {
    void fetchEntries()
  }, [fetchEntries])

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  function formatDate(iso: string): string {
    try {
      return new Date(iso).toLocaleDateString()
    } catch {
      return iso
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <section aria-label={t('journalSectionLabel')} className="flex flex-col gap-4">
      {/* Header row */}
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-foreground">
          {t('journalTitle')}
        </h2>
        <Button
          type="button"
          variant="primary"
          onClick={onAddEntry}
          aria-label={t('journalAddEntryAriaLabel')}
        >
          {t('journalAddEntry')}
        </Button>
      </div>

      {/* Loading state */}
      {loading && (
        <p className="text-sm text-muted-foreground">{t('journalLoading')}</p>
      )}

      {/* Empty state */}
      {!loading && entries.length === 0 && (
        <p className="rounded-lg border border-dashed border-border px-5 py-8 text-center text-sm text-muted-foreground">
          {t('journalEmpty')}
        </p>
      )}

      {/* Entry list */}
      {!loading && entries.length > 0 && (
        <ol className="flex flex-col gap-4">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className={
                'rounded-xl border p-4 shadow-sm ' +
                (entry.authorId === currentUserId
                  ? 'border-primary-200 bg-primary-50'
                  : 'border-border bg-card')
              }
            >
              {/* Entry header */}
              <div className="mb-2 flex flex-wrap items-center gap-2">
                {/* Author role badge */}
                <span
                  className={
                    'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ' +
                    (entry.authorRole === 'mentor'
                      ? 'bg-blue-100 text-blue-800'
                      : 'bg-emerald-100 text-emerald-800')
                  }
                >
                  {entry.authorRole === 'mentor'
                    ? t('journalRoleMentor')
                    : t('journalRoleMentee')}
                </span>

                {/* "You" badge — shown only for current user's own entries */}
                {entry.authorId === currentUserId && (
                  <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-foreground">
                    {t('journalYou')}
                  </span>
                )}

                {/* Date */}
                <span className="text-xs text-muted-foreground">
                  {formatDate(entry.createdAt)}
                </span>

                {/* Pending sync badge */}
                {entry.syncStatus === 'pending' && (
                  <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
                    {t('journalSyncPending')}
                  </span>
                )}
              </div>

              {/* Title */}
              <h3 className="mb-1 text-sm font-semibold text-foreground text-start">
                {entry.title}
              </h3>

              {/* Body — rendered as preformatted plain text; no full markdown renderer needed */}
              <pre className="mb-3 whitespace-pre-wrap break-words text-start font-sans text-sm text-foreground">
                {entry.body}
              </pre>

              {/* Photos */}
              {entry.photos.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-2">
                  {entry.photos.map((photo) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={photo.id}
                      src={photo.data}
                      alt={photo.alt ?? t('journalPhotoAlt')}
                      className="h-20 w-20 rounded-md object-cover ring-1 ring-border"
                    />
                  ))}
                </div>
              )}

              {/* Case context */}
              {entry.caseContext && (
                <div className="mt-2 rounded-lg bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                  {entry.caseContext.procedureName && (
                    <p>
                      <span className="font-medium">{t('journalProcedureLabel')}</span>{' '}
                      {entry.caseContext.procedureName}
                    </p>
                  )}
                  {entry.caseContext.learningOutcome && (
                    <p className="mt-0.5">
                      <span className="font-medium">{t('journalLearningOutcomeLabel')}</span>{' '}
                      {entry.caseContext.learningOutcome}
                    </p>
                  )}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
