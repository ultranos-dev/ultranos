// @vitest-environment node

/**
 * Story 53.4: Tele-Consultation Request Builder Tests
 *
 * Covers:
 * 1. AI formatter: output contains no diagnoses, no clinical interpretations
 * 2. Offline template-based formatter produces structured output
 * 3. PHI guard: audit metadata never contains PHI
 * 4. Integration: build → AI format → tech confirm → data model validation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'

const TEST_PATIENT_NAME = 'Ahmad Karimi'

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('uuid', () => ({ v4: () => 'test-uuid-00000000-0000-0000-0000-000000000001' }))

vi.mock('@/lib/hlc', () => ({
  hlc: { now: () => ({ wallMs: Date.now(), counter: 0, nodeId: 'test-node' }) },
  serializeHlc: () => '000001234567890:00000:test-node',
}))

vi.mock('@/lib/supabase', () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      getSession: () => Promise.resolve({ data: { session: null } }),
    },
  }),
}))

vi.mock('@ultranos/audit-logger/client', () => ({
  emitClientAudit: vi.fn().mockResolvedValue(undefined),
  setAuditStoreAdapter: vi.fn(),
}))

vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: {
    getState: () => ({ session: { userId: 'tech-123' } }),
  },
}))

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { formatConsultationRequest, formatOffline } from '@/lib/consultation-ai-formatter'
import type { ResultSummaryData } from '@/lib/consultation'
import { ConfidenceLevel } from '@/lib/confidence'

// ─── Test fixtures ────────────────────────────────────────────────────────────

const cbcSummary: ResultSummaryData = {
  templateName: 'Complete Blood Count',
  templateLoincCode: '58410-2',
  fields: [
    { name: 'WBC', value: 2.1, unit: '10^9/L', flag: 'LL' },
    { name: 'HGB', value: 7.8, unit: 'g/dL', flag: 'L' },
    { name: 'PLT', value: 450, unit: '10^9/L', flag: 'H' },
  ],
}

const observationsText = 'Patient appears pale. Sample shows unusual cell morphology.'

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Offline formatter (template-based)', () => {
  it('produces structured output with required sections', () => {
    const result = formatOffline({ resultSummary: cbcSummary, observationsText, templateType: 'CBC' })

    expect(result.formattedText).toBeTruthy()
    expect(result.formattedText).toContain('Complete Blood Count')
    expect(result.formattedText).toContain('WBC')
    expect(result.formattedText).toContain('Observations')
    expect(result.confidence).toBe(ConfidenceLevel.HIGH)
  })

  it('includes all flagged fields in the output', () => {
    const result = formatOffline({ resultSummary: cbcSummary, observationsText, templateType: 'CBC' })

    // All flagged values should appear
    expect(result.formattedText).toContain('WBC')
    expect(result.formattedText).toContain('LL')
    expect(result.formattedText).toContain('HGB')
  })

  it('includes suggestion chips relevant to test type', () => {
    const result = formatOffline({ resultSummary: cbcSummary, observationsText, templateType: 'CBC' })

    expect(result.suggestedObservations).toBeInstanceOf(Array)
    expect(result.suggestedObservations.length).toBeGreaterThan(0)
  })

  it('returns HIGH confidence (deterministic formatting)', () => {
    const result = formatOffline({ resultSummary: cbcSummary, observationsText, templateType: 'CBC' })
    expect(result.confidence).toBe(ConfidenceLevel.HIGH)
  })

  it('does NOT contain diagnosis, clinical opinion, or treatment language', () => {
    const result = formatOffline({ resultSummary: cbcSummary, observationsText, templateType: 'CBC' })

    const prohibitedTerms = [
      /\bdiagnos(is|e|ed)\b/i,
      /\btreat(ment|ed|ing)\b/i,
      /\bprescri(be|ption)\b/i,
      /\blikely\s+(has|indicates?)\b/i,
      /\bclinical\s+impression\b/i,
    ]

    for (const pattern of prohibitedTerms) {
      expect(result.formattedText).not.toMatch(pattern)
    }
  })
})

describe('Online formatter (AI-assisted)', () => {
  it('returns formatted text from AI response', async () => {
    // Mock the fetch for the AI API call
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                formattedText: '**Consultation Request**\n\nTest: Complete Blood Count\n\nKey Findings:\n- WBC: 2.1 10^9/L [LL]\n- HGB: 7.8 g/dL [L]\n\nObservations:\nPatient appears pale.',
                suggestedObservations: ['specimen appearance', 'cell morphology details'],
                confidence: 0.85,
              }),
            },
          },
        ],
      }),
    })
    global.fetch = mockFetch

    const result = await formatConsultationRequest({
      resultSummary: cbcSummary,
      observationsText,
      templateType: 'CBC',
    })

    expect(result.formattedText).toBeTruthy()
    expect(result.confidence).toBeTruthy()
  })

  it('falls back to offline template when AI API is unavailable', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

    const result = await formatConsultationRequest({
      resultSummary: cbcSummary,
      observationsText,
      templateType: 'CBC',
    })

    // Should still produce output via offline fallback
    expect(result.formattedText).toBeTruthy()
    expect(result.confidence).toBe(ConfidenceLevel.HIGH)
  })

  it('never includes patient identifiers in AI request', async () => {
    const capturedBodies: unknown[] = []
    global.fetch = vi.fn().mockImplementation((_url: unknown, opts: RequestInit) => {
      capturedBodies.push(JSON.parse(opts.body as string))
      return Promise.resolve({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify({ formattedText: 'test', suggestedObservations: [], confidence: 0.9 }) } }],
        }),
      })
    })

    await formatConsultationRequest({
      resultSummary: cbcSummary,
      observationsText,
      templateType: 'CBC',
    })

    // The body sent to AI must not contain patient-identifying strings.
    // TEST_PATIENT_NAME is a fixture representing a real name that the formatter
    // should never inject from its own logic (it is not present in any input here).
    const bodyStr = JSON.stringify(capturedBodies)
    expect(bodyStr).not.toMatch(/patient\s*id\s*[:=]/i)
    expect(bodyStr).not.toMatch(/\bDOB\b/i)
    expect(bodyStr).not.toContain(TEST_PATIENT_NAME)
  })
})

describe('PHI guard — audit metadata', () => {
  it('consultation audit events contain only opaque IDs, no PHI', async () => {
    const { emitClientAudit } = await import('@ultranos/audit-logger/client')
    const { reportConsultationEvent } = await import('@/lib/audit-client')

    reportConsultationEvent({
      action: 'CONSULTATION_CREATED',
      consultationId: 'cons-uuid-001',
      recipientType: 'pathologist',
      status: 'draft',
    })

    expect(emitClientAudit).toHaveBeenCalled()

    const callArg = (emitClientAudit as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<string, unknown>
    const metaStr = JSON.stringify(callArg.metadata)

    // No PHI in metadata
    expect(metaStr).not.toMatch(/patient/i)
    expect(metaStr).not.toMatch(/name/i)
    expect(metaStr).not.toMatch(/observation/i)
    expect(metaStr).not.toMatch(/result.*value/i)
  })
})

describe('ConsultationRequest data model', () => {
  it('status transitions are well-typed', async () => {
    const { createDraftRequest } = await import('@/lib/consultation')

    const draft = createDraftRequest({
      sampleId: 'sample-001',
      resultSummary: cbcSummary,
      recipientType: 'pathologist',
      recipientId: 'path-001',
    })

    expect(draft.status).toBe('draft')
    expect(draft.syncStatus).toBe('pending')
    expect(draft.id).toBeTruthy()
    expect(draft.sampleId).toBe('sample-001')
    expect(draft.photoAttachments).toEqual([])
    expect(draft.aiFormattedText).toBeNull()
    expect(draft.knowledgeCardId).toBeNull()
  })
})

describe('Sync functions', () => {
  // ─── Fixtures ───────────────────────────────────────────────────────────────

  function makeRequest(overrides: Partial<import('@/lib/consultation').ConsultationRequest> = {}): import('@/lib/consultation').ConsultationRequest {
    return {
      id: 'req-001',
      sampleId: 'sample-001',
      resultSummary: { templateName: 'CBC', templateLoincCode: '58410-2', fields: [] },
      observationsText: '',
      aiFormattedText: null,
      finalText: '',
      photoAttachments: [],
      knowledgeCardId: null,
      recipientType: 'pathologist',
      recipientId: 'path-001',
      status: 'submitted',
      createdAt: new Date().toISOString(),
      hlcTimestamp: '000001234567890:00000:test-node',
      syncStatus: 'pending',
      ...overrides,
    }
  }

  function makeIncomingResponse(overrides: Partial<{ id: string; requestId: string }> = {}) {
    return {
      id: 'resp-001',
      requestId: 'req-001',
      respondentName: 'Dr. Smith',
      respondentCredentials: 'MD',
      responseText: 'The result is within expected bounds.',
      attachments: [],
      receivedAt: new Date().toISOString(),
      hlcTimestamp: '000001234567890:00001:test-node',
      ...overrides,
    }
  }

  // ─── Reset DB tables between tests ─────────────────────────────────────────

  beforeEach(async () => {
    const { getDb } = await import('@/lib/db')
    const db = getDb()
    await db.consultation_requests.clear()
    await db.consultation_responses.clear()
  })

  // ─── syncPendingRequests ────────────────────────────────────────────────────

  it('syncPendingRequests → marks synced on 200', async () => {
    const { getDb } = await import('@/lib/db')
    const { syncPendingRequests } = await import('@/lib/consultation-sync')

    const db = getDb()
    await db.consultation_requests.add(makeRequest())

    global.fetch = vi.fn().mockResolvedValue({ ok: true })

    await syncPendingRequests('http://hub', 'token')

    const updated = await db.consultation_requests.get('req-001')
    expect(updated?.syncStatus).toBe('synced')
    expect(updated?.status).toBe('sent')
  })

  it('syncPendingRequests → marks failed on non-200', async () => {
    const { getDb } = await import('@/lib/db')
    const { syncPendingRequests } = await import('@/lib/consultation-sync')

    const db = getDb()
    await db.consultation_requests.add(makeRequest())

    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 })

    await syncPendingRequests('http://hub', 'token')

    const updated = await db.consultation_requests.get('req-001')
    expect(updated?.syncStatus).toBe('failed')
    expect(updated?.status).toBe('submitted')
  })

  // ─── syncIncomingResponses ──────────────────────────────────────────────────

  it('syncIncomingResponses → idempotency: no duplicate inserts', async () => {
    const { getDb } = await import('@/lib/db')
    const { syncIncomingResponses } = await import('@/lib/consultation-sync')

    const db = getDb()
    // Seed parent request so the response is not orphaned
    await db.consultation_requests.add(makeRequest({ syncStatus: 'synced', status: 'sent' }))

    const response = makeIncomingResponse()
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ responses: [response] }),
    })

    await syncIncomingResponses('http://hub', 'token')
    await syncIncomingResponses('http://hub', 'token')

    const count = await db.consultation_responses.count()
    expect(count).toBe(1)
  })

  it('syncIncomingResponses → onNotification fires on new response', async () => {
    const { getDb } = await import('@/lib/db')
    const { syncIncomingResponses } = await import('@/lib/consultation-sync')

    const db = getDb()
    const request = makeRequest({ syncStatus: 'synced', status: 'sent', sampleId: 'sample-001' })
    await db.consultation_requests.add(request)

    const incoming = makeIncomingResponse({ requestId: request.id })
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ responses: [incoming] }),
    })

    const onNotification = vi.fn()
    await syncIncomingResponses('http://hub', 'token', onNotification)

    expect(onNotification).toHaveBeenCalledWith(request.sampleId, incoming.requestId)
  })
})
