import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AIModelType, MODEL_STALENESS_THRESHOLD_MS } from '@ultranos/shared-types'

// Mock Dexie db
const mockAiModels = {
  get: vi.fn(),
  toArray: vi.fn(),
  where: vi.fn(),
  update: vi.fn().mockResolvedValue(undefined),
}

vi.mock('../lib/db', () => ({
  db: {
    aiModels: mockAiModels,
  },
}))

const {
  checkModelStaleness,
  checkAllModelsStaleness: _checkAllModelsStaleness,
  isModelAvailable,
  getStalenessBannerMessage,
  isDrugDatabaseStale,
} = await import('../lib/model-staleness-checker')

beforeEach(() => {
  vi.clearAllMocks()
  // Setup default where chain
  mockAiModels.where.mockReturnValue({
    equals: vi.fn().mockReturnValue({
      toArray: vi.fn().mockResolvedValue([]),
    }),
  })
})

describe('checkModelStaleness', () => {
  it('returns stale=true when model not found', async () => {
    mockAiModels.get.mockResolvedValueOnce(undefined)

    const result = await checkModelStaleness('non-existent')
    expect(result.isStale).toBe(true)
    expect(result.warningMessage).toContain('not available')
  })

  it('returns stale=false for a fresh model (< 45 days)', async () => {
    mockAiModels.get.mockResolvedValueOnce({
      modelId: 'soap-macros',
      modelType: AIModelType.SOAP_MACRO_TEMPLATES,
      version: '2.0.0',
      downloadedAt: new Date().toISOString(), // Just downloaded
      isStale: false,
    })

    const result = await checkModelStaleness('soap-macros')
    expect(result.isStale).toBe(false)
    expect(result.degradationType).toBeNull()
    expect(result.warningMessage).toBeNull()
  })

  it('returns stale=true for model > 45 days old (AC #4)', async () => {
    const oldDate = new Date(Date.now() - MODEL_STALENESS_THRESHOLD_MS - 1000).toISOString()
    mockAiModels.get.mockResolvedValueOnce({
      modelId: 'soap-macros',
      modelType: AIModelType.SOAP_MACRO_TEMPLATES,
      version: '2.0.0',
      downloadedAt: oldDate,
      isStale: false,
    })

    const result = await checkModelStaleness('soap-macros')
    expect(result.isStale).toBe(true)
    expect(result.degradationType).toBe('TEMPLATE_ONLY')
    expect(result.warningMessage).toContain('built-in templates')
  })

  it('DRUG_DB_OFFLINE stale → INTERACTION_REFUSED (CLAUDE.md Rule #3)', async () => {
    const oldDate = new Date(Date.now() - MODEL_STALENESS_THRESHOLD_MS - 1000).toISOString()
    mockAiModels.get.mockResolvedValueOnce({
      modelId: 'drug-db-offline',
      modelType: AIModelType.DRUG_DB_OFFLINE,
      version: '5.0.0',
      downloadedAt: oldDate,
      isStale: false,
    })

    const result = await checkModelStaleness('drug-db-offline')
    expect(result.isStale).toBe(true)
    expect(result.degradationType).toBe('INTERACTION_REFUSED')
    expect(result.warningMessage).toContain('Drug database outdated')
    expect(result.warningMessage).toContain('interaction check unavailable')
  })

  it('TTS_FRAGMENT_BUNDLE stale → TTS_DISABLED', async () => {
    const oldDate = new Date(Date.now() - MODEL_STALENESS_THRESHOLD_MS - 1000).toISOString()
    mockAiModels.get.mockResolvedValueOnce({
      modelId: 'tts-bundle',
      modelType: AIModelType.TTS_FRAGMENT_BUNDLE,
      version: '1.0.0',
      downloadedAt: oldDate,
      isStale: false,
    })

    const result = await checkModelStaleness('tts-bundle')
    expect(result.isStale).toBe(true)
    expect(result.degradationType).toBe('TTS_DISABLED')
  })

  it('ONNX_SOAP_MODEL stale → AI_SOAP_DISABLED', async () => {
    const oldDate = new Date(Date.now() - MODEL_STALENESS_THRESHOLD_MS - 1000).toISOString()
    mockAiModels.get.mockResolvedValueOnce({
      modelId: 'onnx-soap',
      modelType: AIModelType.ONNX_SOAP_MODEL,
      version: '1.0.0',
      downloadedAt: oldDate,
      isStale: false,
    })

    const result = await checkModelStaleness('onnx-soap')
    expect(result.isStale).toBe(true)
    expect(result.degradationType).toBe('AI_SOAP_DISABLED')
  })

  it('updates isStale flag in Dexie when staleness state changes', async () => {
    const oldDate = new Date(Date.now() - MODEL_STALENESS_THRESHOLD_MS - 1000).toISOString()
    mockAiModels.get.mockResolvedValueOnce({
      modelId: 'soap-macros',
      modelType: AIModelType.SOAP_MACRO_TEMPLATES,
      version: '2.0.0',
      downloadedAt: oldDate,
      isStale: false, // Was not stale, now is
    })

    await checkModelStaleness('soap-macros')
    expect(mockAiModels.update).toHaveBeenCalledWith('soap-macros', { isStale: true })
  })
})

