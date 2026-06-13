/**
 * Hub API fetch wrapper — certificate-pinned, compromise-aware.
 * Adapted from apps/patient-lite-mobile/src/lib/hub-fetch.ts.
 *
 * Drop-in replacement for native fetch. All Hub API calls must use hubFetch.
 */
import { pinnedFetch } from '@/lib/pinned-fetch'
import { useDeviceSecurityStore } from '@/stores/device-security-store'

export class CompromisedDeviceError extends Error {
  constructor() {
    super('Write operations are blocked on compromised devices.')
    this.name = 'CompromisedDeviceError'
  }
}

export async function hubFetch(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  const method = (init?.method ?? 'GET').toUpperCase()

  const { checked, isCompromised } = useDeviceSecurityStore.getState()
  if (method !== 'GET' && (isCompromised || !checked)) {
    throw new CompromisedDeviceError()
  }

  const headers: Record<string, string> = {}
  if (init?.headers) {
    if (init.headers instanceof Headers) {
      init.headers.forEach((value: string, key: string) => { headers[key] = value })
    } else if (Array.isArray(init.headers)) {
      for (const entry of init.headers) {
        const key = entry[0]
        const value = entry[1]
        if (key != null && value != null) { headers[key] = value }
      }
    } else {
      Object.assign(headers, init.headers)
    }
  }

  if (init?.body != null && typeof init.body !== 'string') {
    throw new TypeError('hubFetch only supports string bodies. Use JSON.stringify() for objects.')
  }

  const response = await pinnedFetch(url, {
    method: method as 'GET' | 'POST' | 'PUT' | 'DELETE',
    headers,
    body: init?.body as string | undefined,
  })

  const bodyText = await response.text()

  return {
    ok: response.status >= 200 && response.status < 300,
    status: response.status,
    statusText: '',
    headers: new Headers(response.headers),
    json: async () => JSON.parse(bodyText),
    text: async () => bodyText,
    body: null,
    bodyUsed: true,
    redirected: false,
    type: 'basic' as ResponseType_,
    url,
    clone: () => { throw new Error('clone() not supported on hubFetch response') },
    arrayBuffer: async (): Promise<ArrayBuffer> => { throw new Error('arrayBuffer() not supported on hubFetch response') },
    blob: async () => new Blob([bodyText]),
    formData: async () => { throw new Error('formData() not supported') },
    bytes: async (): Promise<Uint8Array> => { throw new Error('bytes() not supported on hubFetch response') },
  } as unknown as Response
}
