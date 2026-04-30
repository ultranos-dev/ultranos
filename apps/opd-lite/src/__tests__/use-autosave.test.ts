import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAutosave } from '@/lib/use-autosave'

describe('useAutosave hook', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should call onSave after 300ms of inactivity', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() => useAutosave({ onSave, delay: 300 }))

    act(() => {
      result.current.trigger()
    })

    expect(onSave).not.toHaveBeenCalled()

    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    expect(onSave).toHaveBeenCalledOnce()
  })

  it('should debounce multiple triggers within the delay window', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() => useAutosave({ onSave, delay: 300 }))

    act(() => {
      result.current.trigger()
    })
    act(() => {
      vi.advanceTimersByTime(100)
    })
    act(() => {
      result.current.trigger()
    })
    act(() => {
      vi.advanceTimersByTime(100)
    })
    act(() => {
      result.current.trigger()
    })

    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    expect(onSave).toHaveBeenCalledOnce()
  })

  it('should not call onSave if no trigger is fired', () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    renderHook(() => useAutosave({ onSave, delay: 300 }))

    vi.advanceTimersByTime(1000)
    expect(onSave).not.toHaveBeenCalled()
  })

  it('should clean up timer on unmount', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    const { result, unmount } = renderHook(() => useAutosave({ onSave, delay: 300 }))

    act(() => {
      result.current.trigger()
    })

    unmount()

    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    expect(onSave).not.toHaveBeenCalled()
  })
})
