import {
  AIModelType,
  MODEL_STALENESS_THRESHOLD_MS,
  ModelUpdateEventType,
  type ModelDegradationType,
} from '@ultranos/shared-types'
import { db, type AIModelMetadataEntry } from './db'
import { reportEvents } from './model-update-manager'

/**
 * Model Staleness Checker for OPD Lite PWA — Story 24.4
 *
 * On each model load (when AI features are invoked):
 * - Check downloadedAt timestamp
 * - If now - downloadedAt > 45 days: model is stale → degrade
 *
 * Degradation per model type:
 * - SOAP_MACRO_TEMPLATES: fall back to built-in basic templates
 * - DRUG_DB_OFFLINE: REFUSE interaction checks with explicit warning (CLAUDE.md Rule #3)
 * - TTS_FRAGMENT_BUNDLE: disable offline TTS
 * - ONNX_SOAP_MODEL: disable AI-assisted SOAP parsing offline
 */

export interface StalenessCheckResult {
  isStale: boolean
  modelId: string
  modelType: AIModelType
  ageMs: number
  degradationType: ModelDegradationType | null
  warningMessage: string | null
}

/** Map model type to degradation type and warning message. */
function getDegradation(modelType: AIModelType): { type: ModelDegradationType; message: string } {
  switch (modelType) {
    case AIModelType.SOAP_MACRO_TEMPLATES:
      return {
        type: 'TEMPLATE_ONLY',
        message: 'SOAP macro templates outdated — using basic built-in templates only.',
      }
    case AIModelType.DRUG_DB_OFFLINE:
      return {
        type: 'INTERACTION_REFUSED',
        message: 'Drug database outdated — interaction check unavailable.',
      }
    case AIModelType.TTS_FRAGMENT_BUNDLE:
      return {
        type: 'TTS_DISABLED',
        message: 'Audio unavailable offline — connect to Wi-Fi to update.',
      }
    case AIModelType.ONNX_SOAP_MODEL:
      return {
        type: 'AI_SOAP_DISABLED',
        message: 'AI-assisted SOAP parsing unavailable — manual entry only.',
      }
  }
}

/**
 * Check if a specific model is stale (>45 days old).
 * Updates the isStale flag in Dexie if staleness state changed.
 * @param modelId - The model identifier to check
 * @param expectedModelType - The expected model type (used when model is not yet downloaded)
 */
export async function checkModelStaleness(
  modelId: string,
  expectedModelType?: AIModelType,
): Promise<StalenessCheckResult> {
  const model = await db.aiModels.get(modelId)

  if (!model) {
    // Model not downloaded yet — treat as unavailable
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

  const ageMs = Date.now() - new Date(model.downloadedAt).getTime()
  const isStale = ageMs > MODEL_STALENESS_THRESHOLD_MS

  // Update isStale flag in Dexie if changed
  if (model.isStale !== isStale) {
    await db.aiModels.update(model.modelId, { isStale })
  }

  if (!isStale) {
    return {
      isStale: false,
      modelId: model.modelId,
      modelType: model.modelType,
      ageMs,
      degradationType: null,
      warningMessage: null,
    }
  }

  const degradation = getDegradation(model.modelType)

  return {
    isStale: true,
    modelId: model.modelId,
    modelType: model.modelType,
    ageMs,
    degradationType: degradation.type,
    warningMessage: degradation.message,
  }
}

/**
 * Check staleness for all locally stored models.
 * Returns any that are stale. Reports MODEL_STALE_DEGRADED events to Hub for the monthly report.
 */
export async function checkAllModelsStaleness(hubApiBaseUrl?: string): Promise<StalenessCheckResult[]> {
  const models = await db.aiModels.toArray()
  const results: StalenessCheckResult[] = []
  const degradedEvents: Array<{ modelId: string; eventType: ModelUpdateEventType; metadata: Record<string, unknown> }> = []

  for (const model of models) {
    const result = await checkModelStaleness(model.modelId)
    if (result.isStale) {
      results.push(result)
      degradedEvents.push({
        modelId: model.modelId,
        eventType: ModelUpdateEventType.MODEL_STALE_DEGRADED,
        metadata: {
          modelType: model.modelType,
          age: result.ageMs,
          degradationType: result.degradationType,
        },
      })
    }
  }

  // Report staleness events to Hub (best-effort, AC #6)
  if (hubApiBaseUrl && degradedEvents.length > 0) {
    reportEvents(hubApiBaseUrl, degradedEvents).catch(() => {})
  }

  return results
}

/**
 * Check if a specific model type is available and not stale.
 * Used by feature code to gate AI functionality.
 */
export async function isModelAvailable(modelType: AIModelType): Promise<boolean> {
  const models = await db.aiModels.where('modelType').equals(modelType).toArray()
  if (models.length === 0) return false

  const model = models[0]
  const ageMs = Date.now() - new Date(model.downloadedAt).getTime()
  return ageMs <= MODEL_STALENESS_THRESHOLD_MS
}

/**
 * Get the overall staleness banner message if any models are stale.
 * Returns null if all models are current.
 */
export async function getStalenessBannerMessage(): Promise<string | null> {
  const staleModels = await db.aiModels.where('isStale').equals(1).toArray()
  if (staleModels.length === 0) return null
  return 'Model outdated — AI features limited. Connect to Wi-Fi to update.'
}

/**
 * Check drug database specifically — implements CLAUDE.md Rule #3.
 * "Drug interaction checks must never be skipped silently."
 * If stale >45 days: REFUSE checks with explicit warning.
 */
export async function isDrugDatabaseStale(): Promise<{ stale: boolean; warningMessage: string | null }> {
  const models = await db.aiModels
    .where('modelType')
    .equals(AIModelType.DRUG_DB_OFFLINE)
    .toArray()

  if (models.length === 0) {
    return {
      stale: true,
      warningMessage: 'Drug database outdated — interaction check unavailable.',
    }
  }

  const model = models[0]
  const ageMs = Date.now() - new Date(model.downloadedAt).getTime()

  if (ageMs > MODEL_STALENESS_THRESHOLD_MS) {
    return {
      stale: true,
      warningMessage: 'Drug database outdated — interaction check unavailable.',
    }
  }

  return { stale: false, warningMessage: null }
}
