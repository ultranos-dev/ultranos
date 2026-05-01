/**
 * Key Revocation List (KRL) Sync Service.
 * Story 7.4 AC 3: KRL is synchronized to all edge devices as a high-priority sync item.
 *
 * The KRL is a list of revoked Ed25519 public keys that scanners (OPD/Pharmacy)
 * use to immediately reject signatures from compromised practitioners.
 *
 * Storage is abstracted via KRLStorage so each platform (IndexedDB, SQLite)
 * can provide its own implementation.
 */

export interface KRLEntry {
  publicKey: string
  revokedAt: string
}

/**
 * Platform-agnostic storage interface for the local KRL.
 * Implementations: IndexedDB (PWA), SQLite (Mobile).
 */
export interface KRLStorage {
  getAll(): Promise<KRLEntry[]>
  replaceAll(entries: KRLEntry[]): Promise<void>
  has(publicKey: string): Promise<boolean>
}

export class KRLSyncService {
  constructor(private readonly storage: KRLStorage) {}

  /**
   * Apply a full KRL snapshot from the Hub.
   * Replaces the entire local KRL — used on initial sync or full refresh.
   */
  async applySnapshot(entries: KRLEntry[]): Promise<void> {
    await this.storage.replaceAll(entries)
  }

  /**
   * Check if a public key is present in the local KRL.
   * AC 4: Scanners immediately reject signatures from keys in the local KRL.
   */
  async isRevoked(publicKey: string): Promise<boolean> {
    return this.storage.has(publicKey)
  }

  /**
   * Process an incremental revocation event from the Hub.
   * Idempotent — duplicate revocations are silently ignored.
   * Serialized via mutex to prevent TOCTOU race on concurrent calls.
   */
  async addRevocation(entry: KRLEntry): Promise<void> {
    // Serialize concurrent addRevocation calls to prevent race conditions
    await this.withLock(async () => {
      const alreadyRevoked = await this.storage.has(entry.publicKey)
      if (alreadyRevoked) return

      const existing = await this.storage.getAll()
      existing.push(entry)
      await this.storage.replaceAll(existing)
    })
  }

  private lockPromise: Promise<void> = Promise.resolve()

  private async withLock(fn: () => Promise<void>): Promise<void> {
    const prev = this.lockPromise
    this.lockPromise = prev.then(fn, fn)
    await this.lockPromise
  }
}
