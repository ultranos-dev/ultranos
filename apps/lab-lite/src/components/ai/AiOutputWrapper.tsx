'use client'

import { useTranslations } from 'next-intl'
import { ConfidenceLevel } from '@/lib/confidence'
import { ConfidenceIndicator } from './ConfidenceIndicator'

interface AiOutputWrapperProps {
  /**
   * The AI confidence level for this output.
   * If undefined, the output is blocked and an error state is rendered.
   *
   * ALL AI-generated clinical content MUST be wrapped in AiOutputWrapper.
   * See Story 53.5, AC #4.
   */
  confidence?: ConfidenceLevel
  score?: number
  context: string
  /**
   * Escalation callback. MUST be `triggerAutoEscalation(payload)` for AC 3/7
   * compliance — this wrapper does not call triggerAutoEscalation directly
   * because callers own the escalation payload (sampleId, sourceFeature,
   * aiOutputSummary). Passing a no-op means low-confidence outputs will not
   * trigger Hub API notifications or audit events. Story 53.5, AC 3/7.
   */
  onEscalate?: () => void
  onAcknowledge?: () => void
  children: React.ReactNode
}

/**
 * Mandatory wrapper for all AI-generated content in Lab-Lite.
 *
 * Renders the ConfidenceIndicator above the AI output. If confidence is
 * undefined or missing, blocks the output and shows an error state.
 *
 * Usage:
 * ```tsx
 * <AiOutputWrapper
 *   confidence={ConfidenceLevel.HIGH}
 *   context="CBC anomaly detection"
 *   onEscalate={() => triggerAutoEscalation({ sampleId, sourceFeature, ... })}
 * >
 *   <AnomalyFlagSummary result={result} />
 * </AiOutputWrapper>
 * ```
 */
export function AiOutputWrapper({
  confidence,
  score,
  context,
  onEscalate,
  onAcknowledge,
  children,
}: AiOutputWrapperProps) {
  const t = useTranslations('confidence')

  if (confidence === undefined || confidence === null) {
    return (
      <div
        role="alert"
        className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800"
      >
        {t('missing')}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <ConfidenceIndicator
        level={confidence}
        score={score}
        context={context}
        onEscalate={onEscalate}
        onAcknowledge={onAcknowledge}
      />
      {children}
    </div>
  )
}
