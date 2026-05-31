'use client'

import { useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { getDb } from '@/lib/db'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import type { ModerationFlag, ModerationReason } from '@/lib/peer-network-types'

const REASONS: ModerationReason[] = ['inappropriate', 'phi_detected', 'spam', 'other']

interface FlagButtonProps {
  targetId: string
  targetType: 'post' | 'response'
}

export function FlagButton({ targetId, targetType }: FlagButtonProps) {
  const t = useTranslations('peerNetwork')
  const session = useAuthSessionStore((s) => s.session)
  const [showDialog, setShowDialog] = useState(false)
  const [reason, setReason] = useState<ModerationReason>('inappropriate')
  const [details, setDetails] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = useCallback(async () => {
    if (!session) return

    setSubmitting(true)
    try {
      const flag: ModerationFlag = {
        id: crypto.randomUUID(),
        targetId,
        targetType,
        flaggedBy: session.practitionerId || session.userId,
        reason,
        details: details.trim() || undefined,
        createdAt: new Date().toISOString(),
        syncStatus: 'pending',
      }

      const db = getDb()
      await db.moderation_flags.put(flag)

      // If PHI detected, auto-flag the post/response
      if (reason === 'phi_detected' && targetType === 'post') {
        await db.peer_posts.update(targetId, {
          status: 'flagged',
          updatedAt: new Date().toISOString(),
          syncStatus: 'pending',
        })
      }

      setSubmitted(true)
      setShowDialog(false)
    } catch {
      // Silently fail — flag is queued for sync anyway
    } finally {
      setSubmitting(false)
    }
  }, [session, targetId, targetType, reason, details])

  if (submitted) {
    return (
      <span className="text-xs text-amber-600">{t('flagSubmitted')}</span>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setShowDialog(true)}
        className="text-xs text-neutral-400 hover:text-amber-600"
        aria-label={t('flagContent')}
        title={t('flagContent')}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
          <line x1="4" y1="22" x2="4" y2="15" />
        </svg>
      </button>

      {showDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setShowDialog(false)}>
          <div
            className="mx-4 w-full max-w-sm rounded-lg bg-white p-4 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-neutral-900">{t('flagContent')}</h3>

            <div className="mt-3 flex flex-col gap-2">
              {REASONS.map((r) => (
                <label key={r} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="flag-reason"
                    checked={reason === r}
                    onChange={() => setReason(r)}
                  />
                  {t(`flagReason.${r}`)}
                </label>
              ))}
            </div>

            {reason === 'other' && (
              <textarea
                className="mt-2 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder={t('flagDetailsPlaceholder')}
                rows={2}
              />
            )}

            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowDialog(false)}
                className="rounded-lg px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100"
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="rounded-lg bg-amber-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
              >
                {submitting ? t('flagging') : t('submitFlag')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
