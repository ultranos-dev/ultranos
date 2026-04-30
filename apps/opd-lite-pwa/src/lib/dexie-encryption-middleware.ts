import type Dexie from 'dexie'
import { encryptPayload, decryptPayload } from '@ultranos/crypto'
import {
  encryptionKeyStore,
} from './encryption-key-store'

export { EncryptionKeyNotAvailableError } from './encryption-key-store'

/**
 * Thrown when a decrypted record is missing its encrypted payload,
 * indicating data corruption or a schema mismatch.
 */
export class EncryptedDataCorruptError extends Error {
  constructor() {
    super('Encrypted data corrupt or missing — data inaccessible')
    this.name = 'EncryptedDataCorruptError'
  }
}

/**
 * Configuration for a table that should have its non-indexed fields encrypted.
 * Indexed fields are kept in cleartext so Dexie queries continue to work.
 */
export interface EncryptionTableConfig {
  tableName: string
  /** Fields that are indexed in Dexie and must remain in cleartext for queries. */
  indexedFields: string[]
}

const ENC_FIELD = '_enc'

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.')
  let current: unknown = obj
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

function setNestedValue(
  obj: Record<string, unknown>,
  path: string,
  value: unknown,
): void {
  const parts = path.split('.')
  let current: Record<string, unknown> = obj
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]!
    if (current[part] == null || typeof current[part] !== 'object') {
      current[part] = {}
    }
    current = current[part] as Record<string, unknown>
  }
  current[parts[parts.length - 1]!] = value
}

async function encryptRecord(
  record: Record<string, unknown>,
  indexedFields: Set<string>,
  key: CryptoKey,
): Promise<Record<string, unknown>> {
  const encrypted = await encryptPayload(key, record)
  const stored: Record<string, unknown> = { [ENC_FIELD]: encrypted }

  for (const field of indexedFields) {
    const value = getNestedValue(record, field)
    if (value !== undefined) {
      setNestedValue(stored, field, value)
    }
  }

  return stored
}

async function decryptRecord(
  stored: Record<string, unknown>,
  key: CryptoKey,
): Promise<Record<string, unknown>> {
  const encValue = stored[ENC_FIELD]
  if (typeof encValue !== 'string') {
    throw new EncryptedDataCorruptError()
  }
  return (await decryptPayload(key, encValue)) as Record<string, unknown>
}

async function decryptResults(results: unknown[]): Promise<unknown[]> {
  const key = encryptionKeyStore.requireKey()
  return Promise.all(
    results.map((r) =>
      r == null ? r : decryptRecord(r as Record<string, unknown>, key),
    ),
  )
}

/**
 * Wrap a collection/where-clause chain so terminal methods decrypt results.
 */
function wrapChain(target: object): unknown {
  return new Proxy(target, {
    get(t, prop, receiver) {
      const val = Reflect.get(t, prop, receiver)

      if (prop === 'toArray') {
        return async () => {
          const raw = await (t as { toArray: () => Promise<unknown[]> }).toArray()
          return decryptResults(raw)
        }
      }

      if (prop === 'first') {
        return async () => {
          const key = encryptionKeyStore.requireKey()
          const result = await (t as { first: () => Promise<unknown> }).first()
          if (result == null) return result
          return decryptRecord(result as Record<string, unknown>, key)
        }
      }

      if (prop === 'last') {
        return async () => {
          const key = encryptionKeyStore.requireKey()
          const result = await (t as { last: () => Promise<unknown> }).last()
          if (result == null) return result
          return decryptRecord(result as Record<string, unknown>, key)
        }
      }

      // sortBy() returns Promise<T[]> — decrypt the results
      if (prop === 'sortBy') {
        return async (...args: unknown[]) => {
          const raw = await (val as Function).apply(t, args)
          return decryptResults(raw as unknown[])
        }
      }

      // each() iterates records — collect, decrypt, then iterate
      if (prop === 'each') {
        return async (callback: (item: unknown) => void) => {
          const raw = await (t as { toArray: () => Promise<unknown[]> }).toArray()
          const decrypted = await decryptResults(raw)
          for (const item of decrypted) {
            if (item != null) callback(item)
          }
        }
      }

      // Block modify() — it would corrupt the _enc blob
      if (prop === 'modify') {
        return () => {
          throw new Error(
            'modify() is not supported on encrypted tables — use get/put instead',
          )
        }
      }

      if (typeof val === 'function') {
        return (...args: unknown[]) => {
          const result = (val as Function).apply(t, args)
          if (result != null && typeof result === 'object') {
            return wrapChain(result as object)
          }
          return result
        }
      }

      return val
    },
  })
}

