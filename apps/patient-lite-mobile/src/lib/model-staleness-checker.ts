import {
  AIModelType,
  MODEL_STALENESS_THRESHOLD_MS,
  ModelUpdateEventType,
  type ModelDegradationType,
  type LocalModelMetadata,
} from '@ultranos/shared-types'
import { getEncryptedDbConnection } from './encrypted-db'
import { hubFetch } from './hub-fetch'

/**
 * Model Staleness Checker for Patient Lite Mobile — Story 24.4
 *
 * Same logic as OPD Lite PWA but queries SQLite instead of Dexie.
 *
 * Degradation rules per model type:
 * - DRUG_DB_OFFLINE: REFUSE interaction checks with explicit warning (Rule #3)
 * - TTS_FRAGMENT_BUNDLE: disable offline TTS
 */

export interface StalenessCheckResult {
  isStale: boolean
  modelId: string
  modelType: AIModelType
  ageMs: number
  degradationType: ModelDegradationType | null
  warningMessage: string | null
}

function getDegradation(modelType: AIModelType): { type: ModelDegradationType; message: string } {
  switch (modelType) {
    case AIModelType.SOAP_MACRO_TEMPLATES:
      return { type: 'TEMPLATE_ONLY', message: 'SOAP macro templates outdated — using basic built-in templates only.' }
    case AIModelType.DRUG_DB_OFFLINE:
      return { type: 'INTERACTION_REFUSED', message: 'Drug database outdated — interaction check unavailable.' }
    case AIModelType.TTS_FRAGMENT_BUNDLE:
      return { type: 'TTS_DISABLED', message: 'Audio unavailable offline — connect to Wi-Fi to update.' }
    case AIModelType.ONNX_SOAP_MODEL:
      return { type: 'AI_SOAP_DISABLED', message: 'AI-assisted SOAP parsing unavailable — manual entry only.' }
  }
}

export async function checkModelStaleness(
  modelId: string,
  expectedModelType?: AIModelType,
): Promise<StalenessCheckResult> {
  const dbConn = await getEncryptedDbConnection()
  const row = await dbConn.getFirstAsync<{
    model_id: string
    model_type: string
    version: string
    downloaded_at: string
    is_stale: number
  }>('SELECT * FROM ai_model_metadata WHERE model_id = ?', [modelId])

  if (!row) {
    const modelType = expectedModelType ?? AIModelType.SOAP_MACRO_TEMPLATES
    const degradation = expectedModelType ? getDegradation(modelType) : null
    return {
      isStale: true,
      modelId,
      modelType,
      ageMs: Infinity,
      degradationType: degradation?.type ?? null,
      warningMessage: 'Model not available — connect to Wi-Fi to download.',
    }
  }

  const ageMs = Date.now() - new Date(row.downloaded_at).getTime()
  const isStale = ageMs > MODEL_STALENESS_THRESHOLD_MS

  // Update staleness flag if changed
  if ((row.is_stale === 1) !== isStale) {
    await dbConn.runAsync(
      'UPDATE ai_model_metadata SET is_stale = ? WHERE model_id = ?',
      [isStale ? 1 : 0, modelId],
    )
  }

  if (!isStale) {
    return {
      isStale: false,
      modelId: row.model_id,
      modelType: row.model_type as AIModelType,
      ageMs,
      degradationType: null,
      warningMessage: null,
    }
  }

  const degradation = getDegradation(row.model_type as AIModelType)
  return {
    isStale: true,
    modelId: row.model_id,
    modelType: row.model_type as AIModelType,
    ageMs,
    degradationType: degradation.type,
    warningMessage: degradation.message,
  }
}

/**
 * Check staleness for all locally stored models.
 * Reports MODEL_STALE_DEGRADED events to Hub for the monthly AI performance report (AC #6).
 */
export async function checkAllModelsStaleness(hubApiBaseUrl?: string): Promise<StalenessCheckResult[]> {
  const dbConn = await getEncryptedDbConnection()
  const rows = await dbConn.getAllAsync<{ model_id: string; model_type: string }>(
    'SELECT model_id, model_type FROM ai_model_metadata',
  )

  const results: StalenessCheckResult[] = []
  for (const row of rows) {
    const result = await checkModelStaleness(row.model_id)
    if (result.isStale) results.push(result)
  }

  // Report staleness events to Hub (best-effort)
  if (hubApiBaseUrl && results.length > 0) {
    const { getItemAsync, setItemAsync } = await import('expo-secure-store')
    let deviceId = await getItemAsync('ultranos_device_id')
    if (!deviceId) {
      deviceId = `mobile-${Date.now()}-${Math.random().toString(36).slice(2)}`
      await setItemAsync('ultranos_device_id', deviceId)
    }

    const events = results.map((r) => ({
      deviceId,
      modelId: r.modelId,
      eventType: ModelUpdateEventType.MODEL_STALE_DEGRADED,
      metadata: { modelType: r.modelType, age: r.ageMs, degradationType: r.degradationType },
    }))

    try {
      await hubFetch(`${hubApiBaseUrl}/api/trpc/ai.reportModelUpdateEvents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ json: { events } }),
      })
    } catch {
      // Best-effort — don't block clinical workflows
    }
  }

  return results
}

export async function isModelAvailable(modelType: AIModelType): Promise<boolean> {
  const dbConn = await getEncryptedDbConnection()
  const row = await dbConn.getFirstAsync<{ downloaded_at: string }>(
    'SELECT downloaded_at FROM ai_model_metadata WHERE model_type = ? LIMIT 1',
    [modelType],
  )
  if (!row) return false

  const ageMs = Date.now() - new Date(row.downloaded_at).getTime()
  return ageMs <= MODEL_STALENESS_THRESHOLD_MS
}

export async function getStalenessBannerMessage(): Promise<string | null> {
  const dbConn = await getEncryptedDbConnection()
  const row = await dbConn.getFirstAsync<{ model_id: string }>(
    'SELECT model_id FROM ai_model_metadata WHERE is_stale = 1 LIMIT 1',
  )
  if (!row) return null
  return 'Model outdated — AI features limited. Connect to Wi-Fi to update.'
}

export async function isDrugDatabaseStale(): Promise<{ stale: boolean; warningMessage: string | null }> {
  const dbConn = await getEncryptedDbConnection()
  const row = await dbConn.getFirstAsync<{ downloaded_at: string }>(
    'SELECT downloaded_at FROM ai_model_metadata WHERE model_type = ? LIMIT 1',
    [AIModelType.DRUG_DB_OFFLINE],
  )

  if (!row) {
    return { stale: true, warningMessage: 'Drug database outdated — interaction check unavailable.' }
  }

  const ageMs = Date.now() - new Date(row.downloaded_at).getTime()
  if (ageMs > MODEL_STALENESS_THRESHOLD_MS) {
    return { stale: true, warningMessage: 'Drug database outdated — interaction check unavailable.' }
  }

  return { stale: false, warningMessage: null }
}
