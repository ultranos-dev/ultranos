/**
 * Certificate-pinned HTTP client — Pharmopedia.
 * Copied from apps/patient-lite-mobile/src/lib/pinned-fetch.ts.
 */
import { Platform } from 'react-native'
import { HUB_API_PINS, MIN_TLS_VERSION } from '@/config/certificate-pins'

export interface PinnedFetchOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  headers?: Record<string, string>
  body?: string
}

export interface PinnedFetchResponse {
  status: number
  headers: Record<string, string>
  json: <T>() => Promise<T>
  text: () => Promise<string>
}

export class CertificatePinningError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CertificatePinningError'
  }
}

export async function pinnedFetch(
  url: string,
  options: PinnedFetchOptions = {},
): Promise<PinnedFetchResponse> {
  if (Platform.OS === 'web' || __DEV__) {
    return webFallback(url, options)
  }
  return mobilePinnedFetch(url, options)
}

async function mobilePinnedFetch(
  url: string,
  options: PinnedFetchOptions,
): Promise<PinnedFetchResponse> {
  try {
    const { fetch: sslFetch } = require('react-native-ssl-pinning')
    const pinHashes = HUB_API_PINS.map((pin) => pin.hash)
    const response = await sslFetch(url, {
      method: options.method ?? 'GET',
      headers: options.headers ?? {},
      body: options.body,
      sslPinning: { certs: pinHashes },
      timeoutInterval: 30000,
      pkPinning: true,
    })
    let bodyText: string
    if (typeof response.bodyString === 'string') {
      bodyText = response.bodyString
    } else if (response.json != null) {
      bodyText = JSON.stringify(response.json)
    } else if (response.data != null) {
      bodyText = typeof response.data === 'string' ? response.data : JSON.stringify(response.data)
    } else {
      bodyText = ''
    }
    return {
      status: response.status,
      headers: response.headers ?? {},
      json: async <T>() => JSON.parse(bodyText) as T,
      text: async () => bodyText,
    }
  } catch (error: unknown) {
    throw new CertificatePinningError(
      `Certificate pinning validation failed: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

async function webFallback(
  url: string,
  options: PinnedFetchOptions,
): Promise<PinnedFetchResponse> {
  const response = await fetch(url, {
    method: options.method ?? 'GET',
    headers: options.headers,
    body: options.body,
  })
  const text = await response.text()
  return {
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    json: async <T>() => JSON.parse(text) as T,
    text: async () => text,
  }
}
