import { getDb } from './db'
import type { PeerPost, PeerResponse } from './peer-network-types'

export interface SearchResult {
  post: PeerPost
  score: number
  hasVerifiedAnswer: boolean
}

/**
 * Full-text search across peer network posts.
 * Relevance ranking: title match (3x) > body match (1x) > tag match (2x).
 * Resolved posts with mentor responses are marked as "Verified Answer".
 */
export async function searchPeerPosts(query: string): Promise<SearchResult[]> {
  if (!query.trim()) return []

  const db = getDb()
  const allPosts = await db.peer_posts
    .filter((p) => p.status !== 'removed')
    .toArray()

  const q = query.toLowerCase().trim()
  const terms = q.split(/\s+/)

  const scored: SearchResult[] = []

  for (const post of allPosts) {
    let score = 0
    const titleLower = post.title.toLowerCase()
    const bodyLower = post.body.toLowerCase()

    for (const term of terms) {
      if (titleLower.includes(term)) score += 3
      if (bodyLower.includes(term)) score += 1
      if (post.tags.some((tag) => tag.includes(term))) score += 2
    }

    if (score === 0) continue

    // Boost resolved posts
    if (post.status === 'resolved') score += 1

    // Check for mentor-verified answers
    let hasVerifiedAnswer = false
    if (post.status === 'resolved' && post.responseCount > 0) {
      const mentorResponses = await db.peer_responses
        .where('postId')
        .equals(post.id)
        .filter((r) => r.isFromMentor)
        .count()
      hasVerifiedAnswer = mentorResponses > 0
    }

    // Boost posts with verified answers
    if (hasVerifiedAnswer) score += 2

    scored.push({ post, score, hasVerifiedAnswer })
  }

  // Sort by score descending, then by createdAt descending
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return new Date(b.post.createdAt).getTime() - new Date(a.post.createdAt).getTime()
  })

  return scored
}
