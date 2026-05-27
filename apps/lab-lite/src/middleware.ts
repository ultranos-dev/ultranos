import createMiddleware from 'next-intl/middleware'
import { NextRequest } from 'next/server'
import { routing } from './i18n/routing'

const intlMiddleware = createMiddleware(routing)

/**
 * Map Dari/Farsi and Pashto browser locales to our locale codes before
 * next-intl processes the Accept-Language header.
 * PRD HP-001: fa, fa-AF, prs → Dari RTL; ps, ps-AF → Pashto RTL; ar, ar-* → Arabic RTL; all others → English LTR
 */
export default function middleware(request: NextRequest) {
  const acceptLang = request.headers.get('accept-language')

  if (acceptLang) {
    // Rewrite fa/fa-AF/prs locale tags to 'prs', and ps-AF to 'ps'
    const rewritten = acceptLang
      .replace(/\b(fa-AF|fa|prs)\b/g, 'prs')
      .replace(/\b(ps-AF)\b/g, 'ps')
    if (rewritten !== acceptLang) {
      const headers = new Headers(request.headers)
      headers.set('accept-language', rewritten)
      const rewrittenRequest = new NextRequest(request.url, {
        headers,
        method: request.method,
      })
      return intlMiddleware(rewrittenRequest)
    }
  }

  return intlMiddleware(request)
}

export const config = {
  matcher: '/((?!api|trpc|_next|_vercel|sw\\.js|manifest\\.webmanifest|.*\\..*).*)',
}
