import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { getDb } from '../lib/db'
import { searchPeerPosts } from '../lib/peer-network-search'
import type { PeerPost, PeerResponse } from '../lib/peer-network-types'

function makePost(overrides: Partial<PeerPost> = {}): PeerPost {
  return {
    id: crypto.randomUUID(),
    authorId: 'tech-001',
    authorDisplayName: 'Lab Tech #42',
    title: 'Default title',
    body: 'Default body text.',
    photos: [],
    labContext: {},
    tags: [],
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    syncStatus: 'synced',
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
    body: 'A helpful response.',
    photos: [],
    isFromMentor: false,
    createdAt: new Date().toISOString(),
    syncStatus: 'synced',
    ...overrides,
  }
}

describe('Peer Network — Search', () => {
  beforeEach(async () => {
    const db = getDb()
    await db.delete()
    await db.open()
  })

  it('returns empty array for empty query', async () => {
    const results = await searchPeerPosts('')
    expect(results).toEqual([])
  })

  it('returns empty array when no posts match', async () => {
    const db = getDb()
    await db.peer_posts.put(makePost({ title: 'About reagents' }))
    const results = await searchPeerPosts('microscope')
    expect(results).toHaveLength(0)
  })

  it('title match scores higher than body match', async () => {
    const db = getDb()
    const titleMatchPost = makePost({ id: 'p1', title: 'Reagent problem', body: 'Some body text' })
    const bodyMatchPost = makePost({ id: 'p2', title: 'Other issue', body: 'The reagent turned cloudy' })
    await db.peer_posts.bulkPut([titleMatchPost, bodyMatchPost])

    const results = await searchPeerPosts('reagent')
    expect(results).toHaveLength(2)
    // Title match (3 points) should rank higher than body match (1 point)
    expect(results[0].post.id).toBe('p1')
    expect(results[0].score).toBeGreaterThan(results[1].score)
  })

  it('tag match scores higher than body match', async () => {
    const db = getDb()
    const tagMatchPost = makePost({ id: 'p1', title: 'Issue', body: 'Some text', tags: ['analyzer'] })
    const bodyMatchPost = makePost({ id: 'p2', title: 'Issue', body: 'The analyzer is broken' })
    await db.peer_posts.bulkPut([tagMatchPost, bodyMatchPost])

    const results = await searchPeerPosts('analyzer')
    expect(results).toHaveLength(2)
    // Tag match (2 points) > body match (1 point)
    expect(results[0].post.id).toBe('p1')
  })

  it('resolved posts get a boost', async () => {
    const db = getDb()
    const activePost = makePost({ id: 'p1', title: 'CBC problem', status: 'active' })
    const resolvedPost = makePost({ id: 'p2', title: 'CBC issue', status: 'resolved' })
    await db.peer_posts.bulkPut([activePost, resolvedPost])

    const results = await searchPeerPosts('CBC')
    expect(results).toHaveLength(2)
    // Resolved post gets +1 bonus, and title match is 3 for both
    // resolved post: 3 (title) + 1 (resolved) = 4
    // active post: 3 (title) = 3
    expect(results[0].post.id).toBe('p2')
  })

  it('marks posts with mentor responses as verified answers', async () => {
    const db = getDb()
    const postId = 'verified-post'
    const post = makePost({
      id: postId,
      title: 'Staining question',
      status: 'resolved',
      responseCount: 1,
    })
    await db.peer_posts.put(post)
    await db.peer_responses.put(
      makeResponse({ postId, isFromMentor: true }),
    )

    const results = await searchPeerPosts('staining')
    expect(results).toHaveLength(1)
    expect(results[0].hasVerifiedAnswer).toBe(true)
  })

  it('does not mark posts without mentor responses as verified', async () => {
    const db = getDb()
    const postId = 'unverified-post'
    const post = makePost({
      id: postId,
      title: 'Staining question',
      status: 'resolved',
      responseCount: 1,
    })
    await db.peer_posts.put(post)
    await db.peer_responses.put(
      makeResponse({ postId, isFromMentor: false }),
    )

    const results = await searchPeerPosts('staining')
    expect(results).toHaveLength(1)
    expect(results[0].hasVerifiedAnswer).toBe(false)
  })

  it('excludes removed posts from results', async () => {
    const db = getDb()
    await db.peer_posts.bulkPut([
      makePost({ title: 'Visible post about reagents', status: 'active' }),
      makePost({ title: 'Removed post about reagents', status: 'removed' }),
    ])

    const results = await searchPeerPosts('reagents')
    expect(results).toHaveLength(1)
    expect(results[0].post.status).toBe('active')
  })

  it('multi-word search matches all terms', async () => {
    const db = getDb()
    await db.peer_posts.bulkPut([
      makePost({ id: 'p1', title: 'White precipitate in CBC reagent', body: 'Details here' }),
      makePost({ id: 'p2', title: 'CBC results question', body: 'No precipitate' }),
      makePost({ id: 'p3', title: 'Reagent storage', body: 'How to store reagents' }),
    ])

    const results = await searchPeerPosts('precipitate reagent')
    // p1 matches both words in title: 3+3 = 6
    // p2 matches one in title, one in body: 3+1 = 4
    // p3 matches one in title: 3
    expect(results.length).toBeGreaterThanOrEqual(2)
    expect(results[0].post.id).toBe('p1')
  })
})
