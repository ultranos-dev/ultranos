import createMiddleware from 'next-intl/middleware'
import { NextRequest, NextResponse } from 'next/server'
import { routing } from './i18n/routing'
import { AUTH_COOKIE_NAME } from './lib/supabase'

const intlMiddleware = createMiddleware(routing)

/**
 * Public route SEGMENTS (locale-agnostic). A path is public when, after
 * stripping an optional leading locale segment, it is empty (landing) or its
 * first segment matches one of these. Mirrors AuthGuard's PUBLIC_PATHS.
 */
const PUBLIC_SEGMENTS = new Set(['login', 'register', 'forgot-password', 'reset-password'])

const LOCALE_SEGMENTS = new Set<string>(routing.locales as readonly string[])

/**
 * Story 62.2 (M-ADM-3): defense-in-depth auth gate. The portal's primary auth
 * enforcement is hub-side (every data call is gated) plus the client AuthGuard,
 * but the audit flagged the *absence* of any server-edge check. Here we redirect
 * unauthenticated requests for protected app routes to /login before the page
 * even renders. We only check for the PRESENCE of the Supabase auth-session
 * cookie (chunked as `<name>` / `<name>.0` / `<name>.1`); we do NOT verify the
 * JWT at the edge (that stays hub-side). This is intentionally conservative:
 * a present-but-invalid cookie still falls through to AuthGuard + hub gating.
 */
function isPublicPath(pathname: string): boolean {
  const segments = pathname.split('/').filter(Boolean)
  // Drop a leading locale segment if present (e.g. /en/login → ['login']).
  if (segments.length > 0 && LOCALE_SEGMENTS.has(segments[0]!)) segments.shift()
  if (segments.length === 0) return true // landing page ('/' or '/<locale>')
  return PUBLIC_SEGMENTS.has(segments[0]!)
}

function hasAuthCookie(request: NextRequest): boolean {
  for (const cookie of request.cookies.getAll()) {
    if (cookie.name === AUTH_COOKIE_NAME || cookie.name.startsWith(`${AUTH_COOKIE_NAME}.`)) {
      if (cookie.value) return true
    }
  }
  return false
}

/**
 * Normalise Dari/Farsi and Pashto browser locale codes before
 * next-intl processes the Accept-Language header.
 * fa, fa-AF, prs → prs (Dari RTL)
 * ps-AF → ps (Pashto RTL)
 */
export default function middleware(request: NextRequest) {
  // Defense-in-depth auth gate (Story 62.2). Public routes and the landing page
  // are always allowed; every other app route requires an auth-session cookie.
  const { pathname } = request.nextUrl
  if (!isPublicPath(pathname) && !hasAuthCookie(request)) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('returnUrl', pathname + request.nextUrl.search)
    return NextResponse.redirect(loginUrl)
  }

  const acceptLang = request.headers.get('accept-language')

  if (acceptLang) {
    const rewritten = acceptLang
      .replace(/(^|,\s*)(fa-AF|fa|prs)(?=[,;]|$)/gi, '$1prs')
      .replace(/(^|,\s*)(ps-AF)(?=[,;]|$)/gi, '$1ps')
    if (rewritten !== acceptLang) {
      const headers = new Headers(request.headers)
      headers.set('accept-language', rewritten)
      return intlMiddleware(new NextRequest(request.url, { headers, method: request.method }))
    }
  }

  return intlMiddleware(request)
}

export const config = {
  matcher: '/((?!api|trpc|_next|_vercel|.*\\..*).*)',
}
