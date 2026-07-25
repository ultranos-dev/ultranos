import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock TTS client before importing router
vi.mock('@/lib/tts-client', () => ({
  synthesizeSpeech: vi.fn(),
  isTTSError: vi.fn((result: any) => 'error' in result),
}))

// Mock Supabase client
vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => mockSupabaseClient),
  db: {
    toRow: (data: any) => data,
    toRowRaw: (data: any) => data,
    fromRow: (data: any) => data,
    fromRowRaw: (data: any) => data,
    fromRows: (data: any[]) => data,
  },
}))

const mockRpc = vi.fn().mockResolvedValue({ data: [{ chain_hash: 'abc123' }], error: null })

const mockSupabaseClient = {
  from: vi.fn(),
  rpc: mockRpc,
  storage: {
    from: vi.fn(),
  },
}

const { appRouter } = await import('../trpc/routers/_app')
const { createCallerFactory } = await import('../trpc/init')
const { synthesizeSpeech } = await import('@/lib/tts-client')

const createCaller = createCallerFactory(appRouter)

const PATIENT_UUID = '00000000-0000-4000-8000-000000000010'
const RX_UUID = '00000000-0000-4000-8000-000000000020'

const PATIENT_USER = { sub: PATIENT_UUID, role: 'PATIENT', sessionId: 'sess-p1', orgId: null, status: null }
const DOCTOR_USER = { sub: 'doc-001', role: 'DOCTOR', sessionId: 'sess-d1', orgId: 'org-001', status: null }
const PHARMACIST_USER = { sub: 'pharm-001', role: 'PHARMACIST', sessionId: 'sess-ph1', orgId: 'org-001', status: null }

function createTestContext(overrides?: {
  user?: { sub: string; role: string; sessionId: string; orgId?: string | null; status?: string | null } | null
}) {
  return {
    supabase: mockSupabaseClient as never,
    user: overrides?.user ?? null,
    headers: new Headers(),
  }
}

function mockConsentTable(hasConsent: boolean, expired = false) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({
              data: hasConsent
                ? [{
                    id: 'consent-1',
                    status: 'ACTIVE',
                    purpose: 'AI_PROCESSING',
                    date_time: '2026-01-01T00:00:00Z',
                    provision_end: expired ? '2025-01-01T00:00:00Z' : null,
                  }]
                : [],
              error: null,
            }),
          }),
        }),
      }),
    }),
  }
}

function mockMedicationRequestTable() {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: {
            id: RX_UUID,
            medication_display: 'Amoxicillin 500mg',
            medication_text: null,
            dosage_instruction: { text: 'Take one capsule', frequency: 'three times daily', duration: '7 days', timeOfDay: 'morning, afternoon, and evening', caution: 'Take with food' },
            dispense_request: { duration: '7 days' },
            subject_reference: `Patient/${PATIENT_UUID}`,
          },
          error: null,
        }),
      }),
    }),
  }
}

function mockAuditLogTable() {
  return {
    select: vi.fn().mockReturnValue({
      order: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    }),
    insert: vi.fn().mockResolvedValue({ error: null }),
  }
}

function mockStorageUpload() {
  return {
    upload: vi.fn().mockResolvedValue({ error: null }),
    createSignedUrl: vi.fn().mockResolvedValue({
      data: { signedUrl: 'https://storage.example.com/tts/test.mp3?token=abc' },
      error: null,
    }),
    remove: vi.fn().mockResolvedValue({ error: null }),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
})

