import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useCommandPalette } from '@/hooks/use-command-palette'

describe('useCommandPalette', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('starts with open = false', () => {
    const { result } = renderHook(() => useCommandPalette())
    expect(result.current.open).toBe(false)
  })

  it('opens on Ctrl+K', () => {
    const { result } = renderHook(() => useCommandPalette())
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))
    })
    expect(result.current.open).toBe(true)
  })

  it('opens on Meta+K (Cmd+K on macOS)', () => {
    const { result } = renderHook(() => useCommandPalette())
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))
    })
    expect(result.current.open).toBe(true)
  })

  it('toggles closed if already open', () => {
    const { result } = renderHook(() => useCommandPalette())
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))
    })
    expect(result.current.open).toBe(true)
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))
    })
    expect(result.current.open).toBe(false)
  })

  it('provides setOpen to control state programmatically', () => {
    const { result } = renderHook(() => useCommandPalette())
    act(() => {
      result.current.setOpen(true)
    })
    expect(result.current.open).toBe(true)
    act(() => {
      result.current.setOpen(false)
    })
    expect(result.current.open).toBe(false)
  })

  it('does not open on plain K without modifier', () => {
    const { result } = renderHook(() => useCommandPalette())
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k' }))
    })
    expect(result.current.open).toBe(false)
  })

  it('cleans up listener on unmount', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const { unmount } = renderHook(() => useCommandPalette())
    unmount()
    expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function))
  })
})