/**
 * Wrap a collection chain with a post-decryption filter predicate.
 * Since Dexie's filter() is synchronous and cannot await decryption,
 * we accept all records and apply the predicate after decryption
 * in terminal methods (toArray, first, each, etc.).
 */
function wrapChainWithFilter(
  target: object,
  predicate: (item: unknown) => boolean,
): unknown {
  return new Proxy(target, {
    get(t, prop, receiver) {
      const val = Reflect.get(t, prop, receiver)

      if (prop === 'toArray') {
        return async () => {
          const raw = await (t as { toArray: () => Promise<unknown[]> }).toArray()
          const decrypted = await decryptResults(raw)
          return decrypted.filter((item) => item != null && predicate(item))
        }
      }

      if (prop === 'first') {
        return async () => {
          const raw = await (t as { toArray: () => Promise<unknown[]> }).toArray()
          const decrypted = await decryptResults(raw)
          return decrypted.find((item) => item != null && predicate(item)) ?? undefined
        }
      }

      if (prop === 'count') {
        return async () => {
          const raw = await (t as { toArray: () => Promise<unknown[]> }).toArray()
          const decrypted = await decryptResults(raw)
          return decrypted.filter((item) => item != null && predicate(item)).length
        }
      }

      if (prop === 'each') {
        return async (callback: (item: unknown) => void) => {
          const raw = await (t as { toArray: () => Promise<unknown[]> }).toArray()
          const decrypted = await decryptResults(raw)
          for (const item of decrypted) {
            if (item != null && predicate(item)) {
              callback(item)
            }
          }
        }
      }

      if (prop === 'modify') {
        return () => {
          throw new Error(
            'modify() is not supported on encrypted tables — use get/put instead',
          )
        }
      }

      if (typeof val === 'function') {
        return (...args: unknown[]) => {
          const result = (val as Function).apply(t, args)
          if (result != null && typeof result === 'object') {
            return wrapChainWithFilter(result as object, predicate)
          }
          return result
        }
      }

      return val
    },
  })
}

/**
 * Apply transparent encryption to specified Dexie tables by replacing
 * the table reference on the db instance with an encrypting Proxy.
 *
 * - Writes (put/add/bulkPut/bulkAdd): encrypt BEFORE the IDB transaction
 * - Reads (get/toArray/where chains): decrypt AFTER the IDB transaction
 */
