import { getDb } from './db'
import type { PeerPost, PeerResponse, ModerationFlag } from './peer-network-types'

function getHubApiUrl(): string {
  if (typeof window !== 'undefined') {
    return process.env.NEXT_PUBLIC_HUB_API_URL ?? 'http://localhost:3000/api/trpc'
  }
  return process.env.HUB_API_URL ?? 'http://localhost:3000/api/trpc'
}

/**
 * Sync peer network data with the Hub.
 * Push locally created posts, responses, and flags with syncStatus: 'pending'.
 * Pull new/updated content from the Hub.
 * Pull moderation decisions (flagged/removed status updates).
 *
 * Designed for store-and-forward: all content is fully usable locally before sync.
 */
export async function syncPeerNetwork(token: string): Promise<{
  pushed: { posts: number; responses: number; flags: number }
  pulled: { posts: number; responses: number }
}> {
  const db = getDb()
  const result = {
    pushed: { posts: 0, responses: 0, flags: 0 },
    pulled: { posts: 0, responses: 0 },
  }

  // --- PUSH PHASE ---

  // Push pending posts
  const pendingPosts = await db.peer_posts
    .where('syncStatus')
    .equals('pending')
    .toArray()

  if (pendingPosts.length > 0) {
    try {
      const res = await fetch(`${getHubApiUrl()}/peerNetwork.pushPosts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ posts: pendingPosts }),
      })
      if (res.ok) {
        for (const post of pendingPosts) {
          await db.peer_posts.update(post.id, { syncStatus: 'synced' })
        }
        result.pushed.posts = pendingPosts.length
      }
    } catch {
      // Network unavailable — items stay pending for next sync cycle
    }
  }

  // Push pending responses
  const pendingResponses = await db.peer_responses
    .where('syncStatus')
    .equals('pending')
    .toArray()

  if (pendingResponses.length > 0) {
    try {
      const res = await fetch(`${getHubApiUrl()}/peerNetwork.pushResponses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ responses: pendingResponses }),
      })
      if (res.ok) {
        for (const response of pendingResponses) {
          await db.peer_responses.update(response.id, { syncStatus: 'synced' })
        }
        result.pushed.responses = pendingResponses.length
      }
    } catch {
      // Network unavailable
    }
  }

  // Push pending moderation flags
  const pendingFlags = await db.moderation_flags
    .where('syncStatus')
    .equals('pending')
    .toArray()

  if (pendingFlags.length > 0) {
    try {
      const res = await fetch(`${getHubApiUrl()}/peerNetwork.pushFlags`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ flags: pendingFlags }),
      })
      if (res.ok) {
        for (const flag of pendingFlags) {
          await db.moderation_flags.update(flag.id, { syncStatus: 'synced' })
        }
        result.pushed.flags = pendingFlags.length
      }
    } catch {
      // Network unavailable
    }
  }

  // --- PULL PHASE ---

  // Pull new/updated posts from Hub
  try {
    const lastSyncedPost = await db.peer_posts
      .orderBy('updatedAt')
      .reverse()
      .first()
    const since = lastSyncedPost?.updatedAt || '1970-01-01T00:00:00.000Z'

    const res = await fetch(
      `${getHubApiUrl()}/peerNetwork.pullPosts?input=${encodeURIComponent(JSON.stringify({ since }))}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    )
    if (res.ok) {
      const data = await res.json()
      const posts: PeerPost[] = data?.result?.data ?? []
      for (const post of posts) {
        await db.peer_posts.put({ ...post, syncStatus: 'synced' as const })
      }
      result.pulled.posts = posts.length
    }
  } catch {
    // Network unavailable
  }

  // Pull new/updated responses from Hub
  try {
    const lastSyncedResponse = await db.peer_responses
      .orderBy('createdAt')
      .reverse()
      .first()
    const since = lastSyncedResponse?.createdAt || '1970-01-01T00:00:00.000Z'

    const res = await fetch(
      `${getHubApiUrl()}/peerNetwork.pullResponses?input=${encodeURIComponent(JSON.stringify({ since }))}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    )
    if (res.ok) {
      const data = await res.json()
      const responses: PeerResponse[] = data?.result?.data ?? []
      for (const response of responses) {
        await db.peer_responses.put({ ...response, syncStatus: 'synced' as const })
      }
      result.pulled.responses = responses.length
    }
  } catch {
    // Network unavailable
  }

  return result
}
