/**
 * Single source of truth for the Hub API URL.
 *
 * The hub-api dev server runs on port 3004 (see apps/hub-api/package.json
 * `next dev --port 3004`), so that is the local default — never 3000.
 *
 * Env precedence:
 *  - Browser: only `NEXT_PUBLIC_HUB_API_URL` is exposed.
 *  - Server:  prefer `HUB_API_URL`, fall back to `NEXT_PUBLIC_HUB_API_URL`.
 *
 * The env value may or may not include the `/api/trpc` suffix; we normalize
 * by stripping a trailing `/api/trpc` and re-adding it where the tRPC endpoint
 * is needed, so callers get a consistent URL regardless of how the env is set.
 */

const HUB_DEFAULT = 'http://localhost:3004'

function rawHubUrl(): string {
  const fromEnv =
    typeof window !== 'undefined'
      ? process.env.NEXT_PUBLIC_HUB_API_URL
      : process.env.HUB_API_URL ?? process.env.NEXT_PUBLIC_HUB_API_URL
  // Treat an empty/whitespace env var as unset (a common misconfiguration)
  // rather than producing an empty Hub URL.
  return fromEnv && fromEnv.trim().length > 0 ? fromEnv.trim() : HUB_DEFAULT
}

/** Hub origin/base URL with any trailing `/api/trpc` stripped. */
export function getHubBaseUrl(): string {
  return rawHubUrl().replace(/\/api\/trpc\/?$/, '')
}

/** Hub tRPC endpoint base: `<base>/api/trpc`. */
export function getHubTrpcUrl(): string {
  return `${getHubBaseUrl()}/api/trpc`
}
