import { describe, it, expect } from 'vitest'
import { parseHealthPassportQr } from '@/lib/health-passport-qr'

const NOW = 1_700_000_000_000 // fixed clock (ms)
const NOW_S = NOW / 1000

describe('parseHealthPassportQr', () => {
  it('extracts pid from a valid, unexpired Health Passport payload', () => {
    const qr = JSON.stringify({ pid: 'patient-123', iat: NOW_S - 60, exp: NOW_S + 3600, v: 1 })
    expect(parseHealthPassportQr(qr, NOW)).toEqual({ ok: true, patientId: 'patient-123' })
  })

  it('rejects an expired QR', () => {
    const qr = JSON.stringify({ pid: 'patient-123', iat: NOW_S - 7200, exp: NOW_S - 60, v: 1 })
    expect(parseHealthPassportQr(qr, NOW)).toEqual({ ok: false, reason: 'expired' })
  })

  it('accepts a payload with no exp (never-expiring)', () => {
    const qr = JSON.stringify({ pid: 'patient-xyz', v: 1 })
    expect(parseHealthPassportQr(qr, NOW)).toEqual({ ok: true, patientId: 'patient-xyz' })
  })

  it('treats a non-JSON payload as a raw patient id', () => {
    expect(parseHealthPassportQr('550e8400-e29b-41d4-a716-446655440000', NOW)).toEqual({
      ok: true,
      patientId: '550e8400-e29b-41d4-a716-446655440000',
    })
  })

  it('trims surrounding whitespace from a raw id', () => {
    expect(parseHealthPassportQr('  patient-9  ', NOW)).toEqual({ ok: true, patientId: 'patient-9' })
  })

  it('rejects a JSON object with no usable pid', () => {
    expect(parseHealthPassportQr(JSON.stringify({ foo: 'bar', exp: NOW_S + 60 }), NOW)).toEqual({
      ok: false,
      reason: 'invalid',
    })
  })

  it('rejects an empty scan', () => {
    expect(parseHealthPassportQr('', NOW)).toEqual({ ok: false, reason: 'invalid' })
    expect(parseHealthPassportQr('   ', NOW)).toEqual({ ok: false, reason: 'invalid' })
  })

  it('rejects a payload whose pid is present but blank', () => {
    expect(parseHealthPassportQr(JSON.stringify({ pid: '   ', exp: NOW_S + 60 }), NOW)).toEqual({
      ok: false,
      reason: 'invalid',
    })
  })

  it('prefers an expiry check over pid extraction', () => {
    const qr = JSON.stringify({ pid: 'patient-123', exp: NOW_S - 1 })
    expect(parseHealthPassportQr(qr, NOW)).toEqual({ ok: false, reason: 'expired' })
  })
})
