import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Story 21.4: HTTPS enforcement middleware.
 *
 * In production, redirects HTTP requests to HTTPS (301).
 * Skipped in development to avoid breaking local dev servers.
 */
export function middleware(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    const rawProto = request.headers.get('x-forwarded-proto')
    const proto = rawProto?.split(',')[0].trim()
    if (proto && proto !== 'https') {
      const httpsUrl = new URL(request.url)
      httpsUrl.protocol = 'https:'
      return NextResponse.redirect(httpsUrl.toString(), 301)
    }
  }
  return NextResponse.next()
}

export const config = {
  matcher: '/((?!_next/static|_next/image|favicon.ico).*)',
}
