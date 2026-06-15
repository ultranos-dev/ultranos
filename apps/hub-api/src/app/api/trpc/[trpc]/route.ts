import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
import { createTRPCContext } from '@/trpc/init'
import { appRouter } from '@/trpc/routers/_app'
import { validateEncryptionConfig } from '@/lib/field-encryption'
import { isOriginAllowed, corsHeaders, validateCorsConfig } from '@/lib/cors'

// Story 7.3b: Fail fast at startup if encryption env vars are missing.
// This runs when the route module is first loaded, before any request is handled.
// If FIELD_ENCRYPTION_KEY or FIELD_ENCRYPTION_HMAC_KEY are not configured,
// the Hub API will throw immediately rather than silently degrading to plaintext.
validateEncryptionConfig()
validateCorsConfig()

function applyCorsHeaders(req: Request, res: Response): Response {
  const origin = req.headers.get('origin')
  if (origin && isOriginAllowed(origin)) {
    const newRes = new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers: new Headers(res.headers),
    })
    const corsH = corsHeaders(origin)
    for (const [key, value] of Object.entries(corsH)) {
      newRes.headers.set(key, value)
    }
    return newRes
  }
  return res
}

const handler = async (req: Request) => {
  const res = await fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: () => createTRPCContext({ headers: req.headers }),
    onError({ error, path }) {
      console.error(`[tRPC ERROR] ${path}:`, error.message)
      if (error.cause) console.error(`[tRPC ERROR] cause:`, error.cause)
    },
    responseMeta({ ctx }) {
      const headers: Record<string, string> = {}
      // Story 27.9 AC 3.4: Signal read-only mode to frontend for cancelled orgs
      if (ctx && (ctx as unknown as Record<string, unknown>).orgReadOnly === true) {
        headers['X-Org-Read-Only'] = 'true'
      }
      return { headers }
    },
  })
  return applyCorsHeaders(req, res)
}

// Story 21.4: CORS preflight handler
async function optionsHandler(req: Request) {
  const origin = req.headers.get('origin')
  if (origin && isOriginAllowed(origin)) {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(origin),
    })
  }
  return new Response(null, { status: 204 })
}

export { handler as GET, handler as POST, optionsHandler as OPTIONS }
