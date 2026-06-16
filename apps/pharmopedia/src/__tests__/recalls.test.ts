import { describe, it, expect } from 'vitest'
import { getActiveRecalls } from '@/db/recalls'

function fakeDb(rows: Array<{ atc_code: string; inn_name: string; tier3_json: string | null }>) {
  return { getAllAsync: async () => rows } as unknown as Parameters<typeof getActiveRecalls>[0]
}

const recalled = {
  atc_code: 'A02BC01', inn_name: 'Omeprazole',
  tier3_json: JSON.stringify({ recallAlerts: [{ recallId: 'r1', description: 'Impurity found', initiationDate: '2026-05-01', status: 'active' }] }),
}
const completed = {
  atc_code: 'N02BE01', inn_name: 'Paracetamol',
  tier3_json: JSON.stringify({ recallAlerts: [{ recallId: 'r2', description: 'Old recall', initiationDate: '2025-01-01', status: 'completed' }] }),
}

describe('getActiveRecalls', () => {
  it('returns [] for non-pharmacist roles', async () => {
    expect(await getActiveRecalls(fakeDb([recalled]), 'DOCTOR')).toEqual([])
    expect(await getActiveRecalls(fakeDb([recalled]), 'PATIENT')).toEqual([])
  })

  it('returns active recalls for pharmacist', async () => {
    const out = await getActiveRecalls(fakeDb([recalled, completed]), 'PHARMACIST')
    expect(out).toEqual([{ atcCode: 'A02BC01', innName: 'Omeprazole', description: 'Impurity found' }])
  })

  it('works for admin too', async () => {
    const out = await getActiveRecalls(fakeDb([recalled]), 'ADMIN')
    expect(out).toHaveLength(1)
  })

  it('skips malformed tier3 json', async () => {
    const bad = { atc_code: 'X', inn_name: 'X', tier3_json: '{not json' }
    const out = await getActiveRecalls(fakeDb([bad, recalled]), 'PHARMACIST')
    expect(out).toHaveLength(1)
  })

  it('respects the limit', async () => {
    const many = Array.from({ length: 8 }, (_, i) => ({
      atc_code: `C${i}`, inn_name: `Drug${i}`,
      tier3_json: JSON.stringify({ recallAlerts: [{ recallId: `r${i}`, description: `d${i}`, initiationDate: `2026-0${(i % 9) + 1}-01`, status: 'active' }] }),
    }))
    expect(await getActiveRecalls(fakeDb(many), 'PHARMACIST', 3)).toHaveLength(3)
  })
})
