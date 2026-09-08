import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'

beforeEach(async () => { await db.delete(); await db.open() })

describe('wholesalePullMeta table', () => {
  it('round-trips a pull watermark', async () => {
    await db.wholesalePullMeta.put({ key: 'wholesale', lastPulledHlc: '42' })
    expect(await db.wholesalePullMeta.get('wholesale')).toEqual({ key: 'wholesale', lastPulledHlc: '42' })
  })
})