describe('isModelAvailable', () => {
  it('returns false when no model of that type exists', async () => {
    mockAiModels.where.mockReturnValue({
      equals: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([]),
      }),
    })

    const result = await isModelAvailable(AIModelType.ONNX_SOAP_MODEL)
    expect(result).toBe(false)
  })

  it('returns true for a fresh model', async () => {
    mockAiModels.where.mockReturnValue({
      equals: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([{
          modelId: 'soap-macros',
          modelType: AIModelType.SOAP_MACRO_TEMPLATES,
          downloadedAt: new Date().toISOString(),
        }]),
      }),
    })

    const result = await isModelAvailable(AIModelType.SOAP_MACRO_TEMPLATES)
    expect(result).toBe(true)
  })

  it('returns false for a stale model', async () => {
    const oldDate = new Date(Date.now() - MODEL_STALENESS_THRESHOLD_MS - 1000).toISOString()
    mockAiModels.where.mockReturnValue({
      equals: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([{
          modelId: 'drug-db',
          modelType: AIModelType.DRUG_DB_OFFLINE,
          downloadedAt: oldDate,
        }]),
      }),
    })

    const result = await isModelAvailable(AIModelType.DRUG_DB_OFFLINE)
    expect(result).toBe(false)
  })
})

describe('getStalenessBannerMessage', () => {
  it('returns null when no stale models (AC #5)', async () => {
    mockAiModels.where.mockReturnValue({
      equals: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([]),
      }),
    })

    const result = await getStalenessBannerMessage()
    expect(result).toBeNull()
  })

  it('returns warning message when stale models exist (AC #5)', async () => {
    mockAiModels.where.mockReturnValue({
      equals: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([{ modelId: 'soap-macros' }]),
      }),
    })

    const result = await getStalenessBannerMessage()
    expect(result).toBe('Model outdated — AI features limited. Connect to Wi-Fi to update.')
  })
})

describe('isDrugDatabaseStale', () => {
  it('returns stale=true when drug database not downloaded', async () => {
    mockAiModels.where.mockReturnValue({
      equals: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([]),
      }),
    })

    const result = await isDrugDatabaseStale()
    expect(result.stale).toBe(true)
    expect(result.warningMessage).toBe('Drug database outdated — interaction check unavailable.')
  })

  it('returns stale=false for fresh drug database', async () => {
    mockAiModels.where.mockReturnValue({
      equals: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([{
          modelId: 'drug-db',
          modelType: AIModelType.DRUG_DB_OFFLINE,
          downloadedAt: new Date().toISOString(),
        }]),
      }),
    })

    const result = await isDrugDatabaseStale()
    expect(result.stale).toBe(false)
    expect(result.warningMessage).toBeNull()
  })

  it('returns stale=true with explicit warning when drug DB > 45 days old (NFR12)', async () => {
    const oldDate = new Date(Date.now() - MODEL_STALENESS_THRESHOLD_MS - 1000).toISOString()
    mockAiModels.where.mockReturnValue({
      equals: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([{
          modelId: 'drug-db',
          modelType: AIModelType.DRUG_DB_OFFLINE,
          downloadedAt: oldDate,
        }]),
      }),
    })

    const result = await isDrugDatabaseStale()
    expect(result.stale).toBe(true)
    expect(result.warningMessage).toContain('Drug database outdated')
    expect(result.warningMessage).toContain('interaction check unavailable')
  })
})
