/**
 * result-entry-attachments.test.tsx
 *
 * Task 8 (review pass): Verify attachment enqueue logic via the REAL
 * `enqueueResultAttachments` helper, and verify that ResultEntryForm renders
 * the AttachmentPicker correctly.
 *
 * Strategy:
 *   Suite 1 — form render: render ResultEntryForm with seeded `attachments`
 *             and verify AttachmentPicker is wired correctly.
 *   Suite 2 — enqueueResultAttachments unit: call the real helper directly,
 *             assert addToQueue call shapes, date format, empty-patientRef
 *             guard, and no-attachments short-circuit.
 *
 * PHI rule: no patient data in assertions — only opaque IDs and shape checks.
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mock @/lib/db — intercept addToQueue before any imports resolve it.
// vi.hoisted ensures the variable is initialised before the hoisted vi.mock
// factory runs (plain `const` at module scope would not be initialised yet).
// ---------------------------------------------------------------------------

const { addToQueue } = vi.hoisted(() => ({
  addToQueue: vi.fn().mockResolvedValue(1),
}))

vi.mock('@/lib/db', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>()
  return { ...original, addToQueue }
})

// ---------------------------------------------------------------------------
// Mock next-intl — key-echo with param injection
// ---------------------------------------------------------------------------

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (!params) return key
    return `${key} ${Object.values(params).join(' ')}`
  },
}))

// ---------------------------------------------------------------------------
// Mock next/link (used inside ResultEntryForm)
// ---------------------------------------------------------------------------

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

// ---------------------------------------------------------------------------
// Mock knowledge-card + trigger-engine (avoid complex side-effects in tests)
// ---------------------------------------------------------------------------

vi.mock('@/lib/trigger-engine', () => ({
  evaluateKnowledgeCardTriggers: () => [],
  getMatchingRuleIds: () => [],
}))

vi.mock('@/components/KnowledgeCardPanel', () => ({
  KnowledgeCardPanel: () => null,
}))

vi.mock('@/lib/audit-client', () => ({
  reportKnowledgeCardView: vi.fn(),
  reportLabResultAuditEvent: vi.fn(),
}))

// Mock image-transcode used by AttachmentPicker
vi.mock('@/lib/image-transcode', () => ({
  transcodeToWebp: vi.fn(),
  TranscodeTooLargeError: class TranscodeTooLargeError extends Error {},
  TranscodeUnsupportedError: class TranscodeUnsupportedError extends Error {},
}))

// ---------------------------------------------------------------------------
// Imports (after mocks are declared)
// ---------------------------------------------------------------------------

import { ResultEntryForm } from '../components/ResultEntryForm'
import type { ResultEntryFormProps } from '../components/ResultEntryForm'
import type { PreparedAttachment } from '../components/attachments/AttachmentPicker'
import type { ResultTemplate } from '../lib/result-templates'
import { enqueueResultAttachments, EmptyPatientRefError } from '../lib/attachment-enqueue'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Minimal single-field template — no required fields so submit is always enabled */
const MINIMAL_TEMPLATE: ResultTemplate = {
  id: 'tpl-test-v1.0.0',
  loincCode: 'test-loinc',
  loincDisplay: 'Test Panel',
  templateVersion: '1.0.0',
  category: 'Other',
  effectiveDate: '2026-01-01',
  fields: [
    {
      code: 'result_value',
      loincCode: 'custom',
      label: 'resultEntry.fields.resultValue',
      type: 'text',
      required: false,
      sortOrder: 1,
    },
  ],
}

const PREPARED_IMAGE: PreparedAttachment = {
  blob: new Blob(['fake-webp-data'], { type: 'image/webp' }),
  fileName: 'slide.webp',
  fileType: 'image/webp',
  kind: 'image',
}

