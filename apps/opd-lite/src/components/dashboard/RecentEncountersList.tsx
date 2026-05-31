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
  date: string
  status: string
}

function formatDate(timestamp: string): string {
  try {
    // HLC timestamps have format "ISO_counter_nodeId" — extract ISO portion
    const iso = timestamp.includes('_') ? timestamp.split('_')[0]! : timestamp
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return timestamp
  }
}

function getStatusBadgeClasses(status: string): string {
  switch (status) {
    case 'in-progress':
      return 'bg-pill-green/20 text-pill-text'
    case 'finished':
      return 'bg-neutral-100 text-neutral-600'
    default:
      return 'bg-neutral-100 text-neutral-500'
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case 'in-progress':
      return 'In Progress'
    case 'finished':
      return 'Completed'
    case 'cancelled':
      return 'Cancelled'
    case 'entered-in-error':
      return 'Error'
    default:
      return status.charAt(0).toUpperCase() + status.slice(1)
  }
}

export function RecentEncountersList() {
  const t = useTranslations('dashboard')
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
            let patientName = 'Unknown Patient'
            try {
              if (ref) {
                const patient = await db.patients.get(patientId)
                if (patient) {
                  patientName =
                    patient._ultranos?.nameLocal ??
                    patient.name?.[0]?.text ??
                    'Unknown Patient'
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
        <h3 className="text-lg font-black text-neutral-900">{t('recentEncounters')}</h3>
        <p className="mt-3 text-sm font-semibold text-neutral-400">
          {t('noEncountersYet')}
        </p>
      </Card>
    )
  }

  return (
    <Card>
      <h3 className="text-lg font-black text-neutral-900">{t('recentEncounters')}</h3>
      <ul className="mt-3 divide-y divide-neutral-100" role="list" aria-label="Recent encounters">
        {encounters.map((enc) => (
          <li key={enc.id}>
            <Link
              href={`/encounter/${enc.patientId}`}
              className="flex items-center justify-between gap-3 py-3 transition-colors [@media(hover:hover)and(pointer:fine)]:hover:bg-neutral-50 rounded-lg ps-2 pe-2 -ms-2 -me-2"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-neutral-900">
                  {enc.patientName}
                </p>
                <p className="text-xs font-semibold text-neutral-400">
                  {formatDate(enc.date)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${getStatusBadgeClasses(enc.status)}`}
                >
                  {getStatusLabel(enc.status)}
                </span>
              </div>
            </Link>
            <Link
              href={`/patient/${enc.patientId}`}
              className="block text-end text-xs font-semibold text-primary-500 hover:underline pe-2 pb-1 -mt-1"
              aria-label="View patient chart"
            >
              {t('viewChart')}
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  )
}
