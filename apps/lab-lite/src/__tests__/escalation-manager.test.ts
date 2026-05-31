/**
 * Story 48.4 — Escalation Chain Manager Tests
 * AC: 1, 2, 3, 4, 5, 6, 7, 9
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  initiateEscalation,
  acknowledgeStep,
  advanceEscalation,
  catchUpMissedSteps,
} from '../lib/escalation-manager'
import type { EscalationChain, EscalationStep } from '../lib/db'
import type { CriticalValueResult } from '../lib/critical-value-engine'

// Mock uuid
vi.mock('uuid', () => ({ v4: () => 'test-chain-uuid-001' }))

const mockChain: EscalationChain = {
  chainId: 'test-chain-uuid-001',
  resultId: 'result-001',
  loincCode: '2823-3',
  analyte: 'Potassium',
  criticalValue: 7.5,
  unit: 'mmol/L',
  criticalDirection: 'high',
  patientRef: 'Patient/pat-001',
  orderingPhysicianId: 'prac-physician-001',
  currentStep: 1,
  status: 'active',
  steps: [
    { stepNumber: 1, type: 'tech_alert', recipientId: 'releasing_tech', recipientRole: 'lab_tech', scheduledAt: '2026-05-31T08:00:00.000Z', sentAt: null, acknowledgedAt: null, status: 'pending' },
    { stepNumber: 2, type: 'inapp_notification', recipientId: 'prac-physician-001', recipientRole: 'physician', scheduledAt: '2026-05-31T08:00:00.000Z', sentAt: null, acknowledgedAt: null, status: 'pending' },
    { stepNumber: 3, type: 'sms_physician', recipientId: 'prac-physician-001', recipientRole: 'physician', scheduledAt: '2026-05-31T08:15:00.000Z', sentAt: null, acknowledgedAt: null, status: 'pending' },
    { stepNumber: 4, type: 'sms_director', recipientId: 'medical_director_unset', recipientRole: 'medical_director', scheduledAt: '2026-05-31T08:30:00.000Z', sentAt: null, acknowledgedAt: null, status: 'pending' },
    { stepNumber: 5, type: 'flag_district', recipientId: 'district_officer_unset', recipientRole: 'district_officer', scheduledAt: '2026-05-31T09:00:00.000Z', sentAt: null, acknowledgedAt: null, status: 'pending' },
  ],
  createdAt: '2026-05-31T08:00:00.000Z',
  acknowledgedAt: null,
  acknowledgedBy: null,
}

const mockDb = {
  escalation_chains: {
    add: vi.fn(),
    get: vi.fn(),
    put: vi.fn(),
    where: vi.fn(() => ({ equals: vi.fn(() => ({ toArray: vi.fn() })) })),
  },
  escalation_contacts: {
    where: vi.fn(() => ({ equals: vi.fn(() => ({ first: vi.fn() })) })),
  },
}

vi.mock('../lib/db', () => ({
  createEscalationChain: vi.fn(),
  getEscalationChainById: vi.fn(),
  updateEscalationChain: vi.fn(),
  getActiveEscalationChains: vi.fn(),
  getEscalationHistory: vi.fn(),
  getDefaultEscalationContact: vi.fn().mockResolvedValue(null),
}))

import {
  createEscalationChain,
  getEscalationChainById,
  updateEscalationChain,
  getDefaultEscalationContact,
} from '../lib/db'

const criticalResult: CriticalValueResult = {
  isCritical: true,
  direction: 'high',
  threshold: 6.5,
  analyte: 'Potassium',
  loincCode: '2823-3',
  value: 7.5,
  unit: 'mmol/L',
}

describe('initiateEscalation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getDefaultEscalationContact).mockResolvedValue(null)
    vi.mocked(createEscalationChain).mockResolvedValue(undefined)
  })

  it('creates chain with 5 pre-computed steps', async () => {
    const chain = await initiateEscalation(criticalResult, 'result-001', 'Patient/pat-001', 'prac-physician-001')

    expect(createEscalationChain).toHaveBeenCalledOnce()
    const savedChain = vi.mocked(createEscalationChain).mock.calls[0][0]

    expect(savedChain.steps).toHaveLength(5)
    expect(savedChain.status).toBe('active')
    expect(savedChain.currentStep).toBe(1)
    expect(savedChain.resultId).toBe('result-001')
  })

  it('computes correct timing offsets', async () => {
    const before = Date.now()
    const chain = await initiateEscalation(criticalResult, 'result-001', 'Patient/pat-001', 'prac-physician-001')
    const after = Date.now()

    const savedChain = vi.mocked(createEscalationChain).mock.calls[0][0]
    const steps = savedChain.steps

    const step3Time = new Date(steps[2].scheduledAt).getTime()
    const step4Time = new Date(steps[3].scheduledAt).getTime()
    const step5Time = new Date(steps[4].scheduledAt).getTime()
    const createdTime = new Date(savedChain.createdAt).getTime()

    // Step 3: T+15 minutes
    expect(step3Time - createdTime).toBeCloseTo(15 * 60_000, -2)
    // Step 4: T+30 minutes
    expect(step4Time - createdTime).toBeCloseTo(30 * 60_000, -2)
    // Step 5: T+60 minutes
    expect(step5Time - createdTime).toBeCloseTo(60 * 60_000, -2)
  })

  it('uses fallback contact IDs when contacts not configured', async () => {
    vi.mocked(getDefaultEscalationContact).mockResolvedValue(null)
    await initiateEscalation(criticalResult, 'result-001', 'Patient/pat-001', 'prac-physician-001')

    const savedChain = vi.mocked(createEscalationChain).mock.calls[0][0]
    const step4 = savedChain.steps[3]
    const step5 = savedChain.steps[4]

    expect(step4.recipientId).toBe('medical_director_unset')
    expect(step5.recipientId).toBe('district_officer_unset')
  })
})

describe('acknowledgeStep', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getEscalationChainById).mockResolvedValue({ ...mockChain })
    vi.mocked(updateEscalationChain).mockResolvedValue(undefined)
  })

  it('step 1 (tech) advances chain to step 2 but does NOT close it', async () => {
    await acknowledgeStep('test-chain-uuid-001', 1, 'tech-001')

    expect(updateEscalationChain).toHaveBeenCalledWith('test-chain-uuid-001', expect.objectContaining({
      currentStep: 2,
    }))
    // Status should NOT be set to acknowledged
    const callArg = vi.mocked(updateEscalationChain).mock.calls[0][1]
    expect(callArg).not.toHaveProperty('status', 'acknowledged')
  })

  it('step 2 (physician) closes the chain with acknowledged status', async () => {
    const chainAtStep2 = { ...mockChain, currentStep: 2 }
    vi.mocked(getEscalationChainById).mockResolvedValue(chainAtStep2)

    await acknowledgeStep('test-chain-uuid-001', 2, 'prac-physician-001')

    expect(updateEscalationChain).toHaveBeenCalledWith('test-chain-uuid-001', expect.objectContaining({
      status: 'acknowledged',
      acknowledgedBy: 'prac-physician-001',
    }))
  })

  it('skips remaining steps when chain is acknowledged', async () => {
    const chainAtStep3 = { ...mockChain, currentStep: 3 }
    vi.mocked(getEscalationChainById).mockResolvedValue(chainAtStep3)

    await acknowledgeStep('test-chain-uuid-001', 3, 'prac-physician-001')

    const callArg = vi.mocked(updateEscalationChain).mock.calls[0][1]
    const steps = callArg.steps as EscalationStep[]
    const pendingAfterAck = steps.filter((s: EscalationStep) => s.stepNumber > 3 && s.status === 'skipped')
    expect(pendingAfterAck.length).toBe(2) // steps 4 and 5 should be skipped
  })

  it('does nothing when chain is already acknowledged', async () => {
    vi.mocked(getEscalationChainById).mockResolvedValue({ ...mockChain, status: 'acknowledged' })
    await acknowledgeStep('test-chain-uuid-001', 1, 'tech-001')
    expect(updateEscalationChain).not.toHaveBeenCalled()
  })

  it('does nothing when chain not found', async () => {
    vi.mocked(getEscalationChainById).mockResolvedValue(undefined)
    await acknowledgeStep('test-chain-uuid-001', 1, 'tech-001')
    expect(updateEscalationChain).not.toHaveBeenCalled()
  })
})

describe('advanceEscalation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(updateEscalationChain).mockResolvedValue(undefined)
  })

  it('returns null for step 1 (handled by UI)', async () => {
    vi.mocked(getEscalationChainById).mockResolvedValue({ ...mockChain, currentStep: 1 })
    const result = await advanceEscalation('test-chain-uuid-001')
    expect(result).toBeNull()
  })

  it('returns null when step has not yet timed out', async () => {
    const futureTime = new Date(Date.now() + 30 * 60_000).toISOString()
    const chain: EscalationChain = {
      ...mockChain,
      currentStep: 3,
      steps: mockChain.steps.map((s) => ({
        ...s,
        scheduledAt: futureTime, // all steps in the future
      })),
    }
    vi.mocked(getEscalationChainById).mockResolvedValue(chain)
    const result = await advanceEscalation('test-chain-uuid-001')
    expect(result).toBeNull()
  })

  it('advances and marks step as sent when scheduled time has passed', async () => {
    const pastTime = new Date(Date.now() - 5 * 60_000).toISOString() // 5 min ago
    const chain: EscalationChain = {
      ...mockChain,
      currentStep: 3,
      steps: mockChain.steps.map((s) =>
        s.stepNumber === 3 ? { ...s, scheduledAt: pastTime } : s
      ),
    }
    vi.mocked(getEscalationChainById).mockResolvedValue(chain)
    const step = await advanceEscalation('test-chain-uuid-001')

    expect(step).not.toBeNull()
    expect(step!.stepNumber).toBe(3)
    expect(updateEscalationChain).toHaveBeenCalledWith('test-chain-uuid-001', expect.objectContaining({
      currentStep: 4,
    }))
  })

  it('marks chain expired when last step (5) advances', async () => {
    const pastTime = new Date(Date.now() - 5 * 60_000).toISOString()
    const chain: EscalationChain = {
      ...mockChain,
      currentStep: 5,
      steps: mockChain.steps.map((s) =>
        s.stepNumber === 5 ? { ...s, scheduledAt: pastTime } : s
      ),
    }
    vi.mocked(getEscalationChainById).mockResolvedValue(chain)
    await advanceEscalation('test-chain-uuid-001')

    expect(updateEscalationChain).toHaveBeenCalledWith('test-chain-uuid-001', expect.objectContaining({
      status: 'expired',
    }))
  })

  it('returns null for acknowledged/expired chains (race-condition guard)', async () => {
    vi.mocked(getEscalationChainById).mockResolvedValue({ ...mockChain, status: 'acknowledged' })
    const result = await advanceEscalation('test-chain-uuid-001')
    expect(result).toBeNull()
  })
})

describe('catchUpMissedSteps', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(updateEscalationChain).mockResolvedValue(undefined)
  })

  it('marks overdue pending steps as escalated', async () => {
    const longAgo = new Date(Date.now() - 25 * 60_000).toISOString() // 25 min ago
    const futureTime = new Date(Date.now() + 60 * 60_000).toISOString()
    const chain: EscalationChain = {
      ...mockChain,
      currentStep: 2,
      steps: mockChain.steps.map((s) => ({
        ...s,
        scheduledAt: (s.stepNumber === 2 || s.stepNumber === 3) ? longAgo : futureTime,
      })),
    }
    vi.mocked(getEscalationChainById).mockResolvedValue(chain)

    const missed = await catchUpMissedSteps('test-chain-uuid-001')
    expect(missed.length).toBeGreaterThanOrEqual(1)
    expect(updateEscalationChain).toHaveBeenCalledOnce()
  })

  it('returns empty array for acknowledged chain', async () => {
    vi.mocked(getEscalationChainById).mockResolvedValue({ ...mockChain, status: 'acknowledged' })
    const missed = await catchUpMissedSteps('test-chain-uuid-001')
    expect(missed).toHaveLength(0)
  })

  it('skips step 1 even if overdue (step 1 is UI-driven)', async () => {
    const longAgo = new Date(Date.now() - 5 * 60_000).toISOString()
    const futureTime = new Date(Date.now() + 60 * 60_000).toISOString()
    const chain: EscalationChain = {
      ...mockChain,
      currentStep: 1,
      steps: mockChain.steps.map((s) => ({
        ...s,
        // Step 1 is overdue; steps 2-5 are in the future (not missed)
        scheduledAt: s.stepNumber === 1 ? longAgo : futureTime,
      })),
    }
    vi.mocked(getEscalationChainById).mockResolvedValue(chain)

    const missed = await catchUpMissedSteps('test-chain-uuid-001')
    expect(missed).toHaveLength(0)
  })
})
