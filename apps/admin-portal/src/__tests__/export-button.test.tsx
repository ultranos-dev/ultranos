import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ExportButton } from '../components/ExportButton'

// Stub URL APIs not available in jsdom
const mockRevokeObjectURL = vi.fn()
const mockCreateObjectURL = vi.fn(() => 'blob:mock-url')
Object.defineProperty(globalThis, 'URL', {
  value: {
    createObjectURL: mockCreateObjectURL,
    revokeObjectURL: mockRevokeObjectURL,
  },
  writable: true,
})

// Stub atob
const mockAtob = vi.fn(() => '')
globalThis.atob = mockAtob

describe('ExportButton', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAtob.mockReturnValue('')
    mockCreateObjectURL.mockReturnValue('blob:mock-url')
  })

  it('triggers exportFn on click', async () => {
    const user = userEvent.setup()
    const exportFn = vi.fn().mockResolvedValue({
      data: btoa('col1,col2\nval1,val2'),
      filename: 'export.csv',
      mimeType: 'text/csv',
    })

    render(<ExportButton exportFn={exportFn} filters={{ status: 'ACTIVE' }} />)

    await user.click(screen.getByRole('button', { name: /Export CSV/i }))

    await waitFor(() => {
      expect(exportFn).toHaveBeenCalledOnce()
      expect(exportFn).toHaveBeenCalledWith({ status: 'ACTIVE' })
    })
  })

  it('shows "Exporting..." loading state while request is in flight', async () => {
    const user = userEvent.setup()
    let resolveExport!: (value: { data: string; filename: string; mimeType: string }) => void
    const exportFn = vi.fn(
      () =>
        new Promise<{ data: string; filename: string; mimeType: string }>((resolve) => {
          resolveExport = resolve
        }),
    )

    render(<ExportButton exportFn={exportFn} filters={{}} />)

    await user.click(screen.getByRole('button', { name: /Export CSV/i }))

    expect(screen.getByRole('button', { name: /Exporting\.\.\./i })).toBeInTheDocument()

    resolveExport({ data: btoa(''), filename: 'export.csv', mimeType: 'text/csv' })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Export CSV/i })).toBeInTheDocument()
    })
  })
})
