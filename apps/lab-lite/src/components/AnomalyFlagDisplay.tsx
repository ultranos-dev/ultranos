'use client'

/**
 * AnomalyFlagDisplay — Story 53.3: AI Anomaly Flagging (Task 5)
 *
 * Renders anomaly flags with Confidence Inversion Principle (Story 53.5):
 *   HIGH  → subtle green badge
 *   MEDIUM → yellow banner with pattern details
 *   LOW   → red full-screen overlay via AiOutputWrapper / ConfidenceIndicator
 *
 * CLAUDE.md safety:
 * - Never names a diagnosis — descriptions use pattern language only.
 * - Disclaimer is mandatory on every flag (AC: 5).
 * - All text via useTranslations('anomalyFlags') for RTL + i18n support.
 * - Uses logical CSS properties throughout for RTL compatibility.
 */

import { useTranslations } from 'next-intl'
import { AiOutputWrapper } from '@/components/ai/AiOutputWrapper'
import { ConfidenceLevel } from '@/lib/confidence'
import type { AnomalyFlag } from '@/lib/anomaly-engine'

interface AnomalyFlagDisplayProps {
  flags: AnomalyFlag[]
  onEscalate?: () => void
  onAcknowledge?: () => void
}

/**
 * Renders all anomaly flags for a result, grouped by worst confidence level.
 *
 * The AiOutputWrapper renders the ConfidenceIndicator for the highest-severity
 * (lowest-confidence) flag first, satisfying the Confidence Inversion Principle.
 * Individual flag cards are rendered below.
 */
export function AnomalyFlagDisplay({
  flags,
  onEscalate,
  onAcknowledge,
}: AnomalyFlagDisplayProps) {
  const t = useTranslations('anomalyFlags')

  if (flags.length === 0) return null

  // Determine the worst confidence level across all flags
  // LOW < MEDIUM < HIGH — lowest confidence drives the loudest indicator
  const worstConfidence = flags.reduce<ConfidenceLevel>((worst, flag) => {
    const order: Record<ConfidenceLevel, number> = {
      [ConfidenceLevel.HIGH]: 2,
      [ConfidenceLevel.MEDIUM]: 1,
      [ConfidenceLevel.LOW]: 0,
    }
    return order[flag.confidence] < order[worst] ? flag.confidence : worst
  }, ConfidenceLevel.HIGH)

  return (
    <section
      aria-labelledby="anomaly-flags-heading"
      className="flex flex-col gap-3"
    >
      <h3
        id="anomaly-flags-heading"
        className="text-sm font-semibold text-foreground dark:text-muted-foreground"
      >
        {t('sectionTitle')}
      </h3>

      {/* Confidence Inversion Indicator via shared AiOutputWrapper (Story 53.5) */}
      <AiOutputWrapper
        confidence={worstConfidence}
        context={t('contextLabel', { count: flags.length })}
        onEscalate={onEscalate}
        onAcknowledge={onAcknowledge}
      >
        <div className="flex flex-col gap-2">
          {flags.map((flag) => (
            <FlagCard key={flag.ruleId} flag={flag} />
          ))}
        </div>
      </AiOutputWrapper>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Individual flag card
// ---------------------------------------------------------------------------

function FlagCard({ flag }: { flag: AnomalyFlag }) {
  const t = useTranslations('anomalyFlags')

  const severityStyle = {
    urgent:   'border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/30',
    elevated: 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30',
    notable:  'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30',
  }[flag.severity]

  const confidencePillStyle = {
    [ConfidenceLevel.HIGH]:   'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
    [ConfidenceLevel.MEDIUM]: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
    [ConfidenceLevel.LOW]:    'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  }[flag.confidence]

  return (
    <article
      className={[
        'rounded-lg border p-3 flex flex-col gap-2',
        severityStyle,
      ].join(' ')}
      aria-label={flag.ruleName}
    >
      {/* Header row: severity badge + confidence pill */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground dark:text-muted-foreground">
          {t(`severity.${flag.severity}`)}
        </span>
        <span className={['rounded-full px-2 py-0.5 text-xs font-medium', confidencePillStyle].join(' ')}>
          {t(`confidence.${flag.confidence.toLowerCase()}`)}
        </span>
      </div>

      {/* Pattern description — i18n key, NEVER a diagnosis */}
      <p className="text-sm font-medium text-foreground dark:text-foreground">
        {t(flag.descriptionKey)}
      </p>

      {/* Matched field codes (traceability — no values) */}
      {flag.matchedConditions.length > 0 && (
        <p className="text-xs text-muted-foreground dark:text-muted-foreground">
          {t('matchedFields')}: {flag.matchedConditions.join(', ')}
        </p>
      )}

      {/* Mandatory disclaimer — AC: 5 */}
      <p className="text-xs italic text-muted-foreground dark:text-muted-foreground border-t border-border dark:border-border pt-2 mt-1">
        {flag.disclaimer}
      </p>
    </article>
  )
}
