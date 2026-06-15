'use client'

/**
 * SelfAssessment — Story 46.2 (Task 5)
 *
 * Renders 2-3 multiple-choice questions at the end of a micro-learning module.
 * On submit: calculates score, shows per-question feedback, writes ModuleCompletion
 * to Dexie with syncStatus='pending'. Assessment is low-stakes — a failed attempt
 * still counts as a completion (assessmentPassed=false) and does not block the tech.
 */

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { addModuleCompletion } from '@/lib/db'
import {
  calculateAssessmentScore,
  isAssessmentPassed,
} from '@/lib/learning-trigger-engine'
import type { AssessmentQuestion, ModuleCompletion } from '@/lib/micro-learning-types'

interface SelfAssessmentProps {
  questions: AssessmentQuestion[]
  moduleId: string
  moduleVersion: string
  technicianId: string
  /** Called when user hits Back on the first screen of the quiz */
  onBack: () => void
  /** Called after completion is persisted */
  onComplete: () => void
}

type Phase = 'quiz' | 'results'

export function SelfAssessment({
  questions,
  moduleId,
  moduleVersion,
  technicianId,
  onBack,
  onComplete,
}: SelfAssessmentProps) {
  const t = useTranslations('learning')

  // Selected answer index per question (null = unanswered)
  const [answers, setAnswers] = useState<(number | null)[]>(
    () => questions.map(() => null),
  )
  const [phase, setPhase] = useState<Phase>('quiz')
  const [persisted, setPersisted] = useState(false)

  // Derived from answers after submission
  const [correctCount, setCorrectCount] = useState(0)
  const [passed, setPassed] = useState(false)

  const allAnswered = answers.every((a) => a !== null)

  async function handleSubmit() {
    const correct = questions.reduce(
      (sum, q, i) => sum + (answers[i] === q.correctIndex ? 1 : 0),
      0,
    )
    const score = calculateAssessmentScore(correct, questions.length)
    const assessmentPassed = isAssessmentPassed(correct, questions.length)

    setCorrectCount(correct)
    setPassed(assessmentPassed)
    setPhase('results')

    // Persist completion record (AC 4, 6)
    if (!persisted) {
      setPersisted(true)
      const completion: ModuleCompletion = {
        id: crypto.randomUUID(),
        moduleId,
        moduleVersion,
        technicianId,
        completedAt: new Date().toISOString(),
        assessmentScore: score,
        assessmentPassed,
        syncStatus: 'pending',
      }
      try {
        await addModuleCompletion(completion)
      } catch {
        // Dexie unavailable — completion will not be persisted this session
      }
    }
  }

  if (phase === 'quiz') {
    return (
      <div className="flex flex-col gap-4" data-testid="self-assessment">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          {t('quizTitle')}
        </h3>

        {questions.map((q, qi) => (
          <div key={q.id} className="flex flex-col gap-2" data-testid={`question-${qi}`}>
            <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
              {qi + 1}. {q.question}
            </p>
            <ul className="space-y-1.5">
              {q.options.map((option, oi) => (
                <li key={oi}>
                  <label className="flex cursor-pointer items-center gap-2 rounded-md border border-gray-200 p-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700">
                    <input
                      type="radio"
                      name={`q-${qi}`}
                      value={oi}
                      checked={answers[qi] === oi}
                      onChange={() =>
                        setAnswers((prev) => {
                          const next = [...prev]
                          next[qi] = oi
                          return next
                        })
                      }
                      className="accent-blue-600"
                      data-testid={`option-${qi}-${oi}`}
                    />
                    {option}
                  </label>
                </li>
              ))}
            </ul>
          </div>
        ))}

        <div className="flex justify-between gap-2 pt-1">
          <button
            type="button"
            onClick={onBack}
            className="rounded border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            data-testid="quiz-back"
          >
            {t('back')}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!allAnswered}
            className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400"
            data-testid="quiz-submit"
          >
            {t('submitQuiz')}
          </button>
        </div>
      </div>
    )
  }

  // Results phase
  return (
    <div className="flex flex-col gap-4" data-testid="assessment-results">
      {/* Score summary */}
      <div
        className={`rounded-lg p-3 ${
          passed
            ? 'border border-green-300 bg-green-50 dark:border-green-700 dark:bg-green-900/20'
            : 'border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/20'
        }`}
        data-testid="assessment-score-banner"
      >
        <p className={`text-sm font-semibold ${passed ? 'text-green-800 dark:text-green-200' : 'text-amber-800 dark:text-amber-200'}`}>
          {passed ? t('assessmentPassed') : t('assessmentFailed')}
        </p>
        <p className={`text-xs mt-0.5 ${passed ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}>
          {t('scoreLabel', { correct: correctCount, total: questions.length })}
        </p>
      </div>

      {/* Per-question feedback */}
      <div className="flex flex-col gap-3">
        {questions.map((q, qi) => {
          const selectedIndex = answers[qi]
          const isCorrect = selectedIndex === q.correctIndex
          return (
            <div key={q.id} data-testid={`result-${qi}`} className="flex flex-col gap-1">
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
                {qi + 1}. {q.question}
              </p>
              <p
                className={`text-xs ${
                  isCorrect
                    ? 'text-green-700 dark:text-green-400'
                    : 'text-red-700 dark:text-red-400'
                }`}
                data-testid={`result-feedback-${qi}`}
              >
                {isCorrect
                  ? t('correct')
                  : t('incorrect', { correctAnswer: q.options[q.correctIndex] ?? '' })}
              </p>
            </div>
          )
        })}
      </div>

      <button
        type="button"
        onClick={onComplete}
        className="w-full rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400"
        data-testid="assessment-done"
      >
        {t('done')}
      </button>
    </div>
  )
}
