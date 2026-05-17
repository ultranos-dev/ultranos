import { z } from 'zod'

// ============================================================
// AI Model Registry Types — Story 24.4
// Edge AI model versioning, manifest, and update event types.
// NOT PHI — generic AI artifacts shared across all users.
// ============================================================

export enum AIModelType {
  SOAP_MACRO_TEMPLATES = 'SOAP_MACRO_TEMPLATES',
  DRUG_DB_OFFLINE = 'DRUG_DB_OFFLINE',
  TTS_FRAGMENT_BUNDLE = 'TTS_FRAGMENT_BUNDLE',
  ONNX_SOAP_MODEL = 'ONNX_SOAP_MODEL',
}

export enum ModelUpdateEventType {
  MODEL_UPDATE_STARTED = 'MODEL_UPDATE_STARTED',
  MODEL_UPDATE_COMPLETED = 'MODEL_UPDATE_COMPLETED',
  MODEL_UPDATE_FAILED = 'MODEL_UPDATE_FAILED',
  MODEL_STALE_DEGRADED = 'MODEL_STALE_DEGRADED',
}

/** A single entry in the model manifest served by the Hub API. */
export const AIModelManifestEntrySchema = z.object({
  modelId: z.string().min(1),
  modelType: z.nativeEnum(AIModelType),
  currentVersion: z.string().min(1),
  downloadUrl: z.string().url(),
  fileSize: z.number().int().positive(),
  checksum: z.string().regex(/^[a-f0-9]{64}$/, 'Must be SHA-256 hex'),
  releasedAt: z.string().datetime(),
  deltaFromVersion: z.string().nullable(),
})

export type AIModelManifestEntry = z.infer<typeof AIModelManifestEntrySchema>

/** Input for publishing a new model version (admin endpoint). */
export const PublishModelVersionInputSchema = z.object({
  modelId: z.string().min(1),
  modelType: z.nativeEnum(AIModelType),
  version: z.string().min(1),
  downloadUrl: z.string().url(),
  fileSize: z.number().int().positive(),
  checksum: z.string().regex(/^[a-f0-9]{64}$/, 'Must be SHA-256 hex'),
  deltaFromVersion: z.string().nullable().optional(),
})

export type PublishModelVersionInput = z.infer<typeof PublishModelVersionInputSchema>

/** Local model metadata stored on edge devices (Dexie / SQLite). */
export interface LocalModelMetadata {
  modelId: string
  modelType: AIModelType
  version: string
  downloadedAt: string // ISO 8601
  fileSize: number
  checksum: string
  isStale: boolean
}

/** Model update event logged locally and synced to Hub. */
export const ModelUpdateEventSchema = z.object({
  deviceId: z.string().min(1),
  modelId: z.string().min(1),
  eventType: z.nativeEnum(ModelUpdateEventType),
  metadata: z.record(z.unknown()).default({}),
})

export type ModelUpdateEvent = z.infer<typeof ModelUpdateEventSchema>

/** 45-day staleness threshold in milliseconds. */
export const MODEL_STALENESS_THRESHOLD_MS = 45 * 24 * 60 * 60 * 1000

/** Degradation types when a model exceeds the staleness threshold. */
export type ModelDegradationType =
  | 'TEMPLATE_ONLY'        // SOAP_MACRO_TEMPLATES → built-in basic templates
  | 'INTERACTION_REFUSED'  // DRUG_DB_OFFLINE → refuse checks with explicit warning
  | 'TTS_DISABLED'         // TTS_FRAGMENT_BUNDLE → disable offline TTS
  | 'AI_SOAP_DISABLED'     // ONNX_SOAP_MODEL → manual-only SOAP
