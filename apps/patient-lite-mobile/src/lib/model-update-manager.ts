import {
  type AIModelManifestEntry,
  MODEL_STALENESS_THRESHOLD_MS,
  ModelUpdateEventType,
  type AIModelType,
  type LocalModelMetadata,
} from '@ultranos/shared-types'
import NetInfo from '@react-native-community/netinfo'
import * as FileSystem from 'expo-file-system'
import { getEncryptedDbConnection } from './encrypted-db'
import { hubFetch } from './hub-fetch'

/**
 * Model Update Manager for Patient Lite Mobile — Story 24.4
 *
 * Same logic as PWA version but uses React Native APIs:
 * - Network check: @react-native-community/netinfo for Wi-Fi detection
 * - Storage: app document directory
 * - Resume: HTTP Range headers for partial downloads
 * - Checksum: SHA-256 verification after download
 */

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000 // 6 hours
let checkIntervalId: ReturnType<typeof setInterval> | null = null

const MODEL_DIR = `${FileSystem.documentDirectory}ai_models/`

/** Check if device is on Wi-Fi. */
export async function isOnWifi(): Promise<boolean> {
  const state = await NetInfo.fetch()
  return state.type === 'wifi'
}

/** Fetch model manifest from Hub API. */
export async function fetchManifest(hubApiBaseUrl: string): Promise<AIModelManifestEntry[]> {
  const res = await hubFetch(`${hubApiBaseUrl}/api/trpc/ai.getModelManifest`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  })

  if (!res.ok) {
    throw new Error(`Manifest fetch failed: ${res.status}`)
  }

  const body = await res.json()
  return body?.result?.data?.json?.models ?? []
}

/** Get locally stored model metadata from SQLite. */
export async function getLocalModels(): Promise<LocalModelMetadata[]> {
  const dbConn = await getEncryptedDbConnection()
  const rows = await dbConn.getAllAsync<{
    model_id: string
    model_type: string
    version: string
    downloaded_at: string
    file_size: number
    checksum: string
    is_stale: number
  }>('SELECT * FROM ai_model_metadata')

  return rows.map((r) => ({
    modelId: r.model_id,
    modelType: r.model_type as AIModelType,
    version: r.version,
    downloadedAt: r.downloaded_at,
    fileSize: r.file_size,
    checksum: r.checksum,
    isStale: r.is_stale === 1,
  }))
}

/** Get a specific local model. */
export async function getLocalModel(modelId: string): Promise<LocalModelMetadata | undefined> {
  const dbConn = await getEncryptedDbConnection()
  const row = await dbConn.getFirstAsync<{
    model_id: string
    model_type: string
    version: string
    downloaded_at: string
    file_size: number
    checksum: string
    is_stale: number
  }>('SELECT * FROM ai_model_metadata WHERE model_id = ?', [modelId])

  if (!row) return undefined

  return {
    modelId: row.model_id,
    modelType: row.model_type as AIModelType,
    version: row.version,
    downloadedAt: row.downloaded_at,
    fileSize: row.file_size,
    checksum: row.checksum,
    isStale: row.is_stale === 1,
  }
}

/** Save model metadata to SQLite. */
async function saveModelMetadata(meta: LocalModelMetadata): Promise<void> {
  const dbConn = await getEncryptedDbConnection()
  await dbConn.runAsync(
    `INSERT OR REPLACE INTO ai_model_metadata
     (model_id, model_type, version, downloaded_at, file_size, checksum, is_stale)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [meta.modelId, meta.modelType, meta.version, meta.downloadedAt, meta.fileSize, meta.checksum, meta.isStale ? 1 : 0],
  )
}

/** Compute SHA-256 checksum of a file (raw bytes, not Base64 encoding). */
async function computeFileChecksum(filePath: string): Promise<string> {
  const { digest } = await import('expo-crypto')
  const fileContent = await FileSystem.readAsStringAsync(filePath, {
    encoding: FileSystem.EncodingType.Base64,
  })
  // Convert Base64 to Uint8Array for raw byte hashing
  const binaryStr = atob(fileContent)
  const bytes = new Uint8Array(binaryStr.length)
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i)
  }
  // expo-crypto digest returns a hex string when given a Uint8Array
  return digest('SHA-256', bytes)
}

/**
 * Download a model file to the app document directory.
 *
 * Note: expo-file-system's `downloadAsync` overwrites the target file, so true
 * resume (appending to partial) is not supported natively. Instead we:
 * - Always download the full file (fresh start)
 * - If a complete file from a previous version exists, delete it first
 * - The download is atomic from the perspective of the caller: either the full
 *   file is written or an error is thrown.
 */
async function downloadModel(entry: AIModelManifestEntry): Promise<string> {
  await FileSystem.makeDirectoryAsync(MODEL_DIR, { intermediates: true })

  const filePath = `${MODEL_DIR}${entry.modelId}_${entry.currentVersion}`

  // Clean up any partial/stale file from a previous attempt
  const fileInfo = await FileSystem.getInfoAsync(filePath)
  if (fileInfo.exists && fileInfo.size !== entry.fileSize) {
    await FileSystem.deleteAsync(filePath, { idempotent: true })
  }

  // Download full file (no Range header — downloadAsync overwrites)
  const downloadResult = await FileSystem.downloadAsync(
    entry.downloadUrl,
    filePath,
  )

  if (downloadResult.status !== 200) {
    throw new Error(`Download failed: ${downloadResult.status}`)
  }

  return filePath
}

/** Report model update events to Hub API (best-effort). */
async function reportEvents(
  hubApiBaseUrl: string,
  events: Array<{ modelId: string; eventType: ModelUpdateEventType; metadata: Record<string, unknown> }>,
): Promise<void> {
  // Use a stable device ID from SecureStore
  const { getItemAsync, setItemAsync } = await import('expo-secure-store')
  let deviceId = await getItemAsync('ultranos_device_id')
  if (!deviceId) {
    deviceId = `mobile-${Date.now()}-${Math.random().toString(36).slice(2)}`
    await setItemAsync('ultranos_device_id', deviceId)
  }

  const payload = events.map((e) => ({ ...e, deviceId }))

  try {
    await hubFetch(`${hubApiBaseUrl}/api/trpc/ai.reportModelUpdateEvents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ json: { events: payload } }),
    })
  } catch {
    // Best-effort — don't block clinical workflows
  }
}

