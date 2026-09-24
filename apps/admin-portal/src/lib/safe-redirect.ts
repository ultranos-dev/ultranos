/**
 * Story 56.4 (audit H-ADM-1): open-redirect guard for post-login `returnUrl`.
 *
 * The naive `returnUrl.startsWith('/')` check is exploitable: browsers treat a
 * leading `//` (protocol-relative) or `/\` as an absolute off-origin URL, so
 * `//evil.com` and `/\evil.com` both pass `startsWith('/')` yet navigate the
 * user to an attacker origin.
 *
 * Only same-origin PATH redirects are honored. A value is safe iff it begins
 * with a single `/` that is NOT immediately followed by another `/` or a `\`.
 * Everything else (absolute URLs, protocol-relative, backslash tricks, empty,
 * or non-string input) falls back to `fallback`.
 */
export function isSafeReturnUrl(value: string | null | undefined): boolean {
  if (typeof value !== 'string' || value.length === 0) return false
  // Must be an absolute path on this origin ...
  if (value[0] !== '/') return false
  // ... but reject `//host` (protocol-relative) and `/\host` (backslash variant),
  // both of which browsers resolve to an off-origin absolute URL.
  if (value[1] === '/' || value[1] === '\\') return false
  return true
}

/**
 * Returns `returnUrl` when it is a safe same-origin path, otherwise `fallback`.
 */
export function safeReturnUrl(
  returnUrl: string | null | undefined,
  fallback: string,
): string {
  return isSafeReturnUrl(returnUrl) ? (returnUrl as string) : fallback
}
