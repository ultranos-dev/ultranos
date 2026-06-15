import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { getDb } from '../lib/db'
import {
  generateAnonymousDisplayName,
  LAB_CATEGORIES,
  MAX_PHOTOS,
  MAX_PHOTO_WIDTH,
  MAX_PHOTO_SIZE,
} from '../lib/peer-network-types'
import type {
  PeerPost,
  PeerResponse,
  ModerationFlag,
} from '../lib/peer-network-types'

function makePost(overrides: Partial<PeerPost> = {}): PeerPost {
  return {
    id: crypto.randomUUID(),
    authorId: 'tech-001',
    authorDisplayName: 'Lab Tech #42',
    title: 'Unknown precipitate in reagent',
    body: 'I am seeing a white precipitate in my CBC reagent bottle.',
    photos: [],
    labContext: { category: 'hematology' },
    tags: ['reagent', 'precipitate'],
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    syncStatus: 'pending',
    responseCount: 0,
    ...overrides,
  }
}

function makeResponse(overrides: Partial<PeerResponse> = {}): PeerResponse {
  return {
    id: crypto.randomUUID(),
    postId: 'post-001',
    authorId: 'tech-002',
    authorDisplayName: 'Lab Tech #55',
    body: 'That could be protein precipitation from heat exposure.',
    photos: [],
    isFromMentor: false,
    createdAt: new Date().toISOString(),
    syncStatus: 'pending',
    ...overrides,
  }
}

function makeFlag(overrides: Partial<ModerationFlag> = {}): ModerationFlag {
  return {
    id: crypto.randomUUID(),
    targetId: 'post-001',
    targetType: 'post',
    flaggedBy: 'tech-003',
    reason: 'inappropriate',
    createdAt: new Date().toISOString(),
    syncStatus: 'pending',
    ...overrides,
  }
}

