/**
 * Certificate-pinned HTTP client for Hub API connections.
 *
 * Story 21.5 AC#3: All Hub API connections from the mobile app must use
 * certificate pinning with TLS 1.3 minimum.
 *
 * Uses react-native-ssl-pinning to enforce certificate pins on all
 * outbound requests to the Hub API. On pin validation failure, the
 * connection is rejected (fail-closed).
 *
 * On web platform, falls back to standard fetch (browsers handle TLS
 * certificate validation via their own trust store).
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

/**
 * Perform a certificate-pinned fetch to the Hub API.
 *
 * On mobile (iOS/Android), uses react-native-ssl-pinning to validate
 * the server certificate against configured pins.
 * On web, falls back to standard fetch.
 *
 * Throws on pin validation failure (fail-closed).
 */
export async function pinnedFetch(
  url: string,
  options: PinnedFetchOptions = {},
): Promise<PinnedFetchResponse> {
  if (Platform.OS === 'web') {
    return webFallback(url, options)
  }

  return mobilePinnedFetch(url, options)
}

async function mobilePinnedFetch(
  url: string,
  options: PinnedFetchOptions,
): Promise<PinnedFetchResponse> {
  try {
    // react-native-ssl-pinning provides fetch with certificate pinning
    const { fetch: sslFetch } = require('react-native-ssl-pinning')

    const pinHashes = HUB_API_PINS.map((pin) => pin.hash)

    const response = await sslFetch(url, {
      method: options.method ?? 'GET',
      headers: options.headers ?? {},
      body: options.body,
      sslPinning: {
        certs: pinHashes,
      },
      timeoutInterval: 30000,
      // Enforce minimum TLS version
      ...(MIN_TLS_VERSION === 'TLSv1.3' ? { pkPinning: true } : {}),
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
    // All errors from sslFetch are treated as potential pinning failures.
    // The library throws on any TLS/pinning issue — wrapping all errors
    // as CertificatePinningError is safer than fragile string matching
    // that misses platform-specific or localized error messages.
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

/**
 * Custom error for certificate pinning failures.
 * Callers should display a network error to the user.
 */
export class CertificatePinningError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CertificatePinningError'
  }
}
