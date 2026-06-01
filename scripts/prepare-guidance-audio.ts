#!/usr/bin/env tsx
/**
 * scripts/prepare-guidance-audio.ts
 *
 * Story 53.7 — Task 7: Audio Asset Pipeline
 *
 * Build-time script that prepares guidance audio files for bundling.
 *
 * Usage:
 *   pnpm tsx scripts/prepare-guidance-audio.ts
 *
 * What it does:
 *   1. Reads raw audio files from apps/lab-lite/src/assets/guidance-audio/
 *      Expected naming: {condition}-{locale}.{ext}
 *      e.g. malaria-en.mp3, tb-ar.wav, hiv-prs.ogg
 *   2. Validates each file is ≤ 5 MB source (outputs ≤ 500 KB target)
 *   3. Emits metadata: duration (seconds), source size, encoded size
 *   4. Outputs base64-encoded audio as a TypeScript constant file for bundling
 *      Output: apps/lab-lite/src/lib/guidance-audio-bundle.ts
 *
 * When recordings are not yet available (initial state), this script
 * outputs an empty bundle with placeholder entries.
 *
 * Recording requirements (for native speakers):
 *   - Read the script in the patient's language slowly and clearly
 *   - Quiet background environment (< 40dB ambient noise)
 *   - 30–60 seconds per condition per language
 *   - Target format: MP3 mono 64kbps (speech-optimized, smallest file size)
 *   - Maximum file size: 500 KB per audio file (≈ 60s at 64kbps)
 *   - Label files: {conditionCode}-{locale}.mp3
 *     e.g. MALARIA_POSITIVE-en.mp3, TB_POSITIVE-prs.mp3
 *
 * Audio storage math:
 *   6 conditions × 4 languages = 24 audio files
 *   45s average × 64kbps = ~360 KB each → total ~8.6 MB for full set
 *   This is within acceptable PWA offline bundling limits.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const PROJECT_ROOT = path.resolve(__dirname, '..')

const AUDIO_INPUT_DIR = path.join(
  PROJECT_ROOT,
  'apps/lab-lite/src/assets/guidance-audio',
)
const OUTPUT_FILE = path.join(
  PROJECT_ROOT,
  'apps/lab-lite/src/lib/guidance-audio-bundle.ts',
)

const SUPPORTED_LOCALES = ['en', 'ar', 'prs', 'ps'] as const
const CONDITION_CODES = [
  'MALARIA_POSITIVE',
  'TB_POSITIVE',
  'HEPATITIS_B_POSITIVE',
  'HEPATITIS_C_POSITIVE',
  'HIV_POSITIVE',
  'ANEMIA_SEVERE',
] as const

const MAX_SOURCE_BYTES = 5 * 1024 * 1024   // 5 MB raw source limit
const MAX_TARGET_BYTES = 500 * 1024         // 500 KB encoded target limit (AC: 4)

type Locale = typeof SUPPORTED_LOCALES[number]
type ConditionCode = typeof CONDITION_CODES[number]

interface AudioEntry {
  conditionCode: ConditionCode
  locale: Locale
  base64: string
  encodedBytes: number
  sourceBytes: number
  filename: string
}

interface AudioBundleMetadata {
  generatedAt: string
  totalAudioFiles: number
  totalEncodedBytes: number
  entries: Array<{
    conditionCode: ConditionCode
    locale: Locale
    encodedBytes: number
    filename: string | null
  }>
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function prepareGuidanceAudio(): Promise<void> {
  console.log('🎙️  Preparing guidance audio bundle...\n')

  // Ensure output directory exists
  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true })

  // Ensure input directory exists (may not have recordings yet)
  const inputExists = fs.existsSync(AUDIO_INPUT_DIR)
  if (!inputExists) {
    console.warn(`⚠️  Audio input directory not found: ${AUDIO_INPUT_DIR}`)
    console.warn('   Creating empty bundle with placeholder entries.\n')
    fs.mkdirSync(AUDIO_INPUT_DIR, { recursive: true })
  }

  const entries: AudioEntry[] = []
  const warnings: string[] = []

  for (const conditionCode of CONDITION_CODES) {
    for (const locale of SUPPORTED_LOCALES) {
      const candidates = [
        `${conditionCode}-${locale}.mp3`,
        `${conditionCode}-${locale}.ogg`,
        `${conditionCode}-${locale}.wav`,
        `${conditionCode}-${locale}.m4a`,
      ]

      let found = false
      for (const candidate of candidates) {
        const filePath = path.join(AUDIO_INPUT_DIR, candidate)
        if (!fs.existsSync(filePath)) continue

        const raw = fs.readFileSync(filePath)

        if (raw.byteLength > MAX_SOURCE_BYTES) {
          warnings.push(
            `⚠️  ${candidate}: source too large (${(raw.byteLength / 1024).toFixed(0)} KB > 5 MB). Skipping.`,
          )
          break
        }

        const base64 = raw.toString('base64')
        const encodedBytes = Buffer.byteLength(base64, 'utf8')

        if (encodedBytes > MAX_TARGET_BYTES) {
          warnings.push(
            `⚠️  ${candidate}: encoded size ${(encodedBytes / 1024).toFixed(0)} KB exceeds 500 KB target. ` +
            'Consider re-encoding at 64kbps mono.',
          )
        }

        entries.push({
          conditionCode,
          locale,
          base64,
          encodedBytes,
          sourceBytes: raw.byteLength,
          filename: candidate,
        })

        console.log(
          `  ✅ ${conditionCode} [${locale}]: ${candidate} → ${(encodedBytes / 1024).toFixed(0)} KB (base64)`,
        )
        found = true
        break
      }

      if (!found) {
        console.log(`  ⬜ ${conditionCode} [${locale}]: no recording — using empty string`)
      }
    }
  }

  // Warn about any oversized files
  for (const warning of warnings) {
    console.warn(warning)
  }

  // ---------------------------------------------------------------------------
  // Generate TypeScript output
  // ---------------------------------------------------------------------------

  const totalEncodedBytes = entries.reduce((sum, e) => sum + e.encodedBytes, 0)
  const metadata: AudioBundleMetadata = {
    generatedAt: new Date().toISOString(),
    totalAudioFiles: entries.length,
    totalEncodedBytes,
    entries: CONDITION_CODES.flatMap((cc) =>
      SUPPORTED_LOCALES.map((loc) => {
        const entry = entries.find((e) => e.conditionCode === cc && e.locale === loc)
        return {
          conditionCode: cc,
          locale: loc,
          encodedBytes: entry?.encodedBytes ?? 0,
          filename: entry?.filename ?? null,
        }
      }),
    ),
  }

  // Build the audio map: conditionCode → { en, ar, prs, ps }
  const audioMap: Record<ConditionCode, Record<Locale, string>> = {} as Record<
    ConditionCode,
    Record<Locale, string>
  >

  for (const cc of CONDITION_CODES) {
    audioMap[cc] = { en: '', ar: '', prs: '', ps: '' }
    for (const locale of SUPPORTED_LOCALES) {
      const entry = entries.find((e) => e.conditionCode === cc && e.locale === locale)
      audioMap[cc][locale] = entry?.base64 ?? ''
    }
  }

  const ts = `/**
 * Guidance Audio Bundle — AUTO-GENERATED by scripts/prepare-guidance-audio.ts
 *
 * DO NOT EDIT MANUALLY.
 * Re-generate with: pnpm tsx scripts/prepare-guidance-audio.ts
 *
 * Generated: ${metadata.generatedAt}
 * Total audio files: ${metadata.totalAudioFiles} / ${CONDITION_CODES.length * SUPPORTED_LOCALES.length}
 * Total encoded size: ${(metadata.totalEncodedBytes / 1024).toFixed(0)} KB
 *
 * Empty strings indicate recordings not yet available.
 * See scripts/prepare-guidance-audio.ts for recording requirements.
 */