describe('Peer Network — Data Model & Types', () => {
  it('generateAnonymousDisplayName produces consistent output', () => {
    const name1 = generateAnonymousDisplayName('tech-001')
    const name2 = generateAnonymousDisplayName('tech-001')
    expect(name1).toBe(name2)
    expect(name1).toMatch(/^Lab Tech #\d{2}$/)
  })

  it('generateAnonymousDisplayName produces different names for different IDs', () => {
    const name1 = generateAnonymousDisplayName('tech-001')
    const name2 = generateAnonymousDisplayName('tech-999')
    // Could theoretically collide, but overwhelmingly unlikely for these inputs
    expect(name1).not.toBe(name2)
  })

  it('generateAnonymousDisplayName number is always 10-99', () => {
    const ids = Array.from({ length: 100 }, (_, i) => `tech-${i}`)
    for (const id of ids) {
      const name = generateAnonymousDisplayName(id)
      const num = parseInt(name.replace('Lab Tech #', ''), 10)
      expect(num).toBeGreaterThanOrEqual(10)
      expect(num).toBeLessThanOrEqual(99)
    }
  })

  it('LAB_CATEGORIES includes expected values', () => {
    expect(LAB_CATEGORIES).toContain('hematology')
    expect(LAB_CATEGORIES).toContain('chemistry')
    expect(LAB_CATEGORIES).toContain('microbiology')
    expect(LAB_CATEGORIES.length).toBeGreaterThanOrEqual(7)
  })

  it('constants have correct values', () => {
    expect(MAX_PHOTOS).toBe(3)
    expect(MAX_PHOTO_WIDTH).toBe(800)
    expect(MAX_PHOTO_SIZE).toBe(2 * 1024 * 1024)
  })
})

describe('Peer Network — Dexie Schema', () => {
  beforeEach(async () => {
    const db = getDb()
    await db.delete()
    await db.open()
  })

  it('peer_posts table exists and supports CRUD', async () => {
    const db = getDb()
    const post = makePost()
    await db.peer_posts.put(post)
    const fetched = await db.peer_posts.get(post.id)
    expect(fetched).toBeDefined()
    expect(fetched!.title).toBe(post.title)
    expect(fetched!.authorDisplayName).toBe('Lab Tech #42')
  })

  it('peer_posts supports querying by status', async () => {
    const db = getDb()
    await db.peer_posts.bulkPut([
      makePost({ status: 'active' }),
      makePost({ status: 'resolved' }),
      makePost({ status: 'active' }),
    ])
    const active = await db.peer_posts.where('status').equals('active').toArray()
    expect(active).toHaveLength(2)
  })

  it('peer_posts supports querying by syncStatus', async () => {
    const db = getDb()
    await db.peer_posts.bulkPut([
      makePost({ syncStatus: 'pending' }),
      makePost({ syncStatus: 'synced' }),
    ])
    const pending = await db.peer_posts.where('syncStatus').equals('pending').toArray()
    expect(pending).toHaveLength(1)
  })

  it('peer_posts supports multi-entry tags index', async () => {
    const db = getDb()
    await db.peer_posts.put(makePost({ tags: ['reagent', 'hematology'] }))
    await db.peer_posts.put(makePost({ tags: ['analyzer', 'chemistry'] }))
    const reagentPosts = await db.peer_posts.where('tags').equals('reagent').toArray()
    expect(reagentPosts).toHaveLength(1)
  })

  it('peer_responses table exists and supports CRUD', async () => {
    const db = getDb()
    const response = makeResponse()
    await db.peer_responses.put(response)
    const fetched = await db.peer_responses.get(response.id)
    expect(fetched).toBeDefined()
    expect(fetched!.body).toBe(response.body)
  })

  it('peer_responses supports querying by postId', async () => {
    const db = getDb()
    await db.peer_responses.bulkPut([
      makeResponse({ postId: 'post-001' }),
      makeResponse({ postId: 'post-001' }),
      makeResponse({ postId: 'post-002' }),
    ])
    const responses = await db.peer_responses.where('postId').equals('post-001').toArray()
    expect(responses).toHaveLength(2)
  })

  it('moderation_flags table exists and supports CRUD', async () => {
    const db = getDb()
    const flag = makeFlag()
    await db.moderation_flags.put(flag)
    const fetched = await db.moderation_flags.get(flag.id)
    expect(fetched).toBeDefined()
    expect(fetched!.reason).toBe('inappropriate')
  })

  it('moderation_flags supports querying by targetId', async () => {
    const db = getDb()
    await db.moderation_flags.bulkPut([
      makeFlag({ targetId: 'post-001' }),
      makeFlag({ targetId: 'post-002' }),
    ])
    const flags = await db.moderation_flags.where('targetId').equals('post-001').toArray()
    expect(flags).toHaveLength(1)
  })

  it('moderation_flags supports querying by targetType', async () => {
    const db = getDb()
    await db.moderation_flags.bulkPut([
      makeFlag({ targetType: 'post' }),
      makeFlag({ targetType: 'response' }),
      makeFlag({ targetType: 'post' }),
    ])
    const postFlags = await db.moderation_flags.where('targetType').equals('post').toArray()
    expect(postFlags).toHaveLength(2)
  })

  it('post anonymization defaults to anonymous display name', () => {
    const post = makePost({ authorId: 'tech-abc-123' })
    // Verify the post has no labName by default
    expect(post.labName).toBeUndefined()
    // Verify display name is not the actual ID
    expect(post.authorDisplayName).not.toBe(post.authorId)
  })

  it('post can opt-in to reveal lab name', () => {
    const post = makePost({ labName: 'Kabul Central Lab' })
    expect(post.labName).toBe('Kabul Central Lab')
  })

  it('moderation status transitions work correctly', async () => {
    const db = getDb()
    const post = makePost({ status: 'active' })
    await db.peer_posts.put(post)

    // Flag the post
    await db.peer_posts.update(post.id, { status: 'flagged' })
    const flagged = await db.peer_posts.get(post.id)
    expect(flagged!.status).toBe('flagged')

    // Remove the post
    await db.peer_posts.update(post.id, { status: 'removed' })
    const removed = await db.peer_posts.get(post.id)
    expect(removed!.status).toBe('removed')
  })
})
