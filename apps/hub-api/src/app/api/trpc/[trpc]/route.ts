import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
import { createTRPCContext } from '@/trpc/init'
import { appRouter } from '@/trpc/routers/_app'
import { validateEncryptionConfig } from '@/lib/field-encryption'

// Story 7.3b: Fail fast at startup if encryption env vars are missing.
// This runs when the route module is first loaded, before any request is handled.
// If FIELD_ENCRYPTION_KEY or FIELD_ENCRYPTION_HMAC_KEY are not configured,
// the Hub API will throw immediately rather than silently degrading to plaintext.
validateEncryptionConfig()

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: () => createTRPCContext({ headers: req.headers }),
  })

export { handler as GET, handler as POST }