export function applyEncryptionMiddleware(
  db: Dexie,
  configs: EncryptionTableConfig[],
): void {
  for (const config of configs) {
    const indexedSet = new Set(config.indexedFields)
    const tableName = config.tableName
    const originalTable = (db as Record<string, unknown>)[tableName] as object

    if (!originalTable) {
      throw new Error(`Table "${tableName}" not found on Dexie instance`)
    }

    const proxy = new Proxy(originalTable, {
      get(target, prop, receiver) {
        const val = Reflect.get(target, prop, receiver)

        // --- Write methods: encrypt before ---
        if (prop === 'put') {
          return async (item: unknown, keyOrOpts?: unknown) => {
            const key = encryptionKeyStore.requireKey()
            const encrypted = await encryptRecord(
              item as Record<string, unknown>,
              indexedSet,
              key,
            )
            return (target as Record<string, Function>)['put'].call(
              target,
              encrypted,
              keyOrOpts,
            )
          }
        }

        if (prop === 'add') {
          return async (item: unknown, keyOrOpts?: unknown) => {
            const key = encryptionKeyStore.requireKey()
            const encrypted = await encryptRecord(
              item as Record<string, unknown>,
              indexedSet,
              key,
            )
            return (target as Record<string, Function>)['add'].call(
              target,
              encrypted,
              keyOrOpts,
            )
          }
        }

        if (prop === 'bulkPut') {
          return async (items: unknown[], keysOrOpts?: unknown) => {
            const key = encryptionKeyStore.requireKey()
            const encrypted = await Promise.all(
              items.map((i) =>
                encryptRecord(
                  i as Record<string, unknown>,
                  indexedSet,
                  key,
                ),
              ),
            )
            return (target as Record<string, Function>)['bulkPut'].call(
              target,
              encrypted,
              keysOrOpts,
            )
          }
        }

        if (prop === 'update') {
          return async (keyValue: unknown, modifications: Record<string, unknown>) => {
            const cryptoKey = encryptionKeyStore.requireKey()
            // Read current decrypted record, apply mods, re-encrypt and put
            const current = await (target as Record<string, Function>)[
              'get'
            ].call(target, keyValue)
            if (current == null) return 0
            const decrypted = await decryptRecord(
              current as Record<string, unknown>,
              cryptoKey,
            )
            // Apply dotted-key modifications
            for (const [modKey, modVal] of Object.entries(modifications)) {
              setNestedValue(decrypted, modKey, modVal)
            }
            const encrypted = await encryptRecord(decrypted, indexedSet, cryptoKey)
            await (target as Record<string, Function>)['put'].call(
              target,
              encrypted,
            )
            return 1
          }
        }

        if (prop === 'bulkAdd') {
          return async (items: unknown[], keysOrOpts?: unknown) => {
            const key = encryptionKeyStore.requireKey()
            const encrypted = await Promise.all(
              items.map((i) =>
                encryptRecord(
                  i as Record<string, unknown>,
                  indexedSet,
                  key,
                ),
              ),
            )
            return (target as Record<string, Function>)['bulkAdd'].call(
              target,
              encrypted,
              keysOrOpts,
            )
          }
        }

        // --- Read methods: decrypt after ---
        if (prop === 'get') {
          return async (keyOrFilter: unknown) => {
            const key = encryptionKeyStore.requireKey()
            const result = await (target as Record<string, Function>)[
              'get'
            ].call(target, keyOrFilter)
            if (result == null) return result
            return decryptRecord(result as Record<string, unknown>, key)
          }
        }

        if (prop === 'toArray') {
          return async () => {
            const raw = await (target as Record<string, Function>)[
              'toArray'
            ].call(target)
            return decryptResults(raw as unknown[])
          }
        }

        // --- Table-level each(): collect all, decrypt, then iterate ---
        if (prop === 'each') {
          return async (callback: (item: unknown) => void) => {
            const raw = await (target as Record<string, Function>)[
              'toArray'
            ].call(target)
            const decrypted = await decryptResults(raw as unknown[])
            for (const item of decrypted) {
              if (item != null) callback(item)
            }
          }
        }

        // --- bulkGet: decrypt each result ---
        if (prop === 'bulkGet') {
          return async (keys: unknown[]) => {
            const cryptoKey = encryptionKeyStore.requireKey()
            const results = await (target as Record<string, Function>)[
              'bulkGet'
            ].call(target, keys)
            return Promise.all(
              (results as unknown[]).map((r) =>
                r == null
                  ? r
                  : decryptRecord(r as Record<string, unknown>, cryptoKey),
              ),
            )
          }
        }

        // --- filter(): decrypt records before invoking the predicate ---
        if (prop === 'filter') {
          if (typeof val !== 'function') return val
          return (predicate: (item: unknown) => boolean) => {
            const collection = (target as Record<string, Function>)[
              'toCollection'
            ].call(target)
            const filtered = collection.filter(
              (raw: Record<string, unknown>) => {
                // Cannot async-decrypt inside Dexie's sync filter,
                // so we pass through all records and filter after decryption
                return true
              },
            )
            // Wrap with post-decryption filter on terminal methods
            return wrapChainWithFilter(filtered, predicate)
          }
        }

        // --- Chain methods: wrap result for decryption ---
        if (prop === 'where' || prop === 'orderBy') {
          if (typeof val !== 'function') return val
          return (...args: unknown[]) => {
            const result = (val as Function).apply(target, args)
            if (result != null && typeof result === 'object') {
              return wrapChain(result as object)
            }
            return result
          }
        }

        // --- toCollection(): wrap for decryption ---
        if (prop === 'toCollection') {
          if (typeof val !== 'function') return val
          return (...args: unknown[]) => {
            const result = (val as Function).apply(target, args)
            if (result != null && typeof result === 'object') {
              return wrapChain(result as object)
            }
            return result
          }
        }

        // Pass through everything else (hook, schema, name, etc.)
        if (typeof val === 'function') {
          return val.bind(target)
        }
        return val
      },
    })

    // Replace the table reference on the db instance
    ;(db as Record<string, unknown>)[tableName] = proxy
  }
}
