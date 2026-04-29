import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SOAPNoteEntry } from '@/components/clinical/soap-note-entry'

describe('SOAPNoteEntry component', () => {
  const defaultProps = {
    subjective: '',
    objective: '',
    onSubjectiveChange: vi.fn(),
    onObjectiveChange: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render Subjective and Objective textareas', () => {
    render(<SOAPNoteEntry {...defaultProps} />)
    expect(screen.getByLabelText(/subjective/i)).toBeDefined()
    expect(screen.getByLabelText(/objective/i)).toBeDefined()
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
    expect(screen.getByText('Subjective')).toBeDefined()
    expect(screen.getByText('Objective')).toBeDefined()
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
})
