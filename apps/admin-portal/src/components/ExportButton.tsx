'use client'

import { useState } from 'react'
import { Download } from '@ultranos/ui-kit/icons'

interface ExportButtonProps {
  exportFn: (filters: Record<string, unknown>) => Promise<{ data: string; filename: string; mimeType: string }>
  filters: Record<string, unknown>
  label?: string
}

export function ExportButton({ exportFn, filters, label = 'Export CSV' }: ExportButtonProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleClick = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await exportFn(filters)
      const binary = atob(result.data)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i)
      }
      const blob = new Blob([bytes], { type: result.mimeType })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = result.filename
      anchor.click()
      URL.revokeObjectURL(url)
    } catch {
      setError('Export failed. Try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <button
        onClick={handleClick}
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-full border border-border text-black px-4 py-2 text-sm hover:bg-accent-subtle transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        <Download className="h-4 w-4 shrink-0" />
        {loading ? 'Exporting...' : label}
      </button>
      {error && (
        <p className="text-xs text-danger">{error}</p>
      )}
    </div>
  )
}

