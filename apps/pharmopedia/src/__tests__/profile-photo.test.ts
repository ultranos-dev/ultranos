import { describe, it, expect, vi, beforeEach } from 'vitest'

const upload = vi.fn(async () => ({ data: { path: 'u1/avatar.jpeg' }, error: null }))
const getPublicUrl = vi.fn(() => ({ data: { publicUrl: 'https://cdn/u1/avatar.jpg' } }))
vi.mock('@/lib/supabase', () => ({ supabase: { storage: { from: () => ({ upload, getPublicUrl }) } } }))
// global fetch returns a blob for the uri
;(globalThis as unknown as { fetch: unknown }).fetch = vi.fn(async () => ({ blob: async () => ({ size: 10, type: 'image/jpeg' }) }))

import { uploadProfilePhoto } from '@/lib/profile-photo'

describe('uploadProfilePhoto', () => {
  beforeEach(() => { upload.mockClear(); getPublicUrl.mockClear() })

  it('uploads to {userId}/avatar.<ext> (from blob type) and returns the object path', async () => {
    const result = await uploadProfilePhoto('file:///x/photo.jpg', 'u1')
    expect(upload).toHaveBeenCalled()
    expect(upload.mock.calls[0][0]).toBe('u1/avatar.jpeg')
    expect((upload.mock.calls[0][2] as { contentType: string }).contentType).toBe('image/jpeg')
    // bucket is now private — must return the storage object path, not a public URL
    expect(result).toBe('u1/avatar.jpeg')
    expect(result).not.toMatch(/^https?:\/\//)
  })

  it('does not call getPublicUrl after upload', async () => {
    await uploadProfilePhoto('file:///x/photo.jpg', 'u1')
    expect(getPublicUrl).not.toHaveBeenCalled()
  })

  it('throws when the storage upload errors', async () => {
    upload.mockResolvedValueOnce({ data: null, error: new Error('upload failed') } as never)
    await expect(uploadProfilePhoto('file:///x/photo.jpg', 'u1')).rejects.toThrow()
  })
})
