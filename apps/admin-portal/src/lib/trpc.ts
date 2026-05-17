import { createTRPCClient, httpBatchLink } from '@trpc/client'
import superjson from 'superjson'
import type { AppRouter } from 'hub-api/src/trpc/routers/_app'

function getHubApiUrl(): string {
  return process.env.NEXT_PUBLIC_HUB_API_URL ?? 'http://localhost:3000/api/trpc'
}

// Access token stored in memory only — never localStorage/sessionStorage.
let _accessToken: string | null = null

export function setAccessToken(token: string | null) {
  _accessToken = token
}

export function getAccessToken(): string | null {
  return _accessToken
}

export const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: getHubApiUrl(),
      transformer: superjson,
      headers() {
        return _accessToken ? { authorization: `Bearer ${_accessToken}` } : {}
      },
    }),
  ],
})

type AdminAuthEventType =
  | 'ADMIN_LOGIN_SUCCESS'
  | 'ADMIN_LOGIN_FAILURE'

/**
 * Fire-and-forget admin audit event reporting to Hub API via tRPC client.
 * Never throws — auth flow must not be blocked by audit failures.
 */
export async function reportAdminAuthEvent(
  event: AdminAuthEventType,
  opts?: { actorId?: string; actorEmail?: string },
): Promise<void> {
  try {
    await trpc.admin.reportAuthEvent.mutate({
      event,
      ...(opts?.actorId ? { actorId: opts.actorId } : {}),
      ...(opts?.actorEmail ? { actorEmail: opts.actorEmail } : {}),
    })
  } catch {
    // Audit reporting is best-effort from the client.
  }
}
