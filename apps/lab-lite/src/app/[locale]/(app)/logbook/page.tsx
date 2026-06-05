'use client'

import { useCallback, useState } from 'react'
import { useLocale } from 'next-intl'
import { AuthGuard } from '@/components/AuthGuard'
import { useLogbook } from '@/hooks/useLogbook'
import { LogbookList } from '@/components/logbook/LogbookList'
import { exportLogbookPdf } from '@/lib/logbook-pdf'
import { reportLogbookEvent } from '@/lib/audit-client'
import { useAuthSessionStore } from '@/stores/auth-session-store'

const FACILITY_NAME = 'Ultranos Lab Facility'

function LogbookContent() {
  const locale = useLocale()
  const session = useAuthSessionStore((s) => s.session)
  const {
    entries,
    loading,
    error,
    filter,
    setFilter,
    hasMore,
    loadMore,
    loadingMore,
    total,
    refresh,
  } = useLogbook()

  const [exporting, setExporting] = useState(false)

  const handleExportPdf = useCallback(async () => {
    if (exporting || entries.length === 0) return
    setExporting(true)

    // Emit audit event before generating — PDF export is a PHI operation
    reportLogbookEvent({
      action: 'LOGBOOK_EXPORTED',
      entryId: 'batch-export',
      entryCount: entries.length,
      filterCriteria: {
        ...(filter.dateFrom ? { dateFrom: filter.dateFrom } : {}),
        ...(filter.dateTo ? { dateTo: filter.dateTo } : {}),
        ...(filter.testType ? { testType: filter.testType } : {}),
        ...(filter.technicianId ? { technicianId: filter.technicianId } : {}),
      },
      technicianId: session?.userId,
    })

    try {
      const blob = await exportLogbookPdf(
        entries,
        {
          dateFrom: filter.dateFrom,
          dateTo: filter.dateTo,
          testType: filter.testType,
          technicianId: filter.technicianId,
        },
        FACILITY_NAME,
        locale,
      )
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `lab-logbook-${new Date().toISOString().slice(0, 10)}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      // Export failures are non-fatal — user can retry
    } finally {
      setExporting(false)
    }
  }, [exporting, entries, filter, locale, session?.userId])

  return (
    <LogbookList
      entries={entries}
      loading={loading}
      error={error}
      filter={filter}
      onFilterChange={setFilter}
      hasMore={hasMore}
      onLoadMore={loadMore}
      loadingMore={loadingMore}
      total={total}
      onExportPdf={handleExportPdf}
      exporting={exporting}
    />
  )
}

export default function LogbookPage() {
  return (
    <AuthGuard>
      <LogbookContent />
    </AuthGuard>
  )
}
