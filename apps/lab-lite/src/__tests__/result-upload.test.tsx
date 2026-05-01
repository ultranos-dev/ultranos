import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { ResultUpload } from '../components/ResultUpload'

const defaultProps = {
  onFileSelected: vi.fn(),
}

function createFile(name: string, size: number, type: string): File {
  const buffer = new ArrayBuffer(size)
  return new File([buffer], name, { type })
}

describe('ResultUpload', () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders drag-and-drop zone with file picker button', () => {
    render(<ResultUpload {...defaultProps} />)
    expect(screen.getByText(/drag and drop/i)).toBeDefined()
    expect(screen.getByText(/browse files/i)).toBeDefined()
  })

  it('renders an accessible file input accepting PDF, JPEG, PNG', () => {
    render(<ResultUpload {...defaultProps} />)
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    expect(input).toBeDefined()
    expect(input.accept).toBe('.pdf,.jpg,.jpeg,.png')
  })

  it('accepts a valid PDF file via file picker', async () => {
    render(<ResultUpload {...defaultProps} />)
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = createFile('result.pdf', 1024, 'application/pdf')

    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => {
      expect(defaultProps.onFileSelected).toHaveBeenCalledWith(file)
    })
    expect(screen.getByText('result.pdf')).toBeDefined()
  })

  it('accepts a valid JPEG file', async () => {
    render(<ResultUpload {...defaultProps} />)
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = createFile('scan.jpg', 2048, 'image/jpeg')

    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => {
      expect(defaultProps.onFileSelected).toHaveBeenCalledWith(file)
    })
  })

  it('accepts a valid PNG file', async () => {
    render(<ResultUpload {...defaultProps} />)
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = createFile('scan.png', 2048, 'image/png')

    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => {
      expect(defaultProps.onFileSelected).toHaveBeenCalledWith(file)
    })
  })

  it('rejects files exceeding 20 MB with clear error message', async () => {
    render(<ResultUpload {...defaultProps} />)
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = createFile('huge.pdf', 21 * 1024 * 1024, 'application/pdf')

    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => {
      expect(screen.getByText(/exceeds.*20 mb/i)).toBeDefined()
    })
    expect(defaultProps.onFileSelected).not.toHaveBeenCalled()
  })

  it('rejects invalid file types with clear error message', async () => {
    render(<ResultUpload {...defaultProps} />)
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = createFile('doc.docx', 1024, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')

    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => {
      expect(screen.getByText(/only pdf, jpeg, and png/i)).toBeDefined()
    })
    expect(defaultProps.onFileSelected).not.toHaveBeenCalled()
  })

  it('shows file name and size after successful selection', async () => {
    render(<ResultUpload {...defaultProps} />)
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = createFile('blood-work.pdf', 5 * 1024 * 1024, 'application/pdf')

    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => {
      expect(screen.getByText('blood-work.pdf')).toBeDefined()
      expect(screen.getByText(/5\.0 mb/i)).toBeDefined()
    })
  })

  it('allows removing a selected file', async () => {
    render(<ResultUpload {...defaultProps} />)
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = createFile('result.pdf', 1024, 'application/pdf')

    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => {
      expect(screen.getByText('result.pdf')).toBeDefined()
    })

    fireEvent.click(screen.getByLabelText(/remove file/i))

    await waitFor(() => {
      expect(screen.queryByText('result.pdf')).toBeNull()
      expect(screen.getByText(/drag and drop/i)).toBeDefined()
    })
  })

  it('shows upload progress when uploading prop is true', () => {
    render(<ResultUpload {...defaultProps} uploading={true} progress={45} />)
    expect(screen.getByRole('progressbar')).toBeDefined()
    expect(screen.getByText('45%')).toBeDefined()
  })

  it('disables file selection when disabled prop is true', () => {
    render(<ResultUpload {...defaultProps} disabled={true} />)
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    expect(input.disabled).toBe(true)
  })
})
