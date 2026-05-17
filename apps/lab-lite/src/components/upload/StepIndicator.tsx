'use client'

const STEPS = [
  { key: 'VERIFY_PATIENT', label: 'Verify Patient' },
  { key: 'UPLOAD_FILE', label: 'Upload File' },
  { key: 'TAG_METADATA', label: 'Tag Metadata' },
  { key: 'REVIEW_SUBMIT', label: 'Review & Submit' },
] as const

export type WizardStep = (typeof STEPS)[number]['key']

interface StepIndicatorProps {
  currentStep: WizardStep
}

export function StepIndicator({ currentStep }: StepIndicatorProps) {
  const currentIndex = STEPS.findIndex((s) => s.key === currentStep)

  return (
    <nav data-testid="step-indicator" aria-label="Upload progress" className="flex items-center justify-between gap-2">
      {STEPS.map((step, i) => {
        const isCompleted = i < currentIndex
        const isCurrent = i === currentIndex

        return (
          <div key={step.key} className="flex flex-1 items-center" role="listitem" aria-current={isCurrent ? 'step' : undefined}>
            {/* Step circle */}
            <div className="flex flex-col items-center">
              <div
                aria-label={`Step ${i + 1}: ${step.label}${isCompleted ? ' (completed)' : isCurrent ? ' (current)' : ''}`}
                className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
                  isCompleted
                    ? 'bg-green-600 text-white'
                    : isCurrent
                      ? 'bg-primary-600 text-white'
                      : 'bg-neutral-200 text-neutral-500'
                }`}
              >
                {isCompleted ? (
                  <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                ) : (
                  i + 1
                )}
              </div>
              <span
                className={`mt-1 text-center text-xs ${
                  isCurrent ? 'font-semibold text-primary-700' : 'text-neutral-500'
                }`}
              >
                {step.label}
              </span>
            </div>

            {/* Connecting line */}
            {i < STEPS.length - 1 && (
              <div
                className={`mx-2 h-0.5 flex-1 ${
                  i < currentIndex ? 'bg-green-600' : 'bg-neutral-200'
                }`}
              />
            )}
          </div>
        )
      })}
    </nav>
  )
}
