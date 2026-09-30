'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { db } from '@/lib/db'
import { getPatientPhotoUrl } from '@/lib/patient-photo-api'
import { useEncounterStore } from '@/stores/encounter-store'
import { auditPhiAccess, AuditAction, AuditResourceType } from '@/lib/audit'
import { Avatar } from '@ultranos/ui-kit/components/ui/avatar'
import { ArrowRight } from '@ultranos/ui-kit/icons'
import { DirectionalIcon } from '@ultranos/ui-kit'
import { formatDate } from './RecentEncountersList'

interface ResumeTarget {
  patientId: string
  patientName: string
  nameSegments: string[]
  date: string
}

/**
 * Calm-launcher "Resume consultation" strip.
 *
 * Surfaces the most recent in-progress encounter so a clinician can pick up
 * exactly where they left off — the single most useful start-of-shift action.
 * Renders nothing when there is no in-progress encounter (no empty box noise).
 */
export function ResumeEncounterStrip() {
  const t = useTranslations('dashboard')
  const unknownPatient = t('unknownPatient')
  const [target, setTarget] = useState<ResumeTarget | null>(null)
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const activeEncounter = useEncounterStore((s) => s.activeEncounter)

  useEffect(() => {
    let cancelled = false

    async function loadResume() {
      try {
        const recent = await db.encounters
          .orderBy('_ultranos.hlcTimestamp')
          .reverse()
          .limit(10)
          .toArray()

        const inProgress = recent.find((e) => e.status === 'in-progress')
        if (!inProgress) {
          if (!cancelled) setTarget(null)
          return
        }

        const ref = inProgress.subject?.reference ?? ''
        const patientId = ref.replace('Patient/', '') || inProgress.id
        let patientName = unknownPatient
        let nameSegments: string[] = []
        try {
          if (ref) {
            const patient = await db.patients.get(patientId)
            if (patient) {
              const ext = patient._ultranos
              nameSegments = [
                [ext?.nameGiven, ext?.nameFamily].filter(Boolean).join(' '),
                ext?.nameFather,
                ext?.nameGrandfather,
              ].filter((s): s is string => !!s && s.trim().length > 0)
              patientName = ext?.nameLocal ?? patient.name?.[0]?.text ?? unknownPatient
              auditPhiAccess(AuditAction.READ, AuditResourceType.PATIENT, patientId, patientId, {
                context: 'dashboard-resume-encounter',
              })
            }
          }
        } catch {
          // Patient not in local DB — fall back to unknown label
        }

        if (!cancelled) {
          setTarget({
            patientId,
            patientName,
            nameSegments,
            date: inProgress._ultranos?.hlcTimestamp ?? inProgress.meta?.lastUpdated ?? '',
          })
        }
      } catch {
        // Dexie unavailable — hide the strip rather than show a broken state
        if (!cancelled) setTarget(null)
      }
    }

    void loadResume()
    return () => { cancelled = true }
  }, [activeEncounter, unknownPatient])

  useEffect(() => {
    if (!target?.patientId) { setPhotoUrl(null); return }
    let cancelled = false
    const controller = new AbortController()
    ;(async () => {
      const url = await getPatientPhotoUrl(target.patientId, controller.signal)
      if (!cancelled) setPhotoUrl(url ?? null)
    })()
    return () => { cancelled = true; controller.abort() }
  }, [target?.patientId])

  if (!target) return null

  const displayName =
    target.nameSegments.length > 0 ? target.nameSegments.join(' ') : target.patientName

  return (
    <Link
      href={`/encounter/${target.patientId}`}
      data-testid="resume-encounter-strip"
      className="flex items-center gap-3 rounded-2xl border border-primary/30 bg-primary/[0.06] p-4 transition-colors [@media(hover:hover)and(pointer:fine)]:hover:bg-primary/10"
    >
      <Avatar src={photoUrl} name={displayName} size={40} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">
          {displayName}
        </p>
        <p className="text-xs font-semibold text-muted-foreground font-numeric">
          {t('statusInProgress')} · {formatDate(target.date)}
        </p>
      </div>
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
        {t('continue')}
        <DirectionalIcon category="navigation">
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </DirectionalIcon>
      </span>
    </Link>
  )
}
