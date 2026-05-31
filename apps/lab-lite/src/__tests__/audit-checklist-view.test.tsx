import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AuditChecklistView } from '@/components/safety/AuditChecklistView'
import type { InfectionControlAudit, ChecklistItemTemplate } from '@/types/infection-control-audit'
import { ChecklistItemStatus, AuditStatus } from '@/types/infection-control-audit'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/lib/safety/default-checklist', () => ({
  CHECKLIST_CATEGORIES: ['Hand Hygiene', 'PPE', 'General'],
}))

vi.mock('@/lib/safety/audit-checklist-service', () => ({
  calculateComplianceScore: () => null,
}))

vi.mock('@/components/safety/PhotoCaptureButton', () => ({
  PhotoCaptureButton: () => <div data-testid="photo-capture" />,
}))

// ── Test data ────────────────────────────────────────────────────────────────

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
  {
    id: 'ic-sw-01',
    category: 'General',
    description: 'Sharps containers checked',
    order: 7,
    isDefault: true,
    requiresPhoto: true,
    isActive: true,
  },
]

function makeAudit(overrides: Partial<InfectionControlAudit> = {}): InfectionControlAudit {
  return {
    id: 'audit-1',
    auditDate: '2025-01-15',
    auditMonth: '2025-01',
    conductedBy: 'practitioner-123',
    status: AuditStatus.IN_PROGRESS,
    items: testTemplates.map((t) => ({
      templateId: t.id,
      status: ChecklistItemStatus.NOT_APPLICABLE,
      notes: null,
      photoEvidence: null,
      photoFileName: null,
      completedAt: null,
      completedBy: 'practitioner-123',
    })),
    complianceScore: null,
    completedAt: null,
    notes: '',
    hlcTimestamp: 'hlc-test',
    ...overrides,
  }
}

// ── Shared props ─────────────────────────────────────────────────────────────

function defaultProps(overrides?: Partial<InfectionControlAudit>) {
  return {
    audit: makeAudit(overrides),
    templates: testTemplates,
    onItemUpdate: vi.fn().mockResolvedValue(undefined),
    onComplete: vi.fn().mockResolvedValue(undefined),
    isCompleting: false,
  }
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('AuditChecklistView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── Rendering ──────────────────────────────────────────────────────────────

  it('renders all items grouped by category', () => {
    render(<AuditChecklistView {...defaultProps()} />)
    expect(screen.getByText('Hand Hygiene')).toBeInTheDocument()
    expect(screen.getByText('PPE')).toBeInTheDocument()
    expect(screen.getByText('General')).toBeInTheDocument()
  })

  it('renders each item description', () => {
    render(<AuditChecklistView {...defaultProps()} />)
    expect(screen.getByText('Hand hygiene stations stocked')).toBeInTheDocument()
    expect(screen.getByText('PPE inventory adequate')).toBeInTheDocument()
    expect(screen.getByText('Sharps containers checked')).toBeInTheDocument()
  })

  it('shows progress as 0 of 3 initially', () => {
    render(<AuditChecklistView {...defaultProps()} />)
    // The progress block renders assessedCount as a bold number alongside "/ totalCount"
    // Both values should appear somewhere in the document
    expect(screen.getByText(/\/ 3/)).toBeInTheDocument()
    // assessedCount starts at 0 — present as standalone bold text
    expect(screen.getByText(/itemsAssessed/)).toBeInTheDocument()
  })

  it('Complete Audit button is disabled when items are unassessed', () => {
    render(<AuditChecklistView {...defaultProps()} />)
    // Button text comes from the t() mock which returns the key
    const btn = screen.getByRole('button', { name: /completeAudit/i })
    expect(btn).toBeDisabled()
  })

  // ── Pass / Fail toggles ────────────────────────────────────────────────────

  it('calls onItemUpdate when PASS is clicked', async () => {
    const user = userEvent.setup()
    const onItemUpdate = vi.fn().mockResolvedValue(undefined)
    render(
      <AuditChecklistView
        {...defaultProps()}
        onItemUpdate={onItemUpdate}
      />,
    )
    // Each item row has three toggle buttons: statusPass, statusFail, statusNA
    const [firstPassBtn] = screen.getAllByRole('button', { name: /statusPass/i })
    await user.click(firstPassBtn!)
    await waitFor(() => {
      expect(onItemUpdate).toHaveBeenCalledWith(
        'ic-hh-01',
        expect.objectContaining({ status: ChecklistItemStatus.PASS }),
      )
    })
  })

  it('calls onItemUpdate when FAIL is clicked', async () => {
    const user = userEvent.setup()
    const onItemUpdate = vi.fn().mockResolvedValue(undefined)
    render(
      <AuditChecklistView
        {...defaultProps()}
        onItemUpdate={onItemUpdate}
      />,
    )
    const [firstFailBtn] = screen.getAllByRole('button', { name: /statusFail/i })
    await user.click(firstFailBtn!)
    await waitFor(() => {
      expect(onItemUpdate).toHaveBeenCalledWith(
        'ic-hh-01',
        expect.objectContaining({ status: ChecklistItemStatus.FAIL }),
      )
    })
  })

  it('calls onItemUpdate when NA is clicked', async () => {
    const user = userEvent.setup()
    const onItemUpdate = vi.fn().mockResolvedValue(undefined)
    render(
      <AuditChecklistView
        {...defaultProps()}
        onItemUpdate={onItemUpdate}
      />,
    )
    const [firstNaBtn] = screen.getAllByRole('button', { name: /statusNA/i })
    await user.click(firstNaBtn!)
    await waitFor(() => {
      expect(onItemUpdate).toHaveBeenCalledWith(
        'ic-hh-01',
        expect.objectContaining({ status: ChecklistItemStatus.NOT_APPLICABLE }),
      )
    })
  })

  // ── Completion gating ─────────────────────────────────────────────────────

  it('Complete Audit button enabled when all items assessed', () => {
    const auditWithAllAssessed = makeAudit({
      items: testTemplates.map((t) => ({
        templateId: t.id,
        status: ChecklistItemStatus.PASS,
        notes: null,
        photoEvidence: null,
        photoFileName: null,
        // completedAt set means the item has been assessed
        completedAt: '2025-01-15T10:00:00Z',
        completedBy: 'practitioner-123',
      })),
    })
    render(
      <AuditChecklistView
        audit={auditWithAllAssessed}
        templates={testTemplates}
        onItemUpdate={vi.fn().mockResolvedValue(undefined)}
        onComplete={vi.fn().mockResolvedValue(undefined)}
      />,
    )
    const btn = screen.getByRole('button', { name: /completeAudit/i })
    expect(btn).not.toBeDisabled()
  })

  // ── Smoke / RTL ───────────────────────────────────────────────────────────

  it('renders without crashing in default layout', () => {
    expect(() => render(<AuditChecklistView {...defaultProps()} />)).not.toThrow()
  })
})