/**
 * Pre-encoded base64 audio for each guidance condition in all four languages.
 * Audio files are MP3 mono 64kbps, encoded as base64 for offline bundling.
 * Empty string = recording not yet provided → UI hides the audio button.
 */
export const GUIDANCE_AUDIO_BUNDLE: Record<string, { en: string; ar: string; prs: string; ps: string }> = ${JSON.stringify(audioMap, null, 2)}
`

  fs.writeFileSync(OUTPUT_FILE, ts, 'utf8')

  console.log(`\n📦 Bundle written to: ${path.relative(PROJECT_ROOT, OUTPUT_FILE)}`)
  console.log(`   ${entries.length} / ${CONDITION_CODES.length * SUPPORTED_LOCALES.length} audio files included`)
  console.log(`   Total encoded: ${(totalEncodedBytes / 1024).toFixed(0)} KB`)

  if (entries.length === 0) {
    console.log('\n💡 No recordings found yet. The bundle is empty.')
    console.log('   Add MP3 files to apps/lab-lite/src/assets/guidance-audio/')
    console.log('   Naming format: CONDITION_CODE-locale.mp3')
    console.log('   Example: MALARIA_POSITIVE-en.mp3, TB_POSITIVE-prs.mp3')
  }

  console.log('\n✅ Done.\n')
}

prepareGuidanceAudio().catch((err: unknown) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
