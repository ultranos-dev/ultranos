'use client'

import { useTranslations } from 'next-intl'
import { Check } from '@ultranos/ui-kit/icons'

const STEPS = [
  { key: 'VERIFY_PATIENT', translationKey: 'verifyPatient' },
  { key: 'UPLOAD_FILE', translationKey: 'uploadFile' },
  { key: 'TAG_METADATA', translationKey: 'tagMetadata' },
  { key: 'REVIEW_SUBMIT', translationKey: 'reviewSubmit' },
] as const

export type WizardStep = (typeof STEPS)[number]['key']

interface StepIndicatorProps {
  currentStep: WizardStep
}

export function StepIndicator({ currentStep }: StepIndicatorProps) {
  const t = useTranslations('steps')
  const tNav = useTranslations('nav')
  const currentIndex = STEPS.findIndex((s) => s.key === currentStep)

  return (
    <nav data-testid="step-indicator" aria-label={tNav('uploadProgress')} className="flex items-center justify-between gap-2">
      {STEPS.map((step, i) => {
        const isCompleted = i < currentIndex
        const isCurrent = i === currentIndex
        const label = t(step.translationKey)
        const suffix = isCompleted ? t('completedSuffix') : isCurrent ? t('currentSuffix') : ''

        return (
          <div key={step.key} className="flex flex-1 items-center" role="listitem" aria-current={isCurrent ? 'step' : undefined}>
            {/* Step circle */}
            <div className="flex flex-col items-center">
              <div
                aria-label={t('stepLabel', { number: i + 1, label, suffix })}
                className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-colors duration-200 ${
                  isCompleted
                    ? 'bg-green-600 text-white'
                    : isCurrent
                      ? 'bg-primary-600 text-white'
                      : 'bg-muted text-muted-foreground'
                }`}
              >
                {isCompleted ? (
                  <Check size={16} aria-hidden="true" />
                ) : (
                  i + 1
                )}
              </div>
              <span
                className={`mt-1 text-center text-xs ${
                  isCurrent ? 'font-semibold text-primary-700' : 'text-muted-foreground'
                }`}
              >
                {label}
              </span>
            </div>

            {/* Connecting line */}
            {i < STEPS.length - 1 && (
              <div
                className={`mx-2 h-0.5 flex-1 ${
                  i < currentIndex ? 'bg-green-600' : 'bg-muted'
                }`}
              />
            )}
          </div>
        )
      })}
    </nav>
  )
}
