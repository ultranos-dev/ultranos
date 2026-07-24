// apps/opd-lite/src/hooks/useWebcamCapture.ts
import { useCallback, useEffect, useRef, useState } from 'react'

export interface WebcamState {
  stream: MediaStream | null
  status: 'idle' | 'starting' | 'live' | 'unavailable'
  error: string | null
}

export function useWebcamCapture() {
  const [state, setState] = useState<WebcamState>({ stream: null, status: 'idle', error: null })
  const streamRef = useRef<MediaStream | null>(null)

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setState({ stream: null, status: 'idle', error: null })
  }, [])

  const start = useCallback(async () => {
    // Stop any in-progress stream before re-acquiring (prevents a track/camera-light leak on double-start).
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (!navigator.mediaDevices?.getUserMedia) {
      setState({ stream: null, status: 'unavailable', error: null })
      return
    }
    setState((s) => ({ ...s, status: 'starting', error: null }))
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })
      streamRef.current = stream
      setState({ stream, status: 'live', error: null })
    } catch {
      setState({ stream: null, status: 'unavailable', error: null })
    }
  }, [])

  const capture = useCallback((video: HTMLVideoElement): string | null => {
    const w = video.videoWidth
    const h = video.videoHeight
    if (!w || !h) return null
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(video, 0, 0, w, h)
    return canvas.toDataURL('image/png')
  }, [])

  // Stop the camera on unmount so the device light turns off.
  useEffect(() => () => { streamRef.current?.getTracks().forEach((t) => t.stop()) }, [])

  return { state, start, stop, capture }
}
