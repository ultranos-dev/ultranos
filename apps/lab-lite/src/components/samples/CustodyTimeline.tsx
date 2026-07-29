'use client'

import { useTranslations, useLocale } from 'next-intl'
import type { CustodyEvent, CustodyEventType } from '@/types/custody-event'
import { RefreshCw, CircleX } from '@ultranos/ui-kit/icons'

/**
 * CustodyTimeline — read-only vertical timeline of all custody events for a sample.
 * AC 5, 6: Ordered chronologically. Event type icons are semantic (not directional)
 * and must NOT mirror in RTL.
 */

interface CustodyTimelineProps {
  events: CustodyEvent[]
  /** Optional: practitioner name lookup cache (ID → display name). Falls back to ID. */
  practitionerNames?: Record<string, string>
}

const EVENT_TYPE_CONFIG: Record<
  CustodyEventType,
  { colorClass: string; bgClass: string; icon: React.ReactNode }
> = {
  received: {
    colorClass: 'text-primary',
    bgClass: 'bg-primary/10 ring-primary',
    icon: (
      // Inbox icon — semantic, not directional
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        style={{ transform: 'none' }} // prevent RTL mirroring
      >
        <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
        <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
      </svg>
    ),
  },
  handoff: {
    colorClass: 'text-amber-600',
    bgClass: 'bg-amber-50 ring-amber-200',
    icon: (
      // Arrow-right-left icon — semantic (indicates transfer), not directional
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        style={{ transform: 'none' }}
      >
        <path d="m17 4 4 4-4 4" />
        <path d="M3 8h18" />
        <path d="m7 20-4-4 4-4" />
        <path d="M21 16H3" />
      </svg>
    ),
  },
  'status-change': {
    colorClass: 'text-green-600',
    bgClass: 'bg-green-50 ring-green-200',
    icon: (
      <RefreshCw size={14} aria-hidden="true" style={{ transform: 'none' }} />
    ),
  },
  rejection: {
    colorClass: 'text-red-600',
    bgClass: 'bg-red-50 ring-red-200',
    icon: (
      <CircleX size={14} aria-hidden="true" style={{ transform: 'none' }} />
    ),
  },
}

function formatTimestamp(hlcTimestamp: string, locale: string): string {
  // HLC timestamps include a wall-clock component — extract the ISO portion
  // HLC format: "<wallMs>-<counter>-<nodeId>" — wallMs is Unix epoch in ms
  try {
    const [wallMsPart] = hlcTimestamp.split('-')
    const wallMs = parseInt(wallMsPart, 10)
    if (!isNaN(wallMs) && wallMs > 0) {
      return new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(wallMs))
    }
  } catch {
    // fall through to raw display
  }
  return hlcTimestamp
}

export function CustodyTimeline({ events, practitionerNames = {} }: CustodyTimelineProps) {
  const t = useTranslations('samples.timeline')
  const locale = useLocale()

  if (events.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center" data-testid="timeline-empty">
        {t('empty')}
      </p>
    )
  }

  function actorName(id: string): string {
    return practitionerNames[id] ?? id
  }

  return (
    <ol className="relative" data-testid="custody-timeline" aria-label={t('ariaLabel')}>
      {events.map((event, index) => {
        const config = EVENT_TYPE_CONFIG[event.eventType]
        const isLast = index === events.length - 1

        return (
          <li key={event.id} className="relative flex gap-4">
            {/* Vertical connector line (RTL-safe: border-inline-start) */}
            {!isLast && (
              <span
                className="absolute start-4 top-8 bottom-0 w-0 border-2 border-border"
                aria-hidden="true"
              />
            )}

            {/* Icon node */}
            <span
              className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-2 ${config.bgClass} ${config.colorClass} mt-0.5`}
              aria-hidden="true"
            >
              {config.icon}
            </span>

            {/* Content */}
            <div className={`pb-6 ${isLast ? '' : ''} min-w-0 flex-1`}>
              <div className="flex items-start justify-between gap-2">
                <p className={`text-sm font-semibold ${config.colorClass}`}>
                  {t(`eventTypes.${event.eventType}`)}
                  {event.eventType === 'status-change' && event.toStatus && (
                    <span className="ms-1 font-normal text-muted-foreground">
                      : {t(`pipelineStatus.${event.toStatus.replace('-', '_')}`)}
                    </span>
                  )}
                </p>
                <time
                  dateTime={event.timestamp}
                  className="shrink-0 text-xs text-muted-foreground"
                >
                  {formatTimestamp(event.timestamp, locale)}
                </time>
              </div>

              {/* Actor info */}
              <p className="mt-0.5 text-xs text-muted-foreground">
                {event.eventType === 'handoff'
                  ? t('handoffActors', {
                      from: actorName(event.fromActorId),
                      to: actorName(event.toActorId),
                    })
                  : t('actor', { actor: actorName(event.fromActorId) })}
              </p>

              {/* Notes */}
              {event.notes && (
                <p className="mt-1 text-xs italic text-muted-foreground">
                  &ldquo;{event.notes}&rdquo;
                </p>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
