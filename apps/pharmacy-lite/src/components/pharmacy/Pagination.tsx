'use client'

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
      <button
        data-testid="pagination-prev"
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        className="px-3 py-1.5 rounded-md bg-neutral-100 text-neutral-700 hover:bg-neutral-200 disabled:opacity-40 disabled:cursor-not-allowed text-sm"
      >
        Previous
      </button>
      <span data-testid="pagination-indicator" className="text-sm text-neutral-600">
        Page {page} of {totalPages}
      </span>
      <button
        data-testid="pagination-next"
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        className="px-3 py-1.5 rounded-md bg-neutral-100 text-neutral-700 hover:bg-neutral-200 disabled:opacity-40 disabled:cursor-not-allowed text-sm"
      >
        Next
      </button>
    </div>
  )
}