describe('medication.generatePrescriptionAudio', () => {
  it('returns pre-signed URL with expiry on success', async () => {
    const storageMock = mockStorageUpload()
    mockSupabaseClient.storage.from.mockReturnValue(storageMock)
    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'consents') return mockConsentTable(true)
      if (table === 'medication_requests') return mockMedicationRequestTable()
      if (table === 'audit_log') return mockAuditLogTable()
      return { select: vi.fn().mockResolvedValue({ data: null, error: null }) }
    })

    vi.mocked(synthesizeSpeech).mockResolvedValue({
      audio: Buffer.from('fake-audio-data'),
      contentType: 'audio/mpeg',
    })

    const caller = createCaller(createTestContext({ user: PATIENT_USER }))
    const result = await caller.medication.generatePrescriptionAudio({
      medicationRequestId: RX_UUID,
      dialect: 'EN',
      patientId: PATIENT_UUID,
    })

    expect(result.audioUrl).toBe('https://storage.example.com/tts/test.mp3?token=abc')
    expect(result.expiresAt).toBeDefined()
    expect(result.dialect).toBe('EN')
    expect(storageMock.upload).toHaveBeenCalledTimes(1)
    expect(storageMock.createSignedUrl).toHaveBeenCalledWith(
      expect.stringContaining('tts/'),
      900, // 15 minutes
    )
  })

  it('checks AI_PROCESSING consent and returns error when not granted', async () => {
    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'consents') return mockConsentTable(false)
      if (table === 'audit_log') return mockAuditLogTable()
      return { select: vi.fn().mockResolvedValue({ data: null, error: null }) }
    })

    const caller = createCaller(createTestContext({ user: PATIENT_USER }))

    await expect(
      caller.medication.generatePrescriptionAudio({
        medicationRequestId: RX_UUID,
        dialect: 'EN',
        patientId: PATIENT_UUID,
      }),
    ).rejects.toThrow('AI_PROCESSING_CONSENT_REQUIRED')
  })

  it('returns error when consent is expired', async () => {
    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'consents') return mockConsentTable(true, true)
      if (table === 'audit_log') return mockAuditLogTable()
      return { select: vi.fn().mockResolvedValue({ data: null, error: null }) }
    })

    const caller = createCaller(createTestContext({ user: PATIENT_USER }))

    await expect(
      caller.medication.generatePrescriptionAudio({
        medicationRequestId: RX_UUID,
        dialect: 'EN',
        patientId: PATIENT_UUID,
      }),
    ).rejects.toThrow('AI_PROCESSING_CONSENT_REQUIRED')
  })

  it('rejects unauthorized roles (PHARMACIST)', async () => {
    const caller = createCaller(createTestContext({ user: PHARMACIST_USER }))

    await expect(
      caller.medication.generatePrescriptionAudio({
        medicationRequestId: RX_UUID,
        dialect: 'EN',
        patientId: PATIENT_UUID,
      }),
    ).rejects.toThrow('Insufficient permissions')
  })

  it('allows DOCTOR role to generate TTS', async () => {
    const storageMock = mockStorageUpload()
    mockSupabaseClient.storage.from.mockReturnValue(storageMock)
    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'consents') return mockConsentTable(true)
      if (table === 'medication_requests') return mockMedicationRequestTable()
      if (table === 'audit_log') return mockAuditLogTable()
      return { select: vi.fn().mockResolvedValue({ data: null, error: null }) }
    })

    vi.mocked(synthesizeSpeech).mockResolvedValue({
      audio: Buffer.from('fake-audio-data'),
      contentType: 'audio/mpeg',
    })

    const caller = createCaller(createTestContext({ user: DOCTOR_USER }))
    const result = await caller.medication.generatePrescriptionAudio({
      medicationRequestId: RX_UUID,
      dialect: 'AR_LEVANTINE',
      patientId: PATIENT_UUID,
    })

    expect(result.audioUrl).toBeDefined()
    expect(result.dialect).toBe('AR_LEVANTINE')
  })

  it('returns TTS_UNAVAILABLE when TTS API fails', async () => {
    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'consents') return mockConsentTable(true)
      if (table === 'medication_requests') return mockMedicationRequestTable()
      if (table === 'audit_log') return mockAuditLogTable()
      return { select: vi.fn().mockResolvedValue({ data: null, error: null }) }
    })

    vi.mocked(synthesizeSpeech).mockResolvedValue({ error: 'TTS_UNAVAILABLE' })

    const caller = createCaller(createTestContext({ user: PATIENT_USER }))

    await expect(
      caller.medication.generatePrescriptionAudio({
        medicationRequestId: RX_UUID,
        dialect: 'EN',
        patientId: PATIENT_UUID,
      }),
    ).rejects.toThrow('TTS_UNAVAILABLE')
  })

  it('rejects unauthenticated requests', async () => {
    const caller = createCaller(createTestContext({ user: null }))

    await expect(
      caller.medication.generatePrescriptionAudio({
        medicationRequestId: RX_UUID,
        dialect: 'EN',
        patientId: PATIENT_UUID,
      }),
    ).rejects.toThrow('UNAUTHORIZED')
  })

  it('emits audit event on TTS generation', async () => {
    const storageMock = mockStorageUpload()
    mockSupabaseClient.storage.from.mockReturnValue(storageMock)
    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'consents') return mockConsentTable(true)
      if (table === 'medication_requests') return mockMedicationRequestTable()
      if (table === 'audit_log') return mockAuditLogTable()
      return { select: vi.fn().mockResolvedValue({ data: null, error: null }) }
    })

    vi.mocked(synthesizeSpeech).mockResolvedValue({
      audio: Buffer.from('fake-audio-data'),
      contentType: 'audio/mpeg',
    })

    mockRpc.mockClear()

    const caller = createCaller(createTestContext({ user: PATIENT_USER }))
    await caller.medication.generatePrescriptionAudio({
      medicationRequestId: RX_UUID,
      dialect: 'EN',
      patientId: PATIENT_UUID,
    })

    // AuditLogger uses rpc('audit_emit_with_lock', ...) for hash-chained audit
    expect(mockRpc).toHaveBeenCalled()
    const rpcCall = mockRpc.mock.calls.find((c: any[]) => c[0] === 'audit_emit_with_lock')
    expect(rpcCall).toBeDefined()
    expect(rpcCall![1].p_action).toBe('PHI_READ')
    expect(rpcCall![1].p_resource_type).toBe('PRESCRIPTION')
    expect(rpcCall![1].p_metadata).toEqual(
      expect.objectContaining({
        ttsAction: 'TTS_GENERATED',
        dialect: 'EN',
      }),
    )
  })
})

