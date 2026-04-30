import { describe, it, expect, beforeEach } from 'vitest'
import { logInteractionCheck, getInteractionAuditLog } from '@/services/interactionAuditService'
import { db } from '@/lib/db'

describe('Interaction Audit Logging', () => {
  beforeEach(async () => {
    await db.interactionAuditLog.clear()
  })

  it('logs a CLEAR interaction check result', async () => {
    await logInteractionCheck({
      encounterId: 'enc-001',
      patientId: 'pat-001',
      medicationRequestId: 'med-001',
      medicationDisplay: 'Paracetamol',
      checkResult: 'CLEAR',
      interactionsFound: 0,
      practitionerRef: 'Practitioner/doc-001',
    })

    const logs = await getInteractionAuditLog('enc-001')
    expect(logs).toHaveLength(1)
    expect(logs[0].checkResult).toBe('CLEAR')
    expect(logs[0].medicationDisplay).toBe('Paracetamol')
  })

  it('logs a BLOCKED interaction check with override reason', async () => {
    await logInteractionCheck({
      encounterId: 'enc-001',
      patientId: 'pat-001',
      medicationRequestId: 'med-002',
      medicationDisplay: 'Warfarin',
      checkResult: 'BLOCKED',
      interactionsFound: 2,
      overrideReason: 'Benefit outweighs risk',
      practitionerRef: 'Practitioner/doc-001',
    })

    const logs = await getInteractionAuditLog('enc-001')
    expect(logs).toHaveLength(1)
    expect(logs[0].checkResult).toBe('BLOCKED')
    expect(logs[0].overrideReason).toBe('Benefit outweighs risk')
    expect(logs[0].interactionsFound).toBe(2)
  })

  it('logs a WARNING interaction check', async () => {
    await logInteractionCheck({
      encounterId: 'enc-001',
      patientId: 'pat-001',
      medicationRequestId: 'med-003',
      medicationDisplay: 'Omeprazole',
      checkResult: 'WARNING',
      interactionsFound: 1,
      practitionerRef: 'Practitioner/doc-001',
    })

    const logs = await getInteractionAuditLog('enc-001')
    expect(logs).toHaveLength(1)
    expect(logs[0].checkResult).toBe('WARNING')
  })

  it('logs an UNAVAILABLE interaction check', async () => {
    await logInteractionCheck({
      encounterId: 'enc-001',
      patientId: 'pat-001',
      medicationRequestId: 'med-004',
      medicationDisplay: 'Amoxicillin',
      checkResult: 'UNAVAILABLE',
      interactionsFound: 0,
      practitionerRef: 'Practitioner/doc-001',
    })

    const logs = await getInteractionAuditLog('enc-001')
    expect(logs).toHaveLength(1)
    expect(logs[0].checkResult).toBe('UNAVAILABLE')
  })

  it('assigns a unique ID and timestamp to each log entry', async () => {
    await logInteractionCheck({
      encounterId: 'enc-001',
      patientId: 'pat-001',
      medicationRequestId: 'med-001',
      medicationDisplay: 'Test Drug',
      checkResult: 'CLEAR',
      interactionsFound: 0,
      practitionerRef: 'Practitioner/doc-001',
    })

    const logs = await getInteractionAuditLog('enc-001')
    expect(logs[0].id).toBeTruthy()
    expect(logs[0].createdAt).toBeTruthy()
    expect(new Date(logs[0].createdAt).toISOString()).toBe(logs[0].createdAt)
  })

  it('retrieves logs filtered by encounter', async () => {
    await logInteractionCheck({
      encounterId: 'enc-001',
      patientId: 'pat-001',
      medicationRequestId: 'med-001',
      medicationDisplay: 'Drug A',
      checkResult: 'CLEAR',
      interactionsFound: 0,
      practitionerRef: 'Practitioner/doc-001',
    })
    await logInteractionCheck({
      encounterId: 'enc-002',
      patientId: 'pat-001',
      medicationRequestId: 'med-002',
      medicationDisplay: 'Drug B',
      checkResult: 'WARNING',
      interactionsFound: 1,
      practitionerRef: 'Practitioner/doc-001',
    })

    const enc1Logs = await getInteractionAuditLog('enc-001')
    expect(enc1Logs).toHaveLength(1)
    expect(enc1Logs[0].medicationDisplay).toBe('Drug A')

    const enc2Logs = await getInteractionAuditLog('enc-002')
    expect(enc2Logs).toHaveLength(1)
    expect(enc2Logs[0].medicationDisplay).toBe('Drug B')
  })

  it('logs are append-only (multiple entries for same encounter)', async () => {
    for (let i = 0; i < 3; i++) {
      await logInteractionCheck({
        encounterId: 'enc-001',
        patientId: 'pat-001',
        medicationRequestId: `med-00${i}`,
        medicationDisplay: `Drug ${i}`,
        checkResult: 'CLEAR',
        interactionsFound: 0,
        practitionerRef: 'Practitioner/doc-001',
      })
    }

    const logs = await getInteractionAuditLog('enc-001')
    expect(logs).toHaveLength(3)
  })
})
