import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render } from '@testing-library/react'
import { createRef } from 'react'
import { PhotoCropper, type PhotoCropperHandle } from '@/components/patient/PhotoCropper'

vi.mock('next-intl', () => ({ useTranslations: () => (k: string) => k }))

// jsdom canvas → deterministic data URL
beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ drawImage: vi.fn() })) as never
  HTMLCanvasElement.prototype.toDataURL = vi.fn(() => 'data:image/jpeg;base64,QUJD') // "ABC"
})

describe('PhotoCropper', () => {
  it('exposes crop() via ref and emits a cropped data URL', () => {
    const ref = createRef<PhotoCropperHandle>()
    const onCropped = vi.fn()
    render(<PhotoCropper ref={ref} rawDataUrl="data:image/png;base64,AAAA" onCropped={onCropped} />)
    ref.current!.crop()
    expect(onCropped).toHaveBeenCalledWith(expect.stringMatching(/^data:image\/jpeg/))
  })
})
