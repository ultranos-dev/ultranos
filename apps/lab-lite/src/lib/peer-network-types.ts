// Peer Network ("Ask a Tech") — Story 46.4
// Store-and-forward peer Q&A for lab technicians in isolated facilities.

export interface PostPhoto {
  id: string
  data: string // base64-encoded JPEG
  mimeType: string
  alt?: string
  caption?: string
}

export interface LabContext {
  testType?: string // LOINC code or free text
  instrument?: string // equipment name
  category?: string // hematology, chemistry, etc.
}

export type PeerPostStatus = 'active' | 'resolved' | 'flagged' | 'removed'
export type SyncStatus = 'pending' | 'synced'

export interface PeerPost {
  id: string // UUID
  authorId: string // technician ID
  authorDisplayName: string // anonymized by default (e.g., "Lab Tech #42")
  labName?: string // only if author opts in
  title: string
  body: string // markdown
  photos: PostPhoto[]
  labContext: LabContext
  tags: string[]
  status: PeerPostStatus
  createdAt: string // ISO 8601
  updatedAt: string
  syncStatus: SyncStatus
  responseCount: number
}

export interface PeerResponse {
  id: string
  postId: string
  authorId: string
  authorDisplayName: string
  body: string // markdown
  photos: PostPhoto[]
  isFromMentor: boolean
  createdAt: string
  syncStatus: SyncStatus
}

export type ModerationReason = 'inappropriate' | 'phi_detected' | 'spam' | 'other'

export interface ModerationFlag {
  id: string
  targetId: string // post or response ID
  targetType: 'post' | 'response'
  flaggedBy: string
  reason: ModerationReason
  details?: string
  createdAt: string
  syncStatus: SyncStatus
}

/**
 * Generate a consistent, non-reversible anonymous display name from a technician ID.
 * Uses a simple hash to produce "Lab Tech #NN" where NN is 10-99.
 * Consistent across posts but not reversible to identity without Hub access.
 */
export function generateAnonymousDisplayName(techId: string): string {
  let hash = 0
  for (let i = 0; i < techId.length; i++) {
    const char = techId.charCodeAt(i)
    hash = ((hash << 5) - hash + char) | 0
  }
  const num = 10 + (Math.abs(hash) % 90) // 10-99
  return `Lab Tech #${num}`
}

/** Lab context category options for the post creation form. */
export const LAB_CATEGORIES = [
  'hematology',
  'chemistry',
  'microbiology',
  'urinalysis',
  'immunology',
  'parasitology',
  'blood_bank',
  'other',
] as const

export type LabCategory = (typeof LAB_CATEGORIES)[number]

/** Maximum number of photos per post/response. */
export const MAX_PHOTOS = 3

/** Maximum photo width after compression (pixels). */
export const MAX_PHOTO_WIDTH = 800

/** Maximum photo file size before compression (bytes): 2 MB. */
export const MAX_PHOTO_SIZE = 2 * 1024 * 1024
