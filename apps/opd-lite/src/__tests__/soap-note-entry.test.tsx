import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SOAPNoteEntry } from '@/components/clinical/soap-note-entry'

// next-intl context isn't provided in unit tests; components only need the key/locale.
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key} ${JSON.stringify(values)}` : key,
  useLocale: () => 'en',
}))

// Mock soap-note-store — default to no AI diff active so we test the normal entry view
vi.mock('@/stores/soap-note-store', () => ({
  useSoapNoteStore: (selector: (s: Record<string, unknown>) => unknown) => {
    const state = {
      aiDiff: {
        isActive: false,
        isLoading: false,
        error: null,
        originalText: '',
        originalAiSubjective: '',
        originalAiObjective: '',
        originalAiAssessment: '',
        originalAiPlan: '',
        aiSubjective: '',
        aiObjective: '',
        aiAssessment: '',
        aiPlan: '',
        aiModelVersion: '',
      },
      setAIDiffLoading: vi.fn(),
      setAIDiffResult: vi.fn(),
      setAIDiffError: vi.fn(),
      updateAIDiffField: vi.fn(),
      confirmAIDiff: vi.fn(),
      discardAIDiff: vi.fn(),
    }
    return selector(state)
  },
}))

// Mock ai-scribe-service — not needed for normal entry view tests
vi.mock('@/services/ai-scribe-service', () => ({
  parseSOAPWithAI: vi.fn(),
  commitAISOAPNote: vi.fn(),
  isAISOAPError: vi.fn().mockReturnValue(false),
}))

// Mock soap-macros
vi.mock('@/lib/soap-macros', () => ({
  searchSOAPMacros: vi.fn().mockReturnValue([]),
}))

// Mock hlc
vi.mock('@/lib/hlc', () => ({
  hlc: { now: vi.fn().mockReturnValue({ wallTime: Date.now(), counter: 0, nodeId: 'test' }) },
  serializeHlc: vi.fn().mockReturnValue(new Date().toISOString()),
}))

// Mock Button component
vi.mock('@/components/ui/Button', () => ({
  Button: ({ children, onClick, disabled, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children?: React.ReactNode }) => (
    <button onClick={onClick} disabled={disabled} {...props}>{children}</button>
  ),
}))

describe('SOAPNoteEntry component', () => {
  const defaultProps = {
    subjective: '',
    objective: '',
    assessment: '',
    plan: '',
    onSubjectiveChange: vi.fn(),
    onObjectiveChange: vi.fn(),
    onAssessmentChange: vi.fn(),
    onPlanChange: vi.fn(),
    encounterId: 'enc-001',
    patientId: 'pat-001',
    aiConsentGranted: false,
    isOnline: false,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render Subjective and Objective textareas', () => {
    render(<SOAPNoteEntry {...defaultProps} />)
    expect(screen.getByLabelText(/subjective/i)).toBeDefined()
    expect(screen.getByLabelText(/objective/i)).toBeDefined()
  })

  it('should render Assessment and Plan textareas', () => {
    render(<SOAPNoteEntry {...defaultProps} />)
    expect(screen.getByLabelText(/assessment/i)).toBeDefined()
    expect(screen.getByLabelText(/plan/i)).toBeDefined()
  })

  it('should render textareas as <textarea> elements', () => {
    render(<SOAPNoteEntry {...defaultProps} />)
    const subjective = screen.getByLabelText(/subjective/i)
    const objective = screen.getByLabelText(/objective/i)
    expect(subjective.tagName).toBe('TEXTAREA')
    expect(objective.tagName).toBe('TEXTAREA')
  })

  it('should display provided values in textareas', () => {
    render(
      <SOAPNoteEntry
        {...defaultProps}
        subjective="Patient reports headache"
        objective="BP 120/80"
      />,
    )
    expect((screen.getByLabelText(/subjective/i) as HTMLTextAreaElement).value).toBe(
      'Patient reports headache',
    )
    expect((screen.getByLabelText(/objective/i) as HTMLTextAreaElement).value).toBe('BP 120/80')
  })

  it('should call onSubjectiveChange when typing in Subjective', () => {
    render(<SOAPNoteEntry {...defaultProps} />)
    fireEvent.change(screen.getByLabelText(/subjective/i), {
      target: { value: 'headache for 3 days' },
    })
    expect(defaultProps.onSubjectiveChange).toHaveBeenCalledWith('headache for 3 days')
  })

  it('should call onObjectiveChange when typing in Objective', () => {
    render(<SOAPNoteEntry {...defaultProps} />)
    fireEvent.change(screen.getByLabelText(/objective/i), {
      target: { value: 'BP 130/85' },
    })
    expect(defaultProps.onObjectiveChange).toHaveBeenCalledWith('BP 130/85')
  })

  it('should have section headings for Subjective and Objective', () => {
    render(<SOAPNoteEntry {...defaultProps} />)
    expect(screen.getByText('subjective')).toBeDefined()
    expect(screen.getByText('objective')).toBeDefined()
  })

  it('should support RTL direction from parent context', () => {
    const { container } = render(
      <div dir="rtl">
        <SOAPNoteEntry {...defaultProps} />
      </div>,
    )
    // Textareas should exist and be accessible inside RTL container
    const wrapper = container.firstChild as HTMLElement
    expect(wrapper.getAttribute('dir')).toBe('rtl')
    expect(screen.getByLabelText(/subjective/i)).toBeDefined()
  })

  it('should have placeholder text for both textareas', () => {
    render(<SOAPNoteEntry {...defaultProps} />)
    expect(screen.getByLabelText(/subjective/i).getAttribute('placeholder')).toBeTruthy()
    expect(screen.getByLabelText(/objective/i).getAttribute('placeholder')).toBeTruthy()
  })

  it('should show Template Assist button when offline', () => {
    render(<SOAPNoteEntry {...defaultProps} isOnline={false} />)
    expect(screen.getByText(/templateAssist/i)).toBeDefined()
  })

  it('should show AI Assist button when online', () => {
    render(<SOAPNoteEntry {...defaultProps} isOnline={true} aiConsentGranted={true} />)
    expect(screen.getByText(/aiAssist/i)).toBeDefined()
  })

  describe('RTL snapshot tests', () => {
    it('matches snapshot in LTR mode', () => {
      const { container } = render(
        <div dir="ltr">
          <SOAPNoteEntry {...defaultProps} />
        </div>,
      )
      expect(container).toMatchSnapshot()
    })

    it('matches snapshot in RTL mode', () => {
      const { container } = render(
        <div dir="rtl">
          <SOAPNoteEntry {...defaultProps} />
        </div>,
      )
      expect(container).toMatchSnapshot()
    })
  })
})
