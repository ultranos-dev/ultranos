'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { getDb } from '@/lib/db'
import type { PeerPost, PeerPostStatus } from '@/lib/peer-network-types'

interface PostFeedProps {
  onSelectPost: (post: PeerPost) => void
  onCreatePost: () => void
  searchQuery?: string
}

type FilterStatus = 'all' | PeerPostStatus

export function PostFeed({ onSelectPost, onCreatePost, searchQuery }: PostFeedProps) {
  const t = useTranslations('peerNetwork')
  const [posts, setPosts] = useState<PeerPost[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterTag, setFilterTag] = useState('')

  const loadPosts = useCallback(async () => {
    try {
      const db = getDb()
      let query = db.peer_posts.orderBy('createdAt').reverse()
      const allPosts = await query.toArray()
      // Filter out removed posts from the feed
      setPosts(allPosts.filter((p) => p.status !== 'removed'))
    } catch {
      // Dexie unavailable
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadPosts()
  }, [loadPosts])

  const filteredPosts = useMemo(() => {
    let result = posts

    if (filterStatus !== 'all') {
      result = result.filter((p) => p.status === filterStatus)
    }

    if (filterCategory) {
      result = result.filter((p) => p.labContext.category === filterCategory)
    }

    if (filterTag) {
      const tagLower = filterTag.toLowerCase()
      result = result.filter((p) =>
        p.tags.some((tag) => tag.includes(tagLower)),
      )
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.body.toLowerCase().includes(q) ||
          p.tags.some((tag) => tag.includes(q)),
      )
    }

    return result
  }, [posts, filterStatus, filterCategory, filterTag, searchQuery])

  if (loading) {
    return <p className="py-8 text-center text-sm text-muted-foreground">{t('loading')}</p>
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as FilterStatus)}
          className="rounded-lg border border-border px-3 py-1.5 text-sm"
          aria-label={t('filterByStatus')}
        >
          <option value="all">{t('statusAll')}</option>
          <option value="active">{t('statusActive')}</option>
          <option value="resolved">{t('statusResolved')}</option>
          <option value="flagged">{t('statusFlagged')}</option>
        </select>
        <input
          type="text"
          value={filterTag}
          onChange={(e) => setFilterTag(e.target.value)}
          placeholder={t('filterByTag')}
          className="rounded-lg border border-border px-3 py-1.5 text-sm"
        />
        <button
          type="button"
          onClick={onCreatePost}
          className="ms-auto rounded-lg bg-primary-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-primary-700"
        >
          {t('askQuestion')}
        </button>
      </div>

      {/* Post list */}
      {filteredPosts.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-sm text-muted-foreground">{t('noPosts')}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filteredPosts.map((post) => (
            <PostCard key={post.id} post={post} onClick={() => onSelectPost(post)} />
          ))}
        </div>
      )}
    </div>
  )
}

function PostCard({ post, onClick }: { post: PeerPost; onClick: () => void }) {
  const t = useTranslations('peerNetwork')

  const previewText = post.body.length > 150 ? post.body.slice(0, 150) + '...' : post.body

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-lg border border-border p-4 text-start hover:border-primary-300 hover:bg-muted/30"
    >
      <div className="flex items-start gap-3">
        {/* Photo thumbnail */}
        {post.photos.length > 0 && (
          <img
            src={`data:${post.photos[0].mimeType};base64,${post.photos[0].data}`}
            alt=""
            className="h-14 w-14 flex-shrink-0 rounded-lg object-cover"
          />
        )}

        <div className="min-w-0 flex-1">
          {/* Title + status */}
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-foreground">{post.title}</h3>
            {post.status === 'resolved' && (
              <span className="flex-shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                {t('resolved')}
              </span>
            )}
            {post.status === 'flagged' && (
              <span className="flex-shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                {t('flagged')}
              </span>
            )}
          </div>

          {/* Preview text */}
          <p className="mt-1 text-xs text-muted-foreground">{previewText}</p>

          {/* Meta row */}
          <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
            <span>{post.authorDisplayName}</span>
            <span>{new Date(post.createdAt).toLocaleDateString()}</span>
            {post.responseCount > 0 && (
              <span>
                {t('responseCount', { count: post.responseCount })}
              </span>
            )}
            {post.labContext.category && (
              <span className="rounded bg-muted px-1.5 py-0.5">
                {t(`categories.${post.labContext.category}`)}
              </span>
            )}
          </div>

          {/* Tags */}
          {post.tags.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {post.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-primary-50 px-2 py-0.5 text-xs text-primary-700"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </button>
  )
}
