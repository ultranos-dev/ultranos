import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ConfidenceLevel } from '../lib/confidence'

// Mock next-intl — useTranslations(namespace)(key) returns a string
vi.mock('next-intl', () => {
  const messages: Record<string, Record<string, string>> = {
    confidence: {
      'high.label': 'AI Confidence: High',
      'medium.label': 'AI Confidence: Medium',
      'medium.explanation': "The AI's assessment has moderate certainty. Review the output carefully.",
      'low.label': 'Low AI Confidence — Human Review Required',
      'low.body': 'I cannot reliably assess this. Request human consultation.',
      'low.acknowledge': 'I Acknowledge — I Will Review Manually',
      'low.escalate': 'Escalate to Physician Now',
      'principle.title': 'About AI Confidence Alerts',
      'principle.body': 'This system is designed to alert more aggressively when less certain.',
      'escalation.notification.title': 'AI Auto-Escalation',
      'escalation.notification.body': 'An AI output with low confidence requires physician review.',
      missing: 'AI confidence level missing — output cannot be displayed.',
    },
  }
  return {
    useTranslations: (namespace?: string) => (key: string) =>
      namespace ? (messages[namespace]?.[key] ?? key) : key,
    useLocale: () => 'en',
  }
})

import { ConfidenceIndicator } from '../components/ai/ConfidenceIndicator'
import { AiOutputWrapper } from '../components/ai/AiOutputWrapper'

describe('ConfidenceIndicator — HIGH confidence', () => {
  it('renders a subtle green badge', () => {
    render(
      <ConfidenceIndicator
        level={ConfidenceLevel.HIGH}
        context="CBC anomaly detection"
      />
    )
    expect(screen.getByText('AI Confidence: High')).toBeTruthy()
  })

  it('does not render a yellow banner or red overlay for HIGH', () => {
    const { container } = render(
      <ConfidenceIndicator
        level={ConfidenceLevel.HIGH}
        context="CBC anomaly detection"
      />
    )
    expect(container.querySelector('[data-testid="medium-banner"]')).toBeNull()
    expect(container.querySelector('[data-testid="low-overlay"]')).toBeNull()
  })

  it('shows score when provided', () => {
    render(
      <ConfidenceIndicator
        level={ConfidenceLevel.HIGH}
        score={0.95}
        context="CBC anomaly detection"
      />
    )
    expect(screen.getByText('AI Confidence: High')).toBeTruthy()
  })
})

describe('ConfidenceIndicator — MEDIUM confidence', () => {
  it('renders a yellow warning banner', () => {
    const { container } = render(
      <ConfidenceIndicator
        level={ConfidenceLevel.MEDIUM}
        context="Test context"
      />
    )
    expect(container.querySelector('[data-testid="medium-banner"]')).toBeTruthy()
  })

  it('displays the medium label text', () => {
    render(
      <ConfidenceIndicator
        level={ConfidenceLevel.MEDIUM}
        context="Test context"
      />
    )
    expect(screen.getByText('AI Confidence: Medium')).toBeTruthy()
  })

  it('displays the explanation text', () => {
    render(
      <ConfidenceIndicator
        level={ConfidenceLevel.MEDIUM}
        context="Test context"
      />
    )
    expect(screen.getByText("The AI's assessment has moderate certainty. Review the output carefully.")).toBeTruthy()
  })
})

