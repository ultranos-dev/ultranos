import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { encryptionKeyStore } from '@/lib/encryption-key-store'
import { setPatientCreditLimit } from '@/lib/pos/patient-account-service'
import type { PatientAccount } from '@/lib/pos/types'

beforeEach(async () => {
  await db.delete(); await db.open()
  if (!encryptionKeyStore.isReady()) {
    encryptionKeyStore.setKey(
      await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
    )
  }
})

describe('setPatientCreditLimit', () => {
  it('updates the creditLimit of an existing account', async () => {
    const account: PatientAccount = {
      id: 'acc-001',
      patientId: 'patient-001',
      balance: 300,
      lastActivityAt: '2026-09-08T00:00:00.000Z',
    }
    await db.patientAccounts.add(account)

    await setPatientCreditLimit('patient-001', 5000)

    const updated = await db.patientAccounts.get('acc-001')
    expect(updated?.creditLimit).toBe(5000)
    expect(updated?.balance).toBe(300) // balance unchanged
  })

  it('updates lastActivityAt when setting the credit limit on existing account', async () => {
    const account: PatientAccount = {
      id: 'acc-001',
      patientId: 'patient-001',
      balance: 0,
      lastActivityAt: '2020-01-01T00:00:00.000Z',
    }
    await db.patientAccounts.add(account)

    const before = new Date('2020-01-01T00:00:00.000Z').getTime()
    await setPatientCreditLimit('patient-001', 2000)

    const updated = await db.patientAccounts.get('acc-001')
    expect(new Date(updated!.lastActivityAt).getTime()).toBeGreaterThan(before)
  })

  it('creates a new account with balance 0 and the given creditLimit when no account exists', async () => {
    await setPatientCreditLimit('patient-new', 8000)

    const accounts = await db.patientAccounts.where('patientId').equals('patient-new').toArray()
    expect(accounts).toHaveLength(1)
    expect(accounts[0]!.balance).toBe(0)
    expect(accounts[0]!.creditLimit).toBe(8000)
    expect(accounts[0]!.id).toBeTruthy()
    expect(accounts[0]!.patientId).toBe('patient-new')
  })

  it('can overwrite an existing creditLimit with a new value', async () => {
    const account: PatientAccount = {
      id: 'acc-002',
      patientId: 'patient-002',
      balance: 100,
      creditLimit: 1000,
      lastActivityAt: '2026-09-08T00:00:00.000Z',
    }
    await db.patientAccounts.add(account)

    await setPatientCreditLimit('patient-002', 3000)

    const updated = await db.patientAccounts.get('acc-002')
    expect(updated?.creditLimit).toBe(3000)
  })
})
