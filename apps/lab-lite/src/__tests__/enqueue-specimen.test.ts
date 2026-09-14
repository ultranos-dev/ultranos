/**
 * enqueue-specimen.test.ts
 *
 * Unit tests for `enqueueSpecimenAttachments` — the Task 9 counterpart to
 * the Task 8 `enqueueResultAttachments` helper.
 *
 * Strategy: mock `@/lib/db` addToQueue; call the real helper directly;
 * assert call shapes, attachmentContext routing, and guard behaviour.
 *
 * PHI rule: no patient data in assertions — only opaque IDs and shape checks.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mock @/lib/db — intercept addToQueue before any imports resolve it.
// vi.hoisted ensures the variable is initialised before the hoisted vi.mock
// factory runs.
// ---------------------------------------------------------------------------

const { addToQueue } = vi.hoisted(() => ({
  addToQueue: vi.fn().mockResolvedValue(1),
}))

vi.mock('@/lib/db', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>()
  return { ...original, addToQueue }
})

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import {
  enqueueSpecimenAttachments,
  EmptySpecimenIdError,
  EmptyPatientRefError,
} from '../lib/attachment-enqueue'
import type { PreparedAttachment } from '../components/attachments/AttachmentPicker'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PREPARED_IMAGE: PreparedAttachment = {
  blob: new Blob(['fake-webp-data'], { type: 'image/webp' }),
  fileName: 'tube.webp',
  fileType: 'image/webp',
  kind: 'image',
}

const PREPARED_PDF: PreparedAttachment = {
  blob: new Blob(['fake-pdf-data'], { type: 'application/pdf' }),
  fileName: 'chain-of-custody.pdf',
  fileType: 'application/pdf',
  kind: 'pdf',
}

const BASE_CTX = {
  specimenId: 'LAB-20260913-0001',
  patientRef: 'Patient/opaque-ref-spec-001',
  attachmentContext: 'receipt' as const,
  patientFirstName: 'Ahmad',
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('enqueueSpecimenAttachments', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    addToQueue.mockResolvedValue(1)
  })

  it('does not call addToQueue when attachment list is empty', async () => {
    await enqueueSpecimenAttachments([], BASE_CTX)
    expect(addToQueue).not.toHaveBeenCalled()
  })

  it('enqueues each attachment with kind:"specimen" and correct specimenId', async () => {
    await enqueueSpecimenAttachments([PREPARED_IMAGE, PREPARED_PDF], BASE_CTX)

    expect(addToQueue).toHaveBeenCalledTimes(2)

    const calls = addToQueue.mock.calls
    expect(calls[0]![0].metadata.kind).toBe('specimen')
    expect(calls[0]![0].metadata.specimenId).toBe('LAB-20260913-0001')
    expect(calls[1]![0].metadata.kind).toBe('specimen')
    expect(calls[1]![0].metadata.specimenId).toBe('LAB-20260913-0001')
  })

  it('passes attachmentContext:"receipt" when context is receipt', async () => {
    await enqueueSpecimenAttachments([PREPARED_IMAGE], { ...BASE_CTX, attachmentContext: 'receipt' })

    expect(addToQueue).toHaveBeenCalledTimes(1)
    expect(addToQueue.mock.calls[0]![0].metadata.attachmentContext).toBe('receipt')
  })

  it('passes attachmentContext:"rejection" when context is rejection', async () => {
    await enqueueSpecimenAttachments([PREPARED_IMAGE], { ...BASE_CTX, attachmentContext: 'rejection' })

    expect(addToQueue).toHaveBeenCalledTimes(1)
    expect(addToQueue.mock.calls[0]![0].metadata.attachmentContext).toBe('rejection')
  })

  it('stores patientRef and patientFirstName on each entry', async () => {
    await enqueueSpecimenAttachments([PREPARED_IMAGE], BASE_CTX)

    const entry = addToQueue.mock.calls[0]![0]
    expect(entry.patientRef).toBe('Patient/opaque-ref-spec-001')
    expect(entry.patientFirstName).toBe('Ahmad')
  })

  it('uses empty string for patientFirstName when not provided', async () => {
    const ctx = { specimenId: 'LAB-20260913-0001', patientRef: 'Patient/opaque-ref-spec-001', attachmentContext: 'receipt' as const }
    await enqueueSpecimenAttachments([PREPARED_IMAGE], ctx)

    expect(addToQueue.mock.calls[0]![0].patientFirstName).toBe('')
  })

  it('stores collectionDate in YYYY-MM-DD format', async () => {
    await enqueueSpecimenAttachments([PREPARED_IMAGE], BASE_CTX)

    const enqueuedDate = addToQueue.mock.calls[0]![0].metadata.collectionDate
    expect(enqueuedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('stores file blob, fileName, fileType on each entry', async () => {
    await enqueueSpecimenAttachments([PREPARED_IMAGE], BASE_CTX)

    const entry = addToQueue.mock.calls[0]![0]
    expect(entry.file).toBe(PREPARED_IMAGE.blob)
    expect(entry.fileName).toBe('tube.webp')
    expect(entry.fileType).toBe('image/webp')
  })

  it('throws EmptySpecimenIdError and does not enqueue when specimenId is empty', async () => {
    await expect(
      enqueueSpecimenAttachments([PREPARED_IMAGE], { ...BASE_CTX, specimenId: '' }),
    ).rejects.toThrow(EmptySpecimenIdError)

    expect(addToQueue).not.toHaveBeenCalled()
  })

  it('throws EmptyPatientRefError and does not enqueue when patientRef is empty', async () => {
    await expect(
      enqueueSpecimenAttachments([PREPARED_IMAGE], { ...BASE_CTX, patientRef: '' }),
    ).rejects.toThrow(EmptyPatientRefError)

    expect(addToQueue).not.toHaveBeenCalled()
  })
})
