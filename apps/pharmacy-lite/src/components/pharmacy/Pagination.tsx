'use client'

import { Button } from '@/components/ui/button'

interface PaginationProps {
  page: number
  totalPages: number
  onPageChange: (page: number) => void
}

export function Pagination({ page, totalPages, onPageChange }: PaginationProps) {
  if (totalPages <= 1) return null

  return (
    <div
      data-testid="pagination"
      className="flex items-center justify-center gap-4 pt-4"
    >
      <Button
        variant="secondary"
        data-testid="pagination-prev"
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
      >
        Previous
      </Button>
      <span data-testid="pagination-indicator" className="text-sm text-muted-foreground">
        Page {page} of {totalPages}
      </span>
      <Button
        variant="secondary"
        data-testid="pagination-next"
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
      >
        Next
      </Button>
    </div>
  )
}