const PREPARED_PDF: PreparedAttachment = {
  blob: new Blob(['fake-pdf-data'], { type: 'application/pdf' }),
  fileName: 'report.pdf',
  fileType: 'application/pdf',
  kind: 'pdf',
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderForm(overrides: Partial<ResultEntryFormProps> = {}) {
  const atts: PreparedAttachment[] = overrides.attachments ?? [PREPARED_IMAGE]
  const props: ResultEntryFormProps = {
    sampleId: 'SAMP-001',
    template: MINIMAL_TEMPLATE,
    patientFirstName: 'Ahmad',
    patientAge: 35,
    patientGender: 'male',
    onSave: vi.fn().mockResolvedValue(undefined),
    onSaveDraft: vi.fn().mockResolvedValue(undefined),
    enteredBy: 'prac-001',
    attachments: atts,
    onAttachmentsChange: vi.fn(),
    ...overrides,
  }
  return render(<ResultEntryForm {...props} />)
}

// ---------------------------------------------------------------------------
// Suite 1 — AttachmentPicker form integration
// ---------------------------------------------------------------------------

describe('ResultEntryForm — AttachmentPicker integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    addToQueue.mockResolvedValue(1)
  })

  it('renders the AttachmentPicker drop zone', () => {
    renderForm({ attachments: [] })
    // AttachmentPicker renders a role="button" drop-zone and a hidden file input,
    // both with aria-label=dropZoneLabel. Check the interactive drop zone.
    const dropZone = screen.getByRole('button', { name: 'dropZoneLabel' })
    expect(dropZone).toBeInTheDocument()
  })

  it('shows attached file chips when attachments are provided', () => {
    renderForm({ attachments: [PREPARED_IMAGE, PREPARED_PDF] })
    expect(screen.getByText('slide.webp')).toBeInTheDocument()
    expect(screen.getByText('report.pdf')).toBeInTheDocument()
  })

  it('calls onAttachmentsChange when a file chip is removed', async () => {
    const onAttachmentsChange = vi.fn()
    renderForm({
      attachments: [PREPARED_IMAGE],
      onAttachmentsChange,
    })

    const removeBtn = screen.getByLabelText('removeAriaLabel slide.webp')
    fireEvent.click(removeBtn)

    expect(onAttachmentsChange).toHaveBeenCalledWith([])
  })
})

// ---------------------------------------------------------------------------
// Suite 2 — enqueueResultAttachments helper (real code path)
// ---------------------------------------------------------------------------

describe('enqueueResultAttachments', () => {
  const BASE_CTX = {
    patientRef: 'Patient/opaque-ref-001',
    patientFirstName: 'Ahmad',
    loincCode: 'test-loinc',
    loincDisplay: 'Test Panel',
    collectionDate: '2026-09-13',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    addToQueue.mockResolvedValue(1)
  })

  it('calls addToQueue twice for two attachments, sharing one diagnosticReportId', async () => {
    const reportId = await enqueueResultAttachments([PREPARED_IMAGE, PREPARED_PDF], BASE_CTX)

    expect(addToQueue).toHaveBeenCalledTimes(2)

    const calls = addToQueue.mock.calls
    const id1 = calls[0]![0].metadata.diagnosticReportId
    const id2 = calls[1]![0].metadata.diagnosticReportId

    expect(typeof id1).toBe('string')
    expect(id1.length).toBeGreaterThan(0)
    expect(id1).toBe(id2)
    expect(id1).toBe(reportId)

    // Both entries have kind='result'
    expect(calls[0]![0].metadata.kind).toBe('result')
    expect(calls[1]![0].metadata.kind).toBe('result')
  })

  it('normalises a full ISO datetime collectionDate to YYYY-MM-DD', async () => {
    await enqueueResultAttachments([PREPARED_IMAGE], {
      ...BASE_CTX,
      collectionDate: '2026-09-13T08:00:00.000Z',
    })

    expect(addToQueue).toHaveBeenCalledTimes(1)
    const enqueuedDate = addToQueue.mock.calls[0]![0].metadata.collectionDate
    expect(enqueuedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(enqueuedDate).toBe('2026-09-13')
  })

  it('does not call addToQueue when attachment list is empty, returns null', async () => {
    const result = await enqueueResultAttachments([], BASE_CTX)
    expect(addToQueue).not.toHaveBeenCalled()
    expect(result).toBeNull()
  })

  it('throws EmptyPatientRefError and does not enqueue when patientRef is empty', async () => {
    await expect(
      enqueueResultAttachments([PREPARED_IMAGE], { ...BASE_CTX, patientRef: '' }),
    ).rejects.toThrow(EmptyPatientRefError)

    expect(addToQueue).not.toHaveBeenCalled()
  })
})
