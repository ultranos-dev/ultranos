'use client'

/**
 * ModuleViewer — Story 46.2 (Task 4)
 *
 * Step-through UI for a micro-learning module:
 *  1. Step-by-step content (one step at a time, forward/back navigation)
 *  2. Key tips section (after all steps)
 *  3. Self-assessment quiz at the end
 *
 * All images are base64-encoded within the module record (offline-safe, no CDN).
 * RTL-compatible: navigation arrows mirror via CSS logical properties.
 */

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import type { MicroLearningModule } from '@/lib/micro-learning-types'
import { X } from '@ultranos/ui-kit/icons'
import { SelfAssessment } from '@/components/learning/SelfAssessment'

type ViewerPhase = 'steps' | 'tips' | 'quiz'

interface ModuleViewerProps {
  module: MicroLearningModule
  technicianId: string
  onComplete: () => void
  onClose: () => void
}

export function ModuleViewer({
  module,
  technicianId,
  onComplete,
  onClose,
}: ModuleViewerProps) {
  const t = useTranslations('learning')
  const [phase, setPhase] = useState<ViewerPhase>('steps')
  const [stepIndex, setStepIndex] = useState(0)

  const currentStep = module.content[stepIndex]
  const totalSteps = module.content.length
  const isFirstStep = stepIndex === 0
  const isLastStep = stepIndex === totalSteps - 1

  function handleNext() {
    if (!isLastStep) {
      setStepIndex((i) => i + 1)
    } else {
      setPhase('tips')
    }
  }

  function handleBack() {
    if (phase === 'tips') {
      setPhase('steps')
    } else if (phase === 'quiz') {
      setPhase('tips')
    } else if (!isFirstStep) {
      setStepIndex((i) => i - 1)
    }
  }

  return (
    <div
      className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 shadow-lg"
      data-testid="module-viewer"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-foreground">
            {module.title}
          </h2>
          <p className="text-xs text-muted-foreground">
            {module.procedureName} · {module.durationMinutes} {t('minutes')}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('close')}
          className="rounded p-1 text-muted-foreground hover:text-muted-foreground dark:hover:text-gray-200"
          data-testid="module-viewer-close"
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>

      {/* Phase: Steps */}
      {phase === 'steps' && currentStep && (
        <div className="flex flex-col gap-3" data-testid="module-step">
          {/* Progress */}
          <p className="text-xs font-medium text-muted-foreground">
            {t('stepOf', { current: stepIndex + 1, total: totalSteps })}
          </p>

          {/* Step content — markdown rendered as plain text for simplicity */}
          <div
            className="prose prose-sm max-w-none dark:prose-invert"
            data-testid="step-content"
          >
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground">
              {currentStep.text}
            </pre>
          </div>

          {/* Step image (optional) */}
          {currentStep.imageBase64 && currentStep.imageMimeType && (
            <img
              src={`data:${currentStep.imageMimeType};base64,${currentStep.imageBase64}`}
              alt={currentStep.imageAlt ?? ''}
              className="max-h-48 w-auto rounded-lg border border-border"
              data-testid="step-image"
            />
          )}

          {/* Navigation */}
          <div className="flex justify-between gap-2 pt-1">
            <button
              type="button"
              onClick={handleBack}
              disabled={isFirstStep}
              className="rounded border border-border px-3 py-1.5 text-sm font-medium text-foreground disabled:opacity-40 hover:bg-muted"
              data-testid="step-back"
            >
              {t('back')}
            </button>
            <button
              type="button"
              onClick={handleNext}
              className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary/90 dark:bg-primary dark:hover:bg-blue-400"
              data-testid="step-next"
            >
              {isLastStep ? t('viewTips') : t('next')}
            </button>
          </div>
        </div>
      )}

      {/* Phase: Key Tips */}
      {phase === 'tips' && (
        <div className="flex flex-col gap-3" data-testid="module-tips">
          <h3 className="text-sm font-semibold text-foreground">
            {t('keyTips')}
          </h3>
          <ul className="space-y-2">
            {module.keyTips.map((tip, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                <span className="mt-0.5 flex-shrink-0 text-primary">✓</span>
                {tip}
              </li>
            ))}
          </ul>

          <div className="flex justify-between gap-2 pt-1">
            <button
              type="button"
              onClick={handleBack}
              className="rounded border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted"
              data-testid="tips-back"
            >
              {t('back')}
            </button>
            <button
              type="button"
              onClick={() => setPhase('quiz')}
              className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary/90 dark:bg-primary dark:hover:bg-blue-400"
              data-testid="tips-start-quiz"
            >
              {t('startQuiz')}
            </button>
          </div>
        </div>
      )}

      {/* Phase: Self-Assessment Quiz */}
      {phase === 'quiz' && (
        <SelfAssessment
          questions={module.selfAssessment}
          moduleId={module.id}
          moduleVersion={module.version}
          technicianId={technicianId}
          onBack={handleBack}
          onComplete={onComplete}
        />
      )}
    </div>
  )
}