/**
 * Check for model updates and download newer versions.
 * Called on app foreground and every 6 hours.
 */
export async function checkAndUpdateModels(hubApiBaseUrl: string): Promise<void> {
  // Only download on Wi-Fi (AC #2)
  if (!(await isOnWifi())) return

  let manifest: AIModelManifestEntry[]
  try {
    manifest = await fetchManifest(hubApiBaseUrl)
  } catch {
    return // Network unavailable — retry next cycle
  }

  const localModels = await getLocalModels()
  const localMap = new Map(localModels.map((m) => [m.modelId, m]))
  const pendingEvents: Array<{ modelId: string; eventType: ModelUpdateEventType; metadata: Record<string, unknown> }> = []

  for (const entry of manifest) {
    const local = localMap.get(entry.modelId)

    // Skip if already at this version
    if (local && local.version === entry.currentVersion) continue

    // Check delta availability
    const useDelta = entry.deltaFromVersion && local?.version === entry.deltaFromVersion

    pendingEvents.push({
      modelId: entry.modelId,
      eventType: ModelUpdateEventType.MODEL_UPDATE_STARTED,
      metadata: { fromVersion: local?.version ?? null, toVersion: entry.currentVersion, isDelta: !!useDelta },
    })

    const startTime = Date.now()

    try {
      // Re-check Wi-Fi before each download
      if (!(await isOnWifi())) break

      const filePath = await downloadModel(entry)

      // Verify checksum (AC #8)
      const checksum = await computeFileChecksum(filePath)
      if (checksum !== entry.checksum) {
        await FileSystem.deleteAsync(filePath, { idempotent: true })
        throw new Error('Checksum verification failed')
      }

      // Save metadata
      await saveModelMetadata({
        modelId: entry.modelId,
        modelType: entry.modelType as AIModelType,
        version: entry.currentVersion,
        downloadedAt: new Date().toISOString(),
        fileSize: entry.fileSize,
        checksum,
        isStale: false,
      })

      pendingEvents.push({
        modelId: entry.modelId,
        eventType: ModelUpdateEventType.MODEL_UPDATE_COMPLETED,
        metadata: { version: entry.currentVersion, downloadDurationMs: Date.now() - startTime, fileSize: entry.fileSize },
      })
    } catch (err) {
      pendingEvents.push({
        modelId: entry.modelId,
        eventType: ModelUpdateEventType.MODEL_UPDATE_FAILED,
        metadata: { error: err instanceof Error ? err.message : 'Unknown error', retryCount: 0 },
      })
    }
  }

  if (pendingEvents.length > 0) {
    await reportEvents(hubApiBaseUrl, pendingEvents)
  }
}

/** Start the periodic model update check. */
export function startModelUpdateScheduler(hubApiBaseUrl: string): void {
  checkAndUpdateModels(hubApiBaseUrl)

  if (checkIntervalId) clearInterval(checkIntervalId)
  checkIntervalId = setInterval(() => {
    checkAndUpdateModels(hubApiBaseUrl)
  }, CHECK_INTERVAL_MS)
}

/** Stop the periodic model update check. */
export function stopModelUpdateScheduler(): void {
  if (checkIntervalId) {
    clearInterval(checkIntervalId)
    checkIntervalId = null
  }
}
