'use client'

import { useCallback, useState } from 'react'
import { useTranslations } from 'next-intl'
import { ChevronLeft } from '@ultranos/ui-kit/icons'
import type { SOP } from '@/lib/sop-types'
import { addSOPAcknowledgment } from '@/lib/db'

interface SOPDetailViewProps {
  sop: SOP
  technicianId: string
  isAcknowledged: boolean
  onBack: () => void
  onAcknowledged: () => void
}

/**
 * Minimal markdown renderer for SOP content.
 * Handles headings, bold, italic, lists, code blocks, and embedded images.
 * Keeps bundle size minimal — no external markdown library.
 */
function renderMarkdown(content: string, images: SOP['images']): string {
  // Build image lookup: ![alt](image:id) → base64 <img>
  const imageMap = new Map(images.map((img) => [img.id, img]))

  let html = content
    // Escape HTML entities
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // Code blocks (``` ... ```)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, _lang, code) => {
    return `<pre class="bg-muted rounded p-3 overflow-x-auto text-sm my-3"><code>${code.trim()}</code></pre>`
  })

  // Headings
  html = html.replace(/^#### (.+)$/gm, '<h4 class="text-base font-semibold mt-4 mb-2">$1</h4>')
  html = html.replace(/^### (.+)$/gm, '<h3 class="text-lg font-semibold mt-5 mb-2">$1</h3>')
  html = html.replace(/^## (.+)$/gm, '<h2 class="text-xl font-bold mt-6 mb-3">$1</h2>')
  html = html.replace(/^# (.+)$/gm, '<h1 class="text-2xl font-bold mt-6 mb-3">$1</h1>')

  // Bold and italic
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code class="bg-muted rounded px-1 py-0.5 text-sm">$1</code>')

  // Image references: ![alt](image:id)
  html = html.replace(/!\[([^\]]*)\]\(image:([^)]+)\)/g, (_m, alt, id) => {
    const img = imageMap.get(id)
    if (!img) return `<span class="text-muted-foreground">[${alt}]</span>`
    return `<img src="data:${img.mimeType};base64,${img.data}" alt="${alt}" class="max-w-full rounded my-3" />`
  })

  // Unordered lists
  html = html.replace(/^[-*] (.+)$/gm, '<li class="ms-4 list-disc">$1</li>')
  html = html.replace(/((?:<li[^>]*>.*<\/li>\n?)+)/g, '<ul class="my-2">$1</ul>')

  // Ordered lists
  html = html.replace(/^\d+\. (.+)$/gm, '<li class="ms-4 list-decimal">$1</li>')
  html = html.replace(/((?:<li class="ms-4 list-decimal">.*<\/li>\n?)+)/g, '<ol class="my-2">$1</ol>')

  // Paragraphs (double newline)
  html = html.replace(/\n\n+/g, '</p><p class="my-2">')
  html = `<p class="my-2">${html}</p>`

  // Clean up empty paragraphs
  html = html.replace(/<p class="my-2"><\/p>/g, '')

  return html
}

export function SOPDetailView({
  sop,
  technicianId,
  isAcknowledged,
  onBack,
  onAcknowledged,
}: SOPDetailViewProps) {
  const t = useTranslations('sop')
  const [acked, setAcked] = useState(isAcknowledged)
  const [acknowledging, setAcknowledging] = useState(false)

  const handleAcknowledge = useCallback(async () => {
    if (acked || acknowledging) return
    setAcknowledging(true)
    try {
      await addSOPAcknowledgment({
        id: crypto.randomUUID(),
        sopId: sop.id,
        sopVersion: sop.version,
        technicianId,
        acknowledgedAt: new Date().toISOString(),
        syncStatus: 'pending',
      })
      setAcked(true)
      onAcknowledged()
    } finally {
      setAcknowledging(false)
    }
  }, [acked, acknowledging, sop, technicianId, onAcknowledged])

  const renderedContent = renderMarkdown(sop.content, sop.images)

  return (
    <div className="flex flex-col gap-4">
      {/* Back button */}
      <button
        onClick={onBack}
        className="mb-4 inline-flex items-center gap-1 text-sm text-primary hover:text-primary/80 dark:text-primary"
      >
        <ChevronLeft size={16} aria-hidden="true" />
        {t('backToLibrary')}
      </button>

      {/* Metadata header */}
      <div className="mb-6 rounded-lg border border-border bg-card p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-foreground">
          {sop.title}
        </h1>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
          <div>
            <span className="font-medium">{t('version')}:</span> {sop.version}
          </div>
          <div>
            <span className="font-medium">{t('effectiveDate')}:</span>{' '}
            {new Date(sop.effectiveDate).toLocaleDateString()}
          </div>
          <div>
            <span className="font-medium">{t('author')}:</span> {sop.author}
          </div>
          <div>
            <span className="font-medium">{t('categoryLabel')}:</span>{' '}
            {t(`category.${sop.category}`)}
          </div>
        </div>

        {/* Acknowledgment status */}
        <div className="mt-4">
          {acked ? (
            <span className="inline-flex items-center rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-800 dark:bg-green-900 dark:text-green-200">
              {t('acknowledged')}
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-800 dark:bg-amber-900 dark:text-amber-200">
              {t('reviewRequired')}
            </span>
          )}
        </div>
      </div>

      {/* Markdown content */}
      <div
        className="prose prose-sm max-w-none rounded-lg border border-border bg-card p-6 shadow-sm dark:prose-invert"
        dangerouslySetInnerHTML={{ __html: renderedContent }}
      />

      {/* Acknowledgment button */}
      {!acked && (
        <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
          <p className="mb-3 text-sm text-amber-800 dark:text-amber-200">
            {t('acknowledgePrompt', { title: sop.title })}
          </p>
          <button
            onClick={handleAcknowledge}
            disabled={acknowledging}
            className="rounded-lg bg-primary px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {acknowledging ? t('acknowledging') : t('acknowledgeButton')}
          </button>
        </div>
      )}
    </div>
  )
}
