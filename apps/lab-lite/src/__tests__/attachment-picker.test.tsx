import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AttachmentPicker } from '../components/attachments/AttachmentPicker'

// Minimal i18n mock — returns the key as the translation (consistent with patient-verification-ui.test.tsx)
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, opts?: Record<string, unknown>) => {
    if (!opts) return key
    return key.replace(/\{(\w+)\}/g, (_, k) => (k in opts ? String(opts[k]) : `{${k}}`))
  },
}))

vi.mock('../lib/image-transcode', async (orig) => {
  const actual = await orig<typeof import('../lib/image-transcode')>()
  return {
    ...actual,
    transcodeToWebp: vi.fn(async () => ({
      blob: new Blob([new Uint8Array(1000)], { type: 'image/webp' }),
      width: 2048,
      height: 1536,
      bytes: 1000,
      originalType: 'image/jpeg',
    })),
  }
})

function pngFile(name = 'p.png') {
  return new File([new Uint8Array(5)], name, { type: 'image/png' })
}

function bigPdf() {
  return new File([new Uint8Array(11 * 1024 * 1024)], 'a.pdf', { type: 'application/pdf' })
}

function textFile() {
  return new File(['hello world'], 't.txt', { type: 'text/plain' })
}

describe('AttachmentPicker', () => {
  it('transcodes an image to a webp PreparedAttachment', async () => {
    const onChange = vi.fn()
    render(<AttachmentPicker value={[]} onChange={onChange} />)
    fireEvent.change(screen.getByTestId('attachment-input'), { target: { files: [pngFile()] } })
    await waitFor(() => expect(onChange).toHaveBeenCalled())
    expect(onChange.mock.calls[0][0][0]).toMatchObject({ fileType: 'image/webp', kind: 'image' })
  })

  it('rejects a PDF over 10MB', async () => {
    render(<AttachmentPicker value={[]} onChange={vi.fn()} />)
    fireEvent.change(screen.getByTestId('attachment-input'), { target: { files: [bigPdf()] } })
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
  })

  it('processes multiple files and calls onChange with all PreparedAttachments', async () => {
    const onChange = vi.fn()
    render(<AttachmentPicker value={[]} onChange={onChange} />)
    const twoImages = [pngFile('a.png'), pngFile('b.png')]
    fireEvent.change(screen.getByTestId('attachment-input'), { target: { files: twoImages } })
    await waitFor(() => expect(onChange).toHaveBeenCalled())
    // Both images should be in the final call's argument
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1]
    expect(lastCall[0]).toHaveLength(2)
    expect(lastCall[0][0]).toMatchObject({ fileType: 'image/webp', kind: 'image' })
    expect(lastCall[0][1]).toMatchObject({ fileType: 'image/webp', kind: 'image' })
  })

  it('shows a role="alert" for an unsupported file type', async () => {
    render(<AttachmentPicker value={[]} onChange={vi.fn()} />)
    fireEvent.change(screen.getByTestId('attachment-input'), { target: { files: [textFile()] } })
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.getByRole('alert').textContent).toContain('errorUnsupported')
  })
})
