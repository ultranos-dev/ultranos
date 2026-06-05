import createMiddleware from 'next-intl/middleware'
import { NextRequest } from 'next/server'
import { routing } from './i18n/routing'

const intlMiddleware = createMiddleware(routing)

/**
 * Normalise Dari/Farsi and Pashto browser locale codes before
 * next-intl processes the Accept-Language header.
 * fa, fa-AF, prs → prs (Dari RTL)
 * ps-AF → ps (Pashto RTL)
 */
export default function middleware(request: NextRequest) {
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
