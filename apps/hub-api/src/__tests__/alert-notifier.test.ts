import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'

// Mock fetch globally for webhook tests
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// Mock supabase for audit logging
// AuditLogger now uses supabase.rpc('audit_emit_with_lock', ...) — not .from().insert()
vi.mock('../lib/supabase', () => ({
  getSupabaseClient: vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      insert: vi.fn().mockResolvedValue({ error: null }),
    }),
    rpc: vi.fn().mockResolvedValue({
      data: [{ chain_hash: 'abc123' }],
      error: null,
    }),
  }),
}))

import { sendAlert, type AlertPayload } from '../lib/alert-notifier'

describe('Alert Notifier — Story 23.1 Task 7', () => {
  const baseAlert: AlertPayload = {
    severity: 'P2',
    title: 'High P95 Latency',
    description: 'patient.getById P95 is 650ms (threshold: 500ms)',
    metric: 'trpc_request_duration_ms',
    currentValue: 650,
    threshold: 500,
    timestamp: '2026-05-15T21:00:00.000Z',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockResolvedValue({ ok: true, status: 200 })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('delivers alert to webhook URL', async () => {
    vi.stubEnv('ALERT_WEBHOOK_URL', 'https://hooks.example.com/alert')

    await sendAlert(baseAlert)

    expect(mockFetch).toHaveBeenCalledWith(
      'https://hooks.example.com/alert',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        body: expect.stringContaining('"severity":"P2"'),
      }),
    )
  })

  it('logs alert to audit system with SYSTEM actor', async () => {
    vi.stubEnv('ALERT_WEBHOOK_URL', '')
    const { getSupabaseClient } = await import('../lib/supabase')
    const mockSupabase = getSupabaseClient()

    await sendAlert(baseAlert)

    // AuditLogger uses rpc('audit_emit_with_lock', ...) not .from('audit_events').insert()
    expect((mockSupabase as any).rpc).toHaveBeenCalledWith(
      'audit_emit_with_lock',
      expect.objectContaining({
        p_actor_id: 'SYSTEM',
        p_action: 'ALERT',
      }),
    )
  })

  it('does not throw if webhook fails', async () => {
    vi.stubEnv('ALERT_WEBHOOK_URL', 'https://hooks.example.com/alert')
    mockFetch.mockRejectedValue(new Error('Network error'))

    await expect(sendAlert(baseAlert)).resolves.not.toThrow()
  })

  it('alert payload matches expected format', async () => {
    vi.stubEnv('ALERT_WEBHOOK_URL', 'https://hooks.example.com/alert')

    await sendAlert(baseAlert)

    const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string)
    expect(body).toEqual(
      expect.objectContaining({
        severity: 'P2',
        title: expect.any(String),
        description: expect.any(String),
        metric: expect.any(String),
        currentValue: expect.any(Number),
        threshold: expect.any(Number),
        timestamp: expect.any(String),
      }),
    )
  })
})
