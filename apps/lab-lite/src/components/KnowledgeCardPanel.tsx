'use client'

/**
 * KnowledgeCardPanel — Story 53.1 (AC: 1, 5, 6, 9)
 *
 * Collapsible right-side panel displaying matching physician-authored
 * knowledge cards based on the current result entry values.
 *
 * Design constraints:
 * - Appears only when cards are present (no "no cards" empty state)
 * - Non-modal: techs can continue entering data while the panel is open
 * - RTL-compatible: uses logical CSS properties (inset-inline-end, etc.)
 * - Critical cards have a red left border and pulsing indicator
 * - All text via useTranslations('knowledgeCards')
 */

import { useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { ChevronDown, X, User } from '@ultranos/ui-kit/icons'
import type { KnowledgeCard } from '@/lib/knowledge-cards'

export interface KnowledgeCardPanelProps {
  cards: KnowledgeCard[]
  onDismiss: () => void
  onPin: (cardId: string) => void
}

// ---------------------------------------------------------------------------
// Severity badge
// ---------------------------------------------------------------------------

function SeverityBadge({ severity }: { severity: KnowledgeCard['severity'] }) {
  const t = useTranslations('knowledgeCards')
  const styles: Record<KnowledgeCard['severity'], string> = {
    // Use semantic oklch token for critical (maps to destructive in the shared token system).
    // Warning/informational use Tailwind scale utilities — no project-level semantic token
    // exists for these severity levels; amber/blue are the closest standard equivalents.
    critical:
      'bg-destructive/10 text-destructive border border-destructive/30',
    warning:
      'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-300 dark:border-amber-700',
    informational:
      'bg-primary/10 text-primary border border-primary dark:border-primary',
  }
  return (
    <span
      className={[
        'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide',
        styles[severity],
      ].join(' ')}
    >
      {severity === 'critical' && (
        <span
          aria-hidden="true"
          className="size-1.5 animate-pulse rounded-full bg-red-600 dark:bg-red-400"
        />
      )}
      {t(`severity.${severity}`)}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Single knowledge card
// ---------------------------------------------------------------------------

function KnowledgeCardItem({
  card,
  onPin,
}: {
  card: KnowledgeCard
  onPin: (cardId: string) => void
}) {
  const t = useTranslations()
  const [contextOpen, setContextOpen] = useState(false)

  const isCritical = card.severity === 'critical'
  const toggleContext = useCallback(() => setContextOpen((v) => !v), [])

  return (
    <article
      aria-label={t(card.title)}
      className={[
        'rounded-md border bg-card dark:bg-card',
        isCritical
          ? 'border-s-4 border-s-red-500 border-border dark:border-border'
          : 'border-border dark:border-border',
      ].join(' ')}
    >
      {/* Card header */}
      <div className="flex items-start justify-between gap-2 p-3">
        <div className="flex min-w-0 flex-col gap-1">
          <SeverityBadge severity={card.severity} />
          <h3 className="text-sm font-semibold leading-snug text-foreground dark:text-foreground">
            {t(card.title)}
          </h3>
          <p className="text-xs text-muted-foreground dark:text-muted-foreground">
            {t(card.condition)}
          </p>
        </div>
        {/* Pin button */}
        <button
          type="button"
          onClick={() => onPin(card.id)}
          aria-label={t('knowledgeCards.pinCard', { title: t(card.title) })}
          className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring dark:hover:bg-card dark:hover:text-muted-foreground"
        >
          {/* Pin icon (simple SVG) */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="12" y1="17" x2="12" y2="22" />
            <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
          </svg>
        </button>
      </div>

      {/* Recommended actions */}
      <div className="border-t border-border/50 px-3 py-2 dark:border-border">
        <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground dark:text-muted-foreground">
          {t('knowledgeCards.recommendedActions')}
        </p>
        <ol className="list-decimal space-y-1 ps-4">
          {card.actions.map((actionKey) => (
            <li
              key={actionKey}
              className="text-xs font-medium leading-snug text-foreground dark:text-foreground"
            >
              {t(actionKey)}
            </li>
          ))}
        </ol>
      </div>

      {/* Collapsible clinical context */}
      <div className="border-t border-border/50 dark:border-border">
        <button
          type="button"
          onClick={toggleContext}
          aria-expanded={contextOpen}
          className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-medium text-muted-foreground hover:bg-muted/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring dark:hover:bg-card dark:text-muted-foreground"
        >
          <span>{t('knowledgeCards.clinicalContext')}</span>
          <ChevronDown
            size={12}
            aria-hidden="true"
            className={['transition-transform duration-150', contextOpen ? 'rotate-180' : ''].join(' ')}
          />
        </button>
        {contextOpen && (
          <p className="px-3 pb-3 text-xs leading-relaxed text-muted-foreground dark:text-muted-foreground">
            {t(card.clinicalContext)}
          </p>
        )}
      </div>

      {/* Author attribution */}
      <div className="flex items-center gap-2 border-t border-border/50 px-3 py-2 dark:border-border">
        <User size={12} aria-hidden="true" className="shrink-0 text-muted-foreground" />
        <span className="truncate text-xs text-muted-foreground dark:text-muted-foreground">
          {card.author.name}, {card.author.credentials}
          {' · '}
          {t('knowledgeCards.version', { version: card.version })}
        </span>
      </div>
    </article>
  )
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

export function KnowledgeCardPanel({
  cards,
  onDismiss,
  onPin,
}: KnowledgeCardPanelProps) {
  const t = useTranslations('knowledgeCards')
  const [collapsed, setCollapsed] = useState(false)

  // AC: 9 — never render if no cards
  if (cards.length === 0) return null

  const hasCritical = cards.some((c) => c.severity === 'critical')

  return (
    <aside
      aria-label={t('panelLabel')}
      className={[
        // Positioned at inline-end for RTL/LTR compatibility (logical CSS)
        'flex w-80 shrink-0 flex-col rounded-lg border shadow-md',
        hasCritical
          ? 'border-red-200 bg-red-50/60 dark:border-red-800 dark:bg-red-950/30'
          : 'border-border bg-muted/30 dark:border-border dark:bg-card/60',
        // Collapsed: show only the header row (~44px). Use a min-height on the
        // header itself rather than max-h on the aside so translated/long labels
        // can never clip the collapse/dismiss buttons.
        collapsed ? 'overflow-hidden' : '',
      ].join(' ')}
    >
      {/* Panel header */}
      <div
        className={[
          'flex items-center justify-between px-3 py-2.5',
          hasCritical
            ? 'border-b border-red-200 dark:border-red-800'
            : 'border-b border-border dark:border-border',
        ].join(' ')}
      >
        <div className="flex items-center gap-2">
          {hasCritical && (
            <span
              aria-hidden="true"
              className="size-2 animate-pulse rounded-full bg-red-500"
            />
          )}
          <span className="text-xs font-semibold uppercase tracking-wide text-foreground dark:text-muted-foreground">
            {t('panelTitle')}
          </span>
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs font-bold tabular-nums text-foreground dark:bg-muted dark:text-muted-foreground">
            {cards.length}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {/* Collapse / expand */}
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? t('expand') : t('collapse')}
            aria-expanded={!collapsed}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-muted-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring dark:hover:bg-card dark:hover:text-muted-foreground"
          >
            <ChevronDown
              size={14}
              aria-hidden="true"
              className={['transition-transform duration-150', collapsed ? '' : 'rotate-180'].join(' ')}
            />
          </button>
          {/* Dismiss */}
          <button
            type="button"
            onClick={onDismiss}
            aria-label={t('dismiss')}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-muted-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring dark:hover:bg-card dark:hover:text-muted-foreground"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Scrollable card list */}
      {!collapsed && (
        <ul className="flex flex-col gap-2 overflow-y-auto p-2" role="list">
          {cards.map((card) => (
            <li key={card.id} role="listitem">
              <KnowledgeCardItem card={card} onPin={onPin} />
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}
