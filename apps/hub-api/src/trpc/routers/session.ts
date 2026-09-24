import { createHmac } from 'node:crypto'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter, protectedProcedure } from '../init'

/**
 * Session router — issues the per-user key-wrapping secret that hardens the
 * spoke at-rest encryption key (Story 61.2, AC #1; audit P-CRYPTO-2 / H-OPD-2).
 *
 * WHY: the legacy spoke KDF derived the session key from PBKDF2(supabase `sub`,
 * localStorage device salt) — both recoverable from the workstation's disk, so
 * "encryption at rest" was nominal. vNext wraps a random DEK under a wrapping key
 * derived from a genuine secret that never touches the client's disk. The hub is
 * the holder of that secret.
 *
 * The hub keeps a single master secret (`HUB_KEY_WRAPPING_MASTER_SECRET`, env-only,
 * never returned) and derives a stable per-user value HMAC-SHA256(master, sub).
 * The per-user secret is:
 *   - deterministic across logins/devices for the same user, so the persisted
 *     dual-wrapped DEK bundle re-opens on every online login without a re-wrap;
 *   - NOT computable by an attacker who only has the workstation disk (they lack
 *     the master secret);
 *   - held ONLY in memory on the client (never persisted client-side).
 *
 * It is returned only over an authenticated (Bearer JWT verified) call, and only
 * to the caller's own `sub`. No PHI is involved; no audit event is required for a
 * self-scoped key-material issuance, but the call is protected/authenticated.
 */

function getMasterSecret(): string {
  const secret = process.env.HUB_KEY_WRAPPING_MASTER_SECRET
  if (!secret || secret.length < 32) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Key-wrapping master secret is not configured',
    })
  }
  return secret
}

export const sessionRouter = createTRPCRouter({
  /**
   * Returns the caller's per-user key-wrapping secret (hex, 256-bit).
   * Client holds it in memory only and uses it to derive the server-arm wrapping
   * key for the dual-wrapped DEK (see packages/crypto browser-crypto vNext).
   */
  getKeyWrappingSecret: protectedProcedure.query(({ ctx }) => {
    const master = getMasterSecret()
    const secret = createHmac('sha256', master)
      .update(`ultranos:dek-wrap:${ctx.user.sub}`)
      .digest('hex')
    return { secret }
  }),
})
