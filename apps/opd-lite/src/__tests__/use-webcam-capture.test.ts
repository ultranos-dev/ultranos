// apps/opd-lite/src/__tests__/use-webcam-capture.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useWebcamCapture } from '@/hooks/useWebcamCapture'

describe('useWebcamCapture', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  it('marks status unavailable when getUserMedia rejects (fallback signal)', async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn().mockRejectedValue(new Error('denied')) },
    })
    const { result } = renderHook(() => useWebcamCapture())
    await act(async () => { await result.current.start() })
    expect(result.current.state.status).toBe('unavailable')
  })

  it('marks status unavailable when mediaDevices is missing', async () => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined })
    const { result } = renderHook(() => useWebcamCapture())
    await act(async () => { await result.current.start() })
    expect(result.current.state.status).toBe('unavailable')
  })
})
