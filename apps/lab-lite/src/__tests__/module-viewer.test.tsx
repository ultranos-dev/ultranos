/**
 * ModuleViewer Component Tests — Story 46.2 (Task 4, 8)
 * Tests: step navigation, key tips display, quiz transition.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import 'fake-indexeddb/auto'

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => (key: string, params?: Record<string, unknown>) => {
    const msgs: Record<string, string> = {
      close: 'Close',
      minutes: 'min',
      stepOf: 'Step {current} of {total}',
      back: 'Back',
      next: 'Next',
      viewTips: 'View Key Tips',
      keyTips: 'Key Tips',
      startQuiz: 'Start Self-Check',
      quizTitle: 'Self-Check',
      submitQuiz: 'Submit',
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
  useLocale: () => 'en',
}))

// Mock addModuleCompletion
vi.mock('../lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/db')>()
  return {
    ...actual,
    addModuleCompletion: vi.fn().mockResolvedValue('comp-1'),
  }
})

import { ModuleViewer } from '../components/learning/ModuleViewer'
import type { MicroLearningModule } from '../lib/micro-learning-types'

const mockModule: MicroLearningModule = {
  id: 'mod-1',
  procedureRef: 'CBC-85025',
  procedureName: 'Complete Blood Count',
  title: 'CBC Refresher',
  content: [
    { stepNumber: 1, text: '## Step 1: Collect sample' },
    { stepNumber: 2, text: '## Step 2: Load analyzer' },
    { stepNumber: 3, text: '## Step 3: Record result' },
  ],
  keyTips: ['Check reagent expiry', 'Verify patient ID'],
  selfAssessment: [
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
  ],
  durationMinutes: 3,
  version: '1.0.0',
  meta: { lastUpdated: '2026-05-01T00:00:00.000Z', versionId: '1' },
}

describe('ModuleViewer — Step Navigation (Task 4)', () => {
  const onComplete = vi.fn()
  const onClose = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders first step on mount', () => {
    render(
      <ModuleViewer
        module={mockModule}
        technicianId="tech-1"
        onComplete={onComplete}
        onClose={onClose}
      />
    )

    expect(screen.getByTestId('module-viewer')).toBeDefined()
    expect(screen.getByTestId('module-step')).toBeDefined()
    expect(screen.getByText(/Step 1: Collect sample/)).toBeDefined()
  })

  it('shows step progress indicator', () => {
    render(
      <ModuleViewer
        module={mockModule}
        technicianId="tech-1"
        onComplete={onComplete}
        onClose={onClose}
      />
    )

    expect(screen.getByText(/Step 1 of 3/)).toBeDefined()
  })

  it('navigates to next step on Next click', () => {
    render(
      <ModuleViewer
        module={mockModule}
        technicianId="tech-1"
        onComplete={onComplete}
        onClose={onClose}
      />
    )

    fireEvent.click(screen.getByTestId('step-next'))
    expect(screen.getByText(/Step 2: Load analyzer/)).toBeDefined()
    expect(screen.getByText(/Step 2 of 3/)).toBeDefined()
  })

  it('navigates back from step 2 to step 1', () => {
    render(
      <ModuleViewer
        module={mockModule}
        technicianId="tech-1"
        onComplete={onComplete}
        onClose={onClose}
      />
    )

    fireEvent.click(screen.getByTestId('step-next'))
    fireEvent.click(screen.getByTestId('step-back'))
    expect(screen.getByText(/Step 1 of 3/)).toBeDefined()
  })

  it('Back button is disabled on first step', () => {
    render(
      <ModuleViewer
        module={mockModule}
        technicianId="tech-1"
        onComplete={onComplete}
        onClose={onClose}
      />
    )

    const backBtn = screen.getByTestId('step-back') as HTMLButtonElement
    expect(backBtn.disabled).toBe(true)
  })

  it('last step Next button shows "View Key Tips"', () => {
    render(
      <ModuleViewer
        module={mockModule}
        technicianId="tech-1"
        onComplete={onComplete}
        onClose={onClose}
      />
    )

    // Navigate to last step (3)
    fireEvent.click(screen.getByTestId('step-next'))
    fireEvent.click(screen.getByTestId('step-next'))
    expect(screen.getByText('View Key Tips')).toBeDefined()
  })

  it('transitions to key tips after completing all steps', () => {
    render(
      <ModuleViewer
        module={mockModule}
        technicianId="tech-1"
        onComplete={onComplete}
        onClose={onClose}
      />
    )

    // Navigate through all 3 steps
    fireEvent.click(screen.getByTestId('step-next'))
    fireEvent.click(screen.getByTestId('step-next'))
    fireEvent.click(screen.getByTestId('step-next'))

    expect(screen.getByTestId('module-tips')).toBeDefined()
    expect(screen.getByText('Check reagent expiry')).toBeDefined()
    expect(screen.getByText('Verify patient ID')).toBeDefined()
  })

  it('transitions to quiz after key tips', () => {
    render(
      <ModuleViewer
        module={mockModule}
        technicianId="tech-1"
        onComplete={onComplete}
        onClose={onClose}
      />
    )

    // Navigate through steps → tips → quiz
    fireEvent.click(screen.getByTestId('step-next'))
    fireEvent.click(screen.getByTestId('step-next'))
    fireEvent.click(screen.getByTestId('step-next'))
    fireEvent.click(screen.getByTestId('tips-start-quiz'))

    expect(screen.getByTestId('self-assessment')).toBeDefined()
  })

  it('calls onClose when close button clicked', () => {
    render(
      <ModuleViewer
        module={mockModule}
        technicianId="tech-1"
        onComplete={onComplete}
        onClose={onClose}
      />
    )

    fireEvent.click(screen.getByTestId('module-viewer-close'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('renders step image when imageBase64 provided', () => {
    const modWithImage: MicroLearningModule = {
      ...mockModule,
      content: [
        {
          stepNumber: 1,
          text: '## Step with image',
          imageBase64: 'abc123',
          imageMimeType: 'image/png',
          imageAlt: 'Sample tube',
        },
      ],
    }

    render(
      <ModuleViewer
        module={modWithImage}
        technicianId="tech-1"
        onComplete={onComplete}
        onClose={onClose}
      />
    )

    const img = screen.getByTestId('step-image') as HTMLImageElement
    expect(img.src).toContain('data:image/png;base64,abc123')
    expect(img.alt).toBe('Sample tube')
  })
})

describe('ModuleViewer — RTL Snapshot (Task 8)', () => {
  it('renders correctly in LTR', () => {
    const { container } = render(
      <div dir="ltr">
        <ModuleViewer
          module={mockModule}
          technicianId="tech-1"
          onComplete={vi.fn()}
          onClose={vi.fn()}
        />
      </div>
    )
    expect(container).toMatchSnapshot()
  })

  it('renders correctly in RTL', () => {
    const { container } = render(
      <div dir="rtl">
        <ModuleViewer
          module={mockModule}
          technicianId="tech-1"
          onComplete={vi.fn()}
          onClose={vi.fn()}
        />
      </div>
    )
    expect(container).toMatchSnapshot()
  })
})
