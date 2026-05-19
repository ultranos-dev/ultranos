/**
 * Hub API fetch wrapper — certificate-pinned, compromise-aware.
 *
 * Story 21.5: All Hub API connections must use certificate pinning (AC#3).
 * All write operations must be blocked on compromised devices (AC#2).
 *
 * Drop-in replacement for native `fetch` — same signature, same Response shape.
 * All Hub API calls should use `hubFetch` instead of `fetch`.
 */
import { pinnedFetch } from '@/lib/pinned-fetch'
import { useDeviceSecurityStore } from '@/stores/device-security-store'

/**
 * Error thrown when a write operation is attempted on a compromised device.
 */
export class CompromisedDeviceError extends Error {
  constructor() {
    super('Write operations are blocked on compromised devices.')
    this.name = 'CompromisedDeviceError'
  }
}

/**
 * Certificate-pinned fetch for Hub API calls.
 *
 * - On mobile: uses react-native-ssl-pinning for certificate validation
 * - On web: falls back to standard fetch (browser handles TLS)
 * - Blocks write operations (POST/PUT/DELETE) when device is compromised
 *
 * Returns a native-fetch-compatible Response-like object so existing
 * call sites require minimal changes (swap `fetch` → `hubFetch`).
 */
export async function hubFetch(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  const method = (init?.method ?? 'GET').toUpperCase()

  // Block write operations on compromised devices or before integrity check completes.
  // Before check: default is isCompromised=false, so we also gate on `checked` to prevent
  // background processes (drain worker, notification polling) from writing before detection runs.
  const { checked, isCompromised } = useDeviceSecurityStore.getState()
  if (method !== 'GET' && (isCompromised || !checked)) {
    throw new CompromisedDeviceError()
  }

  const headers: Record<string, string> = {}
  if (init?.headers) {
    if (init.headers instanceof Headers) {
      init.headers.forEach((value, key) => { headers[key] = value })
    } else if (Array.isArray(init.headers)) {
      for (const [key, value] of init.headers) { headers[key] = value }
    } else {
      Object.assign(headers, init.headers)
    }
  }

  // Only string bodies supported — pinnedFetch passes body as string to the SSL library.
  // Fail loudly on non-string bodies rather than silently dropping them.
  if (init?.body != null && typeof init.body !== 'string') {
    throw new TypeError('hubFetch only supports string bodies. Use JSON.stringify() for objects.')
  }

  const response = await pinnedFetch(url, {
    method: method as 'GET' | 'POST' | 'PUT' | 'DELETE',
    headers,
    body: init?.body as string | undefined,
  })

  // Wrap PinnedFetchResponse into a native-fetch-compatible shape
  const bodyText = await response.text()

  return {
    ok: response.status >= 200 && response.status < 300,
    status: response.status,
    statusText: '',
    headers: new Headers(response.headers),
    json: async () => JSON.parse(bodyText),
    text: async () => bodyText,
    // Minimal stubs for unused Response properties
    body: null,
    bodyUsed: true,
    redirected: false,
    type: 'basic' as ResponseType,
    url,
    clone: () => { throw new Error('clone() not supported on hubFetch response') },
    arrayBuffer: async () => new TextEncoder().encode(bodyText).buffer as ArrayBuffer,
    blob: async () => new Blob([bodyText]),
    formData: async () => { throw new Error('formData() not supported') },
    bytes: async () => new TextEncoder().encode(bodyText),
  } as Response
}
