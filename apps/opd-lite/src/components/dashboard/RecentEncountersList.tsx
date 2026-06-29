'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { db } from '@/lib/db'
import { useEncounterStore } from '@/stores/encounter-store'
import { auditPhiAccess, AuditAction, AuditResourceType } from '@/lib/audit'
import { Card } from '@/components/Card'

interface RecentEncounter {
  id: string
  patientId: string
  patientName: string
  nameSegments: string[]
  date: string
  status: string
}

export function formatDate(value: string): string {
  if (!value) return ''
  // HLC serialized format is "<wallMs>:<counter>:<nodeId>" (see serializeHlc):
  // the segment before the first ':' is epoch-millis and is all digits.
  // ISO strings also contain ':' but their head ("2026-05-11T10") is not.
  // `new Date()` never throws — it yields an Invalid Date — so guard explicitly
  // and return '' rather than rendering the literal string "Invalid Date".
  const head = value.split(':')[0]!
  const date = /^\d+$/.test(head) ? new Date(Number(head)) : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getStatusBadgeClasses(status: string): string {
  switch (status) {
    case 'in-progress':
      return 'bg-success/20 text-success'
    case 'finished':
      return 'bg-muted text-muted-foreground'
    default:
      return 'bg-muted text-muted-foreground'
  }
}

function getStatusLabel(status: string, t: (key: string) => string): string {
  switch (status) {
    case 'in-progress':
      return t('statusInProgress')
    case 'finished':
      return t('statusCompleted')
    case 'cancelled':
      return t('statusCancelled')
    case 'entered-in-error':
      return t('statusError')
    default:
      return status.charAt(0).toUpperCase() + status.slice(1)
  }
}

export function RecentEncountersList() {
  const t = useTranslations('dashboard')
  const unknownPatient = t('unknownPatient')
  const [encounters, setEncounters] = useState<RecentEncounter[]>([])
  const activeEncounter = useEncounterStore((s) => s.activeEncounter)

  useEffect(() => {
    async function loadRecent() {
      try {
        const recent = await db.encounters
          .orderBy('_ultranos.hlcTimestamp')
          .reverse()
          .limit(5)
          .toArray()

        const items: RecentEncounter[] = await Promise.all(
          recent.map(async (enc) => {
            const ref = enc.subject?.reference ?? ''
            const patientId = ref.replace('Patient/', '') || enc.id
            let patientName = unknownPatient
            let nameSegments: string[] = []
            try {
              if (ref) {
                const patient = await db.patients.get(patientId)
                if (patient) {
                  const ext = patient._ultranos
                  // Patronymic chain (patient + father + grandfather) for
                  // ring-separated display; falls back to nameLocal below.
                  nameSegments = [
                    [ext?.nameGiven, ext?.nameFamily].filter(Boolean).join(' '),
                    ext?.nameFather,
                    ext?.nameGrandfather,
                  ].filter((s): s is string => !!s && s.trim().length > 0)
                  patientName =
                    ext?.nameLocal ??
                    patient.name?.[0]?.text ??
                    unknownPatient
                  auditPhiAccess(AuditAction.READ, AuditResourceType.PATIENT, patientId, patientId, {
                    context: 'dashboard-recent-encounters',
                  })
                }
              }
            } catch {
              // Patient not in local DB
            }
            return {
              id: enc.id,
              patientId,
              patientName,
              nameSegments,
              date: enc._ultranos?.hlcTimestamp ?? enc.meta?.lastUpdated ?? '',
              status: enc.status,
            }
          })
        )

        setEncounters(items)
      } catch {
        // Dexie unavailable
      }
    }

    loadRecent()
  }, [activeEncounter])

  if (encounters.length === 0) {
    return (
      <Card>
        <h3 className="text-lg font-black text-foreground">{t('recentEncounters')}</h3>
        <p className="mt-3 text-sm font-semibold text-muted-foreground">
          {t('noEncountersYet')}
        </p>
      </Card>
    )
  }

  return (
    <Card>
      <h3 className="text-lg font-black text-foreground">{t('recentEncounters')}</h3>
      <ul className="mt-3 divide-y divide-border" role="list" aria-label={t('recentEncountersAria')}>
        {encounters.map((enc) => (
          <li key={enc.id}>
            <Link
              href={`/encounter/${enc.patientId}`}
              className="flex items-center justify-between gap-3 py-3 transition-colors [@media(hover:hover)and(pointer:fine)]:hover:bg-muted rounded-lg ps-2 pe-2 -ms-2 -me-2"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">
                  {enc.nameSegments.length > 0
                    ? enc.nameSegments.map((seg, i) => (
                        <span key={i}>
                          {i > 0 && (
                            <span
                              className="mx-2 inline-block h-2 w-2 rounded-full border-2 border-muted-foreground/40 align-middle select-none"
                              aria-hidden="true"
                            />
                          )}
                          {seg}
                        </span>
                      ))
                    : enc.patientName}
                </p>
                <p className="text-xs font-semibold text-muted-foreground">
                  {formatDate(enc.date)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${getStatusBadgeClasses(enc.status)}`}
                >
                  {getStatusLabel(enc.status, t)}
                </span>
              </div>
            </Link>
            <Link
              href={`/patient/${enc.patientId}`}
              className="block text-end text-xs font-semibold text-primary-500 hover:underline pe-2 pb-1 -mt-1"
              aria-label={t('viewChartAria')}
            >
              {t('viewChart')}
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  )
}
