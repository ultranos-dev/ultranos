import { SignJWT, jwtVerify, importPKCS8, importSPKI } from 'jose'
import { getRedisClient } from './redis.js'
import type { MpiProceedTokenPayload } from '@ultranos/mpi-engine'

const ALG = 'RS256'
const TOKEN_TTL_SECONDS = 600 // 10 minutes
const REDIS_KEY_PREFIX = 'mpi:token:'

function getPrivateKeyPem(): string {
  const key = process.env.MPI_TOKEN_PRIVATE_KEY
  if (!key) throw new Error('MPI_TOKEN_PRIVATE_KEY environment variable is not set')
  return key
}

function getPublicKeyPem(): string {
  const key = process.env.MPI_TOKEN_PUBLIC_KEY
  if (!key) throw new Error('MPI_TOKEN_PUBLIC_KEY environment variable is not set')
  return key
}

export async function signProceedToken(
  payload: Omit<MpiProceedTokenPayload, 'jti' | 'exp'>,
): Promise<string> {
  const privateKey = await importPKCS8(getPrivateKeyPem(), ALG)
  const jti = crypto.randomUUID()

  return new SignJWT({
    candidateIds: payload.candidateIds,
    maxScore:     payload.maxScore,
    issuedTo:     payload.issuedTo,
  })
    .setProtectedHeader({ alg: ALG })
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime(`${TOKEN_TTL_SECONDS}s`)
    .sign(privateKey)
}

/**
 * Verify a proceed token.
 * Throws if signature is invalid, token is expired, or jti has been consumed (replay).
 */
export async function verifyProceedToken(token: string): Promise<MpiProceedTokenPayload> {
  const publicKey = await importSPKI(getPublicKeyPem(), ALG)
  const { payload } = await jwtVerify(token, publicKey, { algorithms: [ALG] })

  const jti = payload.jti
  if (!jti) throw new Error('Proceed token missing jti claim')

  // Replay prevention: check if this jti has already been consumed
  const redis = getRedisClient()
  if (redis) {
    const existing = await redis.get(`${REDIS_KEY_PREFIX}${jti}`)
    if (existing) throw new Error(`Proceed token already consumed (replay prevention): jti=${jti}`)
  }
  // If Redis is unavailable, skip replay check (fail-open for dev)

  if (!Array.isArray(payload['candidateIds'])) throw new Error('Invalid proceed token: candidateIds must be array')
  if (typeof payload['maxScore'] !== 'number') throw new Error('Invalid proceed token: maxScore must be number')
  if (typeof payload['issuedTo'] !== 'string') throw new Error('Invalid proceed token: issuedTo must be string')

  return {
    jti,
    candidateIds: payload['candidateIds'] as string[],
    maxScore:     payload['maxScore'] as number,
    issuedTo:     payload['issuedTo'] as string,
    exp:          payload.exp as number,
  }
}

/**
 * Mark a proceed token jti as consumed in Redis.
 * Call AFTER successfully creating the patient (commit path only).
 */
export async function consumeProceedToken(jti: string): Promise<void> {
  const redis = getRedisClient()
  if (!redis) return // Skip consume in dev without Redis (no replay prevention)
  await redis.set(`${REDIS_KEY_PREFIX}${jti}`, 'consumed', 'EX', TOKEN_TTL_SECONDS)
}