describe('medication.logTTSPlayback', () => {
  it('logs playback completion on 100% playback', async () => {
    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'audit_log') return mockAuditLogTable()
      return { select: vi.fn().mockResolvedValue({ data: null, error: null }) }
    })
    mockRpc.mockClear()

    const caller = createCaller(createTestContext({ user: PATIENT_USER }))
    const result = await caller.medication.logTTSPlayback({
      medicationRequestId: RX_UUID,
      patientId: PATIENT_UUID,
      dialect: 'EN',
      source: 'CLOUD_TTS',
      completedAt: '2026-05-16T12:00:00Z',
    })

    expect(result.success).toBe(true)
    expect(mockRpc).toHaveBeenCalled()
    const rpcCall = mockRpc.mock.calls.find((c: any[]) => c[0] === 'audit_emit_with_lock')
    expect(rpcCall).toBeDefined()
    expect(rpcCall![1].p_metadata).toEqual(
      expect.objectContaining({
        ttsAction: 'TTS_PLAYBACK_COMPLETED',
        source: 'CLOUD_TTS',
      }),
    )
  })

  it('returns success false for unauthorized roles', async () => {
    const caller = createCaller(createTestContext({ user: PHARMACIST_USER }))
    const result = await caller.medication.logTTSPlayback({
      medicationRequestId: RX_UUID,
      patientId: PATIENT_UUID,
      dialect: 'EN',
      source: 'CLOUD_TTS',
      completedAt: '2026-05-16T12:00:00Z',
    })

    expect(result.success).toBe(false)
  })
})
