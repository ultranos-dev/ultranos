import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ComplianceTrendView } from '@/components/safety/ComplianceTrendView'
import type { ComplianceTrend, InfectionControlAudit, ChecklistItemTemplate } from '@/types/infection-control-audit'
import { AuditStatus, ChecklistItemStatus } from '@/types/infection-control-audit'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

// ── Test data helpers ─────────────────────────────────────────────────────────

const testTemplates: ChecklistItemTemplate[] = [
  {
    id: 'ic-hh-01',
    category: 'Hand Hygiene',
    description: 'Hand hygiene stations stocked',
    order: 1,
    isDefault: true,
    requiresPhoto: false,
    isActive: true,
  },
  {
    id: 'ic-ppe-01',
    category: 'PPE',
    description: 'PPE inventory adequate',
    order: 4,
    isDefault: true,
    requiresPhoto: false,
    isActive: true,
  },
]

function makeCompletedAudit(
  complianceScore: number | null,
  auditMonth = '2025-01',
): InfectionControlAudit {
  return {
    id: 'audit-1',
    auditDate: '2025-01-15',
    auditMonth,
    conductedBy: 'practitioner-123',
    status: AuditStatus.COMPLETED,
    items: testTemplates.map((t) => ({
      templateId: t.id,
      status: ChecklistItemStatus.PASS,
      notes: null,
      photoEvidence: null,
      photoFileName: null,
      completedAt: '2025-01-15T10:00:00Z',
      completedBy: 'practitioner-123',
    })),
    complianceScore,
    completedAt: '2025-01-15T10:00:00Z',
    notes: '',
    hlcTimestamp: 'hlc-test',
  }
}

function makeTrend(month: string, score: number, failedItems: string[] = []): ComplianceTrend {
  return {
    month,
    score,
    totalItems: 2,
    passedItems: 2 - failedItems.length,
    failedItems,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ComplianceTrendView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows no audits message when no latest audit', () => {
    render(<ComplianceTrendView trends={[]} latestAudit={null} templates={[]} />)
    // t('noAuditsCompleted') → 'noAuditsCompleted' via mock
    expect(screen.getByText('noAuditsCompleted')).toBeInTheDocument()
  })

  it('shows compliance score from latest audit', () => {
    const audit = makeCompletedAudit(85)
    const trends = [makeTrend('2025-01', 85)]
    render(
      <ComplianceTrendView
        trends={trends}
        latestAudit={audit}
        templates={testTemplates}
      />,
    )
    // Score is rendered as "85%"
    expect(screen.getByText('85%')).toBeInTheDocument()
  })

  it('shows N/A when compliance score is null', () => {
    const audit = makeCompletedAudit(null)
    const trends = [makeTrend('2025-01', 0)]
    render(
      <ComplianceTrendView
        trends={trends}
        latestAudit={audit}
        templates={testTemplates}
      />,
    )
    // t('scoreNA') → 'scoreNA' via mock
    expect(screen.getByText('scoreNA')).toBeInTheDocument()
  })

  it('shows "not enough data" when fewer than 2 trend points', () => {
    const audit = makeCompletedAudit(90)
    const trends = [makeTrend('2025-01', 90)]
    render(
      <ComplianceTrendView
        trends={trends}
        latestAudit={audit}
        templates={testTemplates}
      />,
    )
    // t('notEnoughTrendData') → 'notEnoughTrendData' via mock
    expect(screen.getByText('notEnoughTrendData')).toBeInTheDocument()
  })

  it('renders trend bars when 2+ data points exist', () => {
    const audit = makeCompletedAudit(90, '2025-03')
    const trends = [
      makeTrend('2025-01', 75),
      makeTrend('2025-02', 80),
      makeTrend('2025-03', 90),
    ]
    render(
      <ComplianceTrendView
        trends={trends}
        latestAudit={audit}
        templates={testTemplates}
      />,
    )
    // Chart renders as an img role with aria-label from t('trendChartAriaLabel')
    expect(screen.getByRole('img', { name: 'trendChartAriaLabel' })).toBeInTheDocument()
    // Each bar has a title attribute "month: score%"
    expect(screen.getByTitle('2025-01: 75%')).toBeInTheDocument()
    expect(screen.getByTitle('2025-02: 80%')).toBeInTheDocument()
    expect(screen.getByTitle('2025-03: 90%')).toBeInTheDocument()
  })

  it('shows failed items from latest trend', () => {
    const audit = makeCompletedAudit(50, '2025-01')
    const trends = [makeTrend('2025-01', 50, ['ic-hh-01'])]
    render(
      <ComplianceTrendView
        trends={trends}
        latestAudit={audit}
        templates={testTemplates}
      />,
    )
    // The description of the failed template is rendered
    expect(screen.getByText('Hand hygiene stations stocked')).toBeInTheDocument()
  })

  it('shows no failed items section when none failed', () => {
    const audit = makeCompletedAudit(100, '2025-01')
    const trends = [makeTrend('2025-01', 100, [])]
    render(
      <ComplianceTrendView
        trends={trends}
        latestAudit={audit}
        templates={testTemplates}
      />,
    )
    // The failed items heading should not be present
    expect(screen.queryByText('failedItemsTitle')).not.toBeInTheDocument()
    // Neither should any item descriptions from the failed list
    expect(screen.queryByText('Hand hygiene stations stocked')).not.toBeInTheDocument()
  })
})
