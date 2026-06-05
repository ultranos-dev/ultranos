'use client'

import { useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { AuthGuard } from '@/components/AuthGuard'
import { PostFeed } from '@/components/peer-network/PostFeed'
import { PostDetail } from '@/components/peer-network/PostDetail'
import { CreatePostForm } from '@/components/peer-network/CreatePostForm'
import { searchPeerPosts, type SearchResult } from '@/lib/peer-network-search'
import type { PeerPost } from '@/lib/peer-network-types'

type View = 'feed' | 'detail' | 'create' | 'search'

function PeerNetworkContent() {
  const t = useTranslations('peerNetwork')
  const [view, setView] = useState<View>('feed')
  const [selectedPost, setSelectedPost] = useState<PeerPost | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)

  const handleSelectPost = useCallback((post: PeerPost) => {
    setSelectedPost(post)
    setView('detail')
  }, [])

  const handleSearch = useCallback(async (query: string) => {
    setSearchQuery(query)
    if (!query.trim()) {
      setSearchResults([])
      setView('feed')
      return
    }
    setSearching(true)
    try {
      const results = await searchPeerPosts(query)
      setSearchResults(results)
      setView('search')
    } catch {
      // Search failed
    } finally {
      setSearching(false)
    }
  }, [])

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">{t('pageTitle')}</h1>
      </div>

      {/* Search bar */}
      <div className="flex gap-2">
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value)
            if (!e.target.value.trim()) {
              setView('feed')
              setSearchResults([])
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSearch(searchQuery)
          }}
          placeholder={t('searchPlaceholder')}
          className="flex-1 rounded-lg border border-border px-4 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
          aria-label={t('searchPlaceholder')}
        />
        <button
          type="button"
          onClick={() => handleSearch(searchQuery)}
          disabled={searching}
          className="rounded-lg bg-muted px-4 py-2 text-sm text-foreground hover:bg-muted disabled:opacity-50"
        >
          {searching ? t('searching') : t('search')}
        </button>
      </div>

      {/* Views */}
      {view === 'feed' && (
        <PostFeed
          onSelectPost={handleSelectPost}
          onCreatePost={() => setView('create')}
          searchQuery={searchQuery}
        />
      )}

      {view === 'detail' && selectedPost && (
        <PostDetail
          post={selectedPost}
          onBack={() => {
            setView(searchResults.length > 0 ? 'search' : 'feed')
            setSelectedPost(null)
          }}
          onPostUpdated={(updated) => setSelectedPost(updated)}
        />
      )}

      {view === 'create' && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-4 text-lg font-semibold text-foreground">{t('createPost')}</h2>
          <CreatePostForm
            onPostCreated={() => setView('feed')}
            onCancel={() => setView('feed')}
          />
        </div>
      )}

      {view === 'search' && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            {t('searchResultsCount', { count: searchResults.length })}
          </p>
          {searchResults.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t('noSearchResults')}</p>
          ) : (
            searchResults.map(({ post, hasVerifiedAnswer }) => (
              <button
                key={post.id}
                type="button"
                onClick={() => handleSelectPost(post)}
                className="w-full rounded-lg border border-border p-3 text-start hover:border-primary-300 hover:bg-muted/30"
              >
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-foreground">{post.title}</h3>
                  {hasVerifiedAnswer && (
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                      {t('verifiedAnswer')}
                    </span>
                  )}
                  {post.status === 'resolved' && !hasVerifiedAnswer && (
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                      {t('resolved')}
                    </span>
                  )}
                </div>
                <p className="mt-1 truncate text-xs text-muted-foreground">{post.body}</p>
                <div className="mt-1 text-xs text-muted-foreground">
                  {post.authorDisplayName} &middot; {new Date(post.createdAt).toLocaleDateString()}
                  {post.responseCount > 0 && ` \u00B7 ${t('responseCount', { count: post.responseCount })}`}
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

export default function PeerNetworkPage() {
  return (
    <AuthGuard>
      <PeerNetworkContent />
    </AuthGuard>
  )
}
