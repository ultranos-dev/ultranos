import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { ConfidenceLevel } from '../lib/confidence'

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

// ── LTR Snapshots ──────────────────────────────────────────────

describe('ConfidenceIndicator snapshots — LTR', () => {
  it('HIGH confidence renders correctly', () => {
    const { container } = render(
      <ConfidenceIndicator level={ConfidenceLevel.HIGH} context="CBC anomaly detection" score={0.92} />
    )
    expect(container.firstChild).toMatchSnapshot()
  })

  it('MEDIUM confidence renders correctly', () => {
    const { container } = render(
      <ConfidenceIndicator level={ConfidenceLevel.MEDIUM} context="CBC anomaly detection" score={0.65} />
    )
    expect(container.firstChild).toMatchSnapshot()
  })

  it('LOW confidence renders correctly', () => {
    const { container } = render(
      <ConfidenceIndicator
        level={ConfidenceLevel.LOW}
        context="CBC anomaly detection"
        score={0.3}
        onAcknowledge={vi.fn()}
        onEscalate={vi.fn()}
      />
    )
    expect(container.firstChild).toMatchSnapshot()
  })
})

// ── RTL Snapshots ──────────────────────────────────────────────

describe('ConfidenceIndicator snapshots — RTL', () => {
  it('HIGH confidence renders correctly in RTL', () => {
    const { container } = render(
      <div dir="rtl">
        <ConfidenceIndicator level={ConfidenceLevel.HIGH} context="فحص نخاع الدم" score={0.92} />
      </div>
    )
    expect(container.firstChild).toMatchSnapshot()
  })

  it('MEDIUM confidence renders correctly in RTL', () => {
    const { container } = render(
      <div dir="rtl">
        <ConfidenceIndicator level={ConfidenceLevel.MEDIUM} context="فحص نخاع الدم" score={0.65} />
      </div>
    )
    expect(container.firstChild).toMatchSnapshot()
  })

  it('LOW confidence renders correctly in RTL', () => {
    const { container } = render(
      <div dir="rtl">
        <ConfidenceIndicator
          level={ConfidenceLevel.LOW}
          context="فحص نخاع الدم"
          score={0.3}
          onAcknowledge={vi.fn()}
          onEscalate={vi.fn()}
        />
      </div>
    )
    expect(container.firstChild).toMatchSnapshot()
  })
})

// ── AiOutputWrapper edge cases ─────────────────────────────────

describe('AiOutputWrapper edge cases', () => {
  it('renders children with HIGH confidence', () => {
    const { container } = render(
      <AiOutputWrapper confidence={ConfidenceLevel.HIGH} context="anomaly detection">
        <p>AI result content</p>
      </AiOutputWrapper>
    )
    expect(container.firstChild).toMatchSnapshot()
  })

  it('error state snapshot when confidence is undefined', () => {
    const { container } = render(
      <AiOutputWrapper confidence={undefined} context="anomaly detection">
        <p>AI result content</p>
      </AiOutputWrapper>
    )
    expect(container.firstChild).toMatchSnapshot()
  })
})
