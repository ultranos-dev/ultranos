/**
 * SelfAssessment Component Tests — Story 46.2 (Task 5, 8)
 * Tests: question rendering, answer selection, scoring, pass/fail feedback,
 *        completion record persisted to Dexie.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import 'fake-indexeddb/auto'

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    const msgs: Record<string, string> = {
      back: 'Back',
      submitQuiz: 'Submit',
      quizTitle: 'Self-Check',
      assessmentPassed: 'Well done!',
      assessmentFailed: 'Keep learning.',
      scoreLabel: '{correct} of {total} correct',
      correct: 'Correct',
      incorrect: 'Incorrect. The right answer: {correctAnswer}',
      done: 'Done',
    }
    let msg = msgs[key] ?? key
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        msg = msg.replace(`{${k}}`, String(v))
      })
    }
    return msg
  },
}))

// Capture addModuleCompletion calls for verification
const mockAddModuleCompletion = vi.fn().mockResolvedValue('comp-1')
vi.mock('../lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/db')>()
  return {
    ...actual,
    addModuleCompletion: (...args: unknown[]) => mockAddModuleCompletion(...args),
  }
})

import { SelfAssessment } from '../components/learning/SelfAssessment'
import type { AssessmentQuestion } from '../lib/micro-learning-types'

const questions: AssessmentQuestion[] = [
  {
    id: 'q1',
    question: 'What is the first step?',
    options: ['Collect sample', 'Run QC', 'Label tube'],
    correctIndex: 0,
  },
  {
    id: 'q2',
    question: 'How are reagents stored?',
    options: ['Room temp', 'Refrigerated', 'Frozen'],
    correctIndex: 1,
  },
  {
    id: 'q3',
    question: 'What does CBC stand for?',
    options: ['Complete Blood Count', 'Cell Blood Check', 'Count Blood Cells'],
    correctIndex: 0,
  },
]

describe('SelfAssessment — quiz phase (Task 5)', () => {
  const onBack = vi.fn()
  const onComplete = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders all questions', () => {
    render(
      <SelfAssessment
        questions={questions}
        moduleId="mod-1"
        moduleVersion="1.0.0"
        technicianId="tech-1"
        onBack={onBack}
        onComplete={onComplete}
      />
    )

    expect(screen.getByTestId('self-assessment')).toBeDefined()
    expect(screen.getByTestId('question-0')).toBeDefined()
    expect(screen.getByTestId('question-1')).toBeDefined()
    expect(screen.getByTestId('question-2')).toBeDefined()
    expect(screen.getByText(/What is the first step/)).toBeDefined()
  })

  it('Submit is disabled until all questions are answered', () => {
    render(
      <SelfAssessment
        questions={questions}
        moduleId="mod-1"
        moduleVersion="1.0.0"
        technicianId="tech-1"
        onBack={onBack}
        onComplete={onComplete}
      />
    )

    const submitBtn = screen.getByTestId('quiz-submit') as HTMLButtonElement
    expect(submitBtn.disabled).toBe(true)
  })

  it('Submit enabled after all questions answered', () => {
    render(
      <SelfAssessment
        questions={questions}
        moduleId="mod-1"
        moduleVersion="1.0.0"
        technicianId="tech-1"
        onBack={onBack}
        onComplete={onComplete}
      />
    )

    // Answer all 3 questions
    fireEvent.click(screen.getByTestId('option-0-0'))
    fireEvent.click(screen.getByTestId('option-1-1'))
    fireEvent.click(screen.getByTestId('option-2-0'))

    const submitBtn = screen.getByTestId('quiz-submit') as HTMLButtonElement
    expect(submitBtn.disabled).toBe(false)
  })

  it('calls onBack when Back clicked', () => {
    render(
      <SelfAssessment
        questions={questions}
        moduleId="mod-1"
        moduleVersion="1.0.0"
        technicianId="tech-1"
        onBack={onBack}
        onComplete={onComplete}
      />
    )

    fireEvent.click(screen.getByTestId('quiz-back'))
    expect(onBack).toHaveBeenCalledOnce()
  })
})

describe('SelfAssessment — results phase (Task 5)', () => {
  const onBack = vi.fn()
  const onComplete = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  async function submitWithAnswers(correctIndices: number[]) {
    render(
      <SelfAssessment
        questions={questions}
        moduleId="mod-1"
        moduleVersion="1.0.0"
        technicianId="tech-1"
        onBack={onBack}
        onComplete={onComplete}
      />
    )

    // Answer questions with specified indices
    correctIndices.forEach((idx, qi) => {
      fireEvent.click(screen.getByTestId(`option-${qi}-${idx}`))
    })

    fireEvent.click(screen.getByTestId('quiz-submit'))
    await waitFor(() => screen.getByTestId('assessment-results'))
  }

  it('shows passed banner when all correct (3/3 = 100%)', async () => {
    // All correct: q1→0, q2→1, q3→0
    await submitWithAnswers([0, 1, 0])

    const banner = screen.getByTestId('assessment-score-banner')
    expect(banner.textContent).toContain('Well done!')
    expect(banner.textContent).toContain('3 of 3 correct')
  })

  it('shows passed banner when 2/3 correct (66.7% >= 66%)', async () => {
    // 2 correct: q1→0, q2→1, q3→wrong(1)
    await submitWithAnswers([0, 1, 1])

    expect(screen.getByTestId('assessment-score-banner').textContent).toContain('Well done!')
  })

  it('shows failed banner when 1/3 correct (33% < 66%)', async () => {
    // 1 correct: q1→0, q2→wrong(0), q3→wrong(1)
    await submitWithAnswers([0, 0, 1])

    expect(screen.getByTestId('assessment-score-banner').textContent).toContain('Keep learning.')
    expect(screen.getByTestId('assessment-score-banner').textContent).toContain('1 of 3 correct')
  })

  it('shows per-question correct/incorrect feedback', async () => {
    await submitWithAnswers([0, 0, 0]) // q1 correct, q2 wrong, q3 correct

    expect(screen.getByTestId('result-feedback-0').textContent).toContain('Correct')
    expect(screen.getByTestId('result-feedback-1').textContent).toContain('Incorrect')
    expect(screen.getByTestId('result-feedback-2').textContent).toContain('Correct')
  })

  it('incorrect feedback shows the right answer', async () => {
    await submitWithAnswers([0, 0, 0]) // q2 wrong: 0 selected, correct is 1 = 'Refrigerated'

    const feedback1 = screen.getByTestId('result-feedback-1')
    expect(feedback1.textContent).toContain('Refrigerated')
  })

  it('persists ModuleCompletion to Dexie with syncStatus=pending', async () => {
    await submitWithAnswers([0, 1, 0]) // all correct

    await waitFor(() => {
      expect(mockAddModuleCompletion).toHaveBeenCalledOnce()
    })

    const [completion] = mockAddModuleCompletion.mock.calls[0]!
    expect(completion.moduleId).toBe('mod-1')
    expect(completion.moduleVersion).toBe('1.0.0')
    expect(completion.technicianId).toBe('tech-1')
    expect(completion.assessmentScore).toBeCloseTo(1)
    expect(completion.assessmentPassed).toBe(true)
    expect(completion.syncStatus).toBe('pending')
  })

  it('persists failed completion with assessmentPassed=false (low-stakes)', async () => {
    await submitWithAnswers([1, 0, 1]) // all wrong

    await waitFor(() => {
      expect(mockAddModuleCompletion).toHaveBeenCalledOnce()
    })

    const [completion] = mockAddModuleCompletion.mock.calls[0]!
    expect(completion.assessmentPassed).toBe(false)
    // Still records the completion — not blocking
    expect(completion.syncStatus).toBe('pending')
  })

  it('calls onComplete when Done clicked', async () => {
    await submitWithAnswers([0, 1, 0])

    fireEvent.click(screen.getByTestId('assessment-done'))
    expect(onComplete).toHaveBeenCalledOnce()
  })

  it('does not persist twice if submitted once already', async () => {
    // The component tracks `persisted` state internally
    await submitWithAnswers([0, 1, 0])

    expect(mockAddModuleCompletion).toHaveBeenCalledOnce()
  })
})

describe('SelfAssessment — RTL snapshot (Task 8)', () => {
  it('renders correctly in LTR', () => {
    const { container } = render(
      <div dir="ltr">
        <SelfAssessment
          questions={questions}
          moduleId="mod-1"
          moduleVersion="1.0.0"
          technicianId="tech-1"
          onBack={vi.fn()}
          onComplete={vi.fn()}
        />
      </div>
    )
    expect(container).toMatchSnapshot()
  })

  it('renders correctly in RTL', () => {
    const { container } = render(
      <div dir="rtl">
        <SelfAssessment
          questions={questions}
          moduleId="mod-1"
          moduleVersion="1.0.0"
          technicianId="tech-1"
          onBack={vi.fn()}
          onComplete={vi.fn()}
        />
      </div>
    )
    expect(container).toMatchSnapshot()
  })
})
