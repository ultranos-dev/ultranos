'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { getDb } from '@/lib/db'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import type { PeerPost, PeerResponse } from '@/lib/peer-network-types'
import { ResponseForm } from './ResponseForm'
import { FlagButton } from './FlagButton'

interface PostDetailProps {
  post: PeerPost
  onBack: () => void
  onPostUpdated?: (post: PeerPost) => void
}

export function PostDetail({ post, onBack, onPostUpdated }: PostDetailProps) {
  const t = useTranslations('peerNetwork')
  const session = useAuthSessionStore((s) => s.session)
  const [responses, setResponses] = useState<PeerResponse[]>([])
  const [showResponseForm, setShowResponseForm] = useState(false)
  const [currentPost, setCurrentPost] = useState(post)

  const loadResponses = useCallback(async () => {
    try {
      const db = getDb()
      const items = await db.peer_responses
        .where('postId')
        .equals(post.id)
        .sortBy('createdAt')
      setResponses(items)
    } catch {
      // Dexie unavailable
    }
  }, [post.id])

  useEffect(() => {
    loadResponses()
  }, [loadResponses])

  const handleResponseCreated = useCallback(async () => {
    setShowResponseForm(false)
    await loadResponses()

    // Update response count
    const db = getDb()
    const count = await db.peer_responses.where('postId').equals(post.id).count()
    await db.peer_posts.update(post.id, {
      responseCount: count,
      updatedAt: new Date().toISOString(),
    })
    const updated = await db.peer_posts.get(post.id)
    if (updated) {
      setCurrentPost(updated)
      onPostUpdated?.(updated)
    }
  }, [post.id, loadResponses, onPostUpdated])

  const handleMarkResolved = useCallback(async () => {
    const db = getDb()
    await db.peer_posts.update(post.id, {
      status: 'resolved',
      updatedAt: new Date().toISOString(),
      syncStatus: 'pending',
    })
    const updated = await db.peer_posts.get(post.id)
    if (updated) {
      setCurrentPost(updated)
      onPostUpdated?.(updated)
    }
  }, [post.id, onPostUpdated])

  const isAuthor = session?.practitionerId === currentPost.authorId ||
    session?.userId === currentPost.authorId

  return (
    <div className="flex flex-col gap-4">
      {/* Back button */}
      <button
        type="button"
        onClick={onBack}
        className="self-start text-sm text-primary-600 hover:text-primary-700"
      >
        &larr; {t('backToFeed')}
      </button>

      {/* Post content */}
      <article className="rounded-lg border border-neutral-200 p-4">
        {/* Flagged warning overlay */}
        {currentPost.status === 'flagged' && (
          <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-2 text-sm text-amber-700">
            {t('flaggedWarning')}
          </div>
        )}

        <div className="flex items-start justify-between gap-2">
          <h2 className="text-lg font-semibold text-neutral-900">{currentPost.title}</h2>
          <div className="flex items-center gap-2">
            {currentPost.status === 'resolved' && (
              <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                {t('resolved')}
              </span>
            )}
            <FlagButton targetId={currentPost.id} targetType="post" />
          </div>
        </div>

        {/* Author + time */}
        <div className="mt-1 flex items-center gap-3 text-xs text-neutral-500">
          <span>{currentPost.authorDisplayName}</span>
          {currentPost.labName && (
            <span className="rounded bg-neutral-100 px-1.5 py-0.5">{currentPost.labName}</span>
          )}
          <span>{new Date(currentPost.createdAt).toLocaleString()}</span>
        </div>

        {/* Body */}
        <div className="mt-3 whitespace-pre-wrap text-sm text-neutral-800">
          {currentPost.body}
        </div>

        {/* Photos */}
        {currentPost.photos.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {currentPost.photos.map((photo) => (
              <img
                key={photo.id}
                src={`data:${photo.mimeType};base64,${photo.data}`}
                alt={photo.alt || photo.caption || t('photoAlt')}
                className="max-h-60 rounded-lg object-contain"
              />
            ))}
          </div>
        )}

        {/* Lab context */}
        {(currentPost.labContext.category || currentPost.labContext.testType || currentPost.labContext.instrument) && (
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-neutral-500">
            {currentPost.labContext.category && (
              <span className="rounded bg-neutral-100 px-2 py-0.5">
                {t(`categories.${currentPost.labContext.category}`)}
              </span>
            )}
            {currentPost.labContext.testType && (
              <span className="rounded bg-neutral-100 px-2 py-0.5">
                {currentPost.labContext.testType}
              </span>
            )}
            {currentPost.labContext.instrument && (
              <span className="rounded bg-neutral-100 px-2 py-0.5">
                {currentPost.labContext.instrument}
              </span>
            )}
          </div>
        )}

        {/* Tags */}
        {currentPost.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {currentPost.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-primary-50 px-2 py-0.5 text-xs text-primary-700"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Resolve button (author only) */}
        {isAuthor && currentPost.status === 'active' && (
          <button
            type="button"
            onClick={handleMarkResolved}
            className="mt-3 rounded-lg border border-green-300 px-4 py-1.5 text-sm font-medium text-green-700 hover:bg-green-50"
          >
            {t('markResolved')}
          </button>
        )}
      </article>

      {/* Responses */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-neutral-700">
            {t('responses')} ({responses.length})
          </h3>
          {!showResponseForm && (
            <button
              type="button"
              onClick={() => setShowResponseForm(true)}
              className="rounded-lg bg-primary-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-primary-700"
            >
              {t('addResponse')}
            </button>
          )}
        </div>

        {/* Response form */}
        {showResponseForm && (
          <ResponseForm
            postId={post.id}
            onResponseCreated={handleResponseCreated}
            onCancel={() => setShowResponseForm(false)}
          />
        )}

        {/* Response list */}
        {responses.length === 0 ? (
          <p className="py-4 text-center text-sm text-neutral-500">{t('noResponses')}</p>
        ) : (
          responses.map((response) => (
            <ResponseCard key={response.id} response={response} />
          ))
        )}
      </div>
    </div>
  )
}

function ResponseCard({ response }: { response: PeerResponse }) {
  const t = useTranslations('peerNetwork')

  return (
    <div
      className={`rounded-lg border p-3 ${
        response.isFromMentor
          ? 'border-primary-200 bg-primary-50'
          : 'border-neutral-200'
      }`}
    >
      <div className="flex items-center gap-2 text-xs text-neutral-500">
        <span className="font-medium text-neutral-700">{response.authorDisplayName}</span>
        {response.isFromMentor && (
          <span className="rounded-full bg-primary-200 px-2 py-0.5 text-xs font-medium text-primary-800">
            {t('mentor')}
          </span>
        )}
        <span>{new Date(response.createdAt).toLocaleString()}</span>
        <div className="ms-auto">
          <FlagButton targetId={response.id} targetType="response" />
        </div>
      </div>

      <div className="mt-2 whitespace-pre-wrap text-sm text-neutral-800">
        {response.body}
      </div>

      {response.photos.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {response.photos.map((photo) => (
            <img
              key={photo.id}
              src={`data:${photo.mimeType};base64,${photo.data}`}
              alt={photo.alt || t('photoAlt')}
              className="max-h-40 rounded-lg object-contain"
            />
          ))}
        </div>
      )}
    </div>
  )
}