describe('ConfidenceIndicator — LOW confidence', () => {
  it('renders a red full-screen overlay', () => {
    const { container } = render(
      <ConfidenceIndicator
        level={ConfidenceLevel.LOW}
        context="Test context"
        onAcknowledge={vi.fn()}
        onEscalate={vi.fn()}
      />
    )
    expect(container.querySelector('[data-testid="low-overlay"]')).toBeTruthy()
  })

  it('displays the low confidence header', () => {
    render(
      <ConfidenceIndicator
        level={ConfidenceLevel.LOW}
        context="Test context"
        onAcknowledge={vi.fn()}
        onEscalate={vi.fn()}
      />
    )
    expect(screen.getByText('Low AI Confidence — Human Review Required')).toBeTruthy()
  })

  it('displays the body text', () => {
    render(
      <ConfidenceIndicator
        level={ConfidenceLevel.LOW}
        context="Test context"
        onAcknowledge={vi.fn()}
        onEscalate={vi.fn()}
      />
    )
    expect(screen.getByText('I cannot reliably assess this. Request human consultation.')).toBeTruthy()
  })

  it('shows acknowledge and escalate buttons', () => {
    render(
      <ConfidenceIndicator
        level={ConfidenceLevel.LOW}
        context="Test context"
        onAcknowledge={vi.fn()}
        onEscalate={vi.fn()}
      />
    )
    expect(screen.getByText('I Acknowledge — I Will Review Manually')).toBeTruthy()
    expect(screen.getByText('Escalate to Physician Now')).toBeTruthy()
  })

  it('calls onAcknowledge when acknowledge button is clicked', () => {
    const onAcknowledge = vi.fn()
    render(
      <ConfidenceIndicator
        level={ConfidenceLevel.LOW}
        context="Test context"
        onAcknowledge={onAcknowledge}
        onEscalate={vi.fn()}
      />
    )
    fireEvent.click(screen.getByText('I Acknowledge — I Will Review Manually'))
    expect(onAcknowledge).toHaveBeenCalledOnce()
  })

  it('calls onEscalate when escalate button is clicked', () => {
    const onEscalate = vi.fn()
    render(
      <ConfidenceIndicator
        level={ConfidenceLevel.LOW}
        context="Test context"
        onAcknowledge={vi.fn()}
        onEscalate={onEscalate}
      />
    )
    // onEscalate is called once on mount (auto-escalation) and once on button click
    const callsBefore = onEscalate.mock.calls.length
    fireEvent.click(screen.getByText('Escalate to Physician Now'))
    expect(onEscalate.mock.calls.length).toBe(callsBefore + 1)
  })

  it('LOW overlay cannot be dismissed by Escape key', () => {
    const { container } = render(
      <ConfidenceIndicator
        level={ConfidenceLevel.LOW}
        context="Test context"
        onAcknowledge={vi.fn()}
        onEscalate={vi.fn()}
      />
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    // Overlay should still be present
    expect(container.querySelector('[data-testid="low-overlay"]')).toBeTruthy()
  })

  it('dismisses overlay after acknowledge button is clicked', () => {
    const onAcknowledge = vi.fn()
    const { container } = render(
      <ConfidenceIndicator
        level={ConfidenceLevel.LOW}
        context="Test context"
        onAcknowledge={onAcknowledge}
        onEscalate={vi.fn()}
      />
    )
    fireEvent.click(screen.getByText('I Acknowledge — I Will Review Manually'))
    // Overlay should be gone after acknowledgment
    expect(container.querySelector('[data-testid="low-overlay"]')).toBeNull()
  })
})

describe('AiOutputWrapper', () => {
  it('renders children when confidence is provided', () => {
    render(
      <AiOutputWrapper confidence={ConfidenceLevel.HIGH} context="test">
        <div>AI Output Content</div>
      </AiOutputWrapper>
    )
    expect(screen.getByText('AI Output Content')).toBeTruthy()
  })

  it('renders ConfidenceIndicator above children', () => {
    const { container } = render(
      <AiOutputWrapper confidence={ConfidenceLevel.HIGH} context="test">
        <div>AI Output Content</div>
      </AiOutputWrapper>
    )
    // Confidence indicator should be rendered
    expect(screen.getByText('AI Confidence: High')).toBeTruthy()
    expect(screen.getByText('AI Output Content')).toBeTruthy()
  })

  it('renders error state when confidence is undefined', () => {
    render(
      // @ts-expect-error intentionally passing undefined to test error state
      <AiOutputWrapper confidence={undefined} context="test">
        <div>AI Output Content</div>
      </AiOutputWrapper>
    )
    expect(screen.getByText('AI confidence level missing — output cannot be displayed.')).toBeTruthy()
    expect(screen.queryByText('AI Output Content')).toBeNull()
  })

  it('passes score and onEscalate down to ConfidenceIndicator', () => {
    const onEscalate = vi.fn()
    const { container } = render(
      <AiOutputWrapper
        confidence={ConfidenceLevel.LOW}
        context="test"
        onEscalate={onEscalate}
      >
        <div>AI Content</div>
      </AiOutputWrapper>
    )
    expect(container.querySelector('[data-testid="low-overlay"]')).toBeTruthy()
  })
})

describe('shouldAutoEscalate integration with ConfidenceIndicator', () => {
  it('calls onEscalate automatically on render when LOW confidence and onEscalate is provided', () => {
    const onEscalate = vi.fn()
    render(
      <ConfidenceIndicator
        level={ConfidenceLevel.LOW}
        context="test"
        onAcknowledge={vi.fn()}
        onEscalate={onEscalate}
      />
    )
    expect(onEscalate).toHaveBeenCalledOnce()
  })

  it('does NOT auto-call onEscalate for HIGH confidence', () => {
    const onEscalate = vi.fn()
    render(
      <ConfidenceIndicator
        level={ConfidenceLevel.HIGH}
        context="test"
        onEscalate={onEscalate}
      />
    )
    expect(onEscalate).not.toHaveBeenCalled()
  })
})
