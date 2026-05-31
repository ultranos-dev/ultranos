#!/usr/bin/env tsx
/**
 * optimize-atlas-images.ts — Build-time image optimization pipeline (Story 53.2)
 *
 * PURPOSE
 * -------
 * Converts photomicrograph source images into base64-encoded WebP strings
 * suitable for storage in Dexie (offline PWA) and embeds them into atlas-seed-data.ts.
 *
 * WHEN TO RUN
 * -----------
 * Run this script when clinical partners deliver new photomicrographs:
 *   npx tsx scripts/optimize-atlas-images.ts
 *
 * PREREQUISITES
 * -------------
 *   npm install -D sharp tsx
 *
 * INPUT
 * -----
 * Place source images in:
 *   apps/lab-lite/src/assets/atlas/<ENTRY_ID>.<ext>
 *
 * File naming convention:
 *   <ENTRY_ID>.<ext>   e.g.  ATLAS-BC-NORM-NEUT-001.jpg
 *
 * Supported formats: JPEG, PNG, TIFF, WebP (anything sharp supports)
 *
 * OUTPUT SPECS (per image)
 * ------------------------
 * Full image:   WebP, max 800×600 px, quality 82, max 200 KB
 * Thumbnail:    WebP, 200×150 px, quality 75, max 20 KB
 *
 * The script replaces the `image`, `thumbnailImage`, and `imageMimeType`
 * fields on matching entries in atlas-seed-data.ts and clears `placeholder: true`.
 *
 * STORAGE NOTES
 * -------------
 * Base64 adds ~33% overhead versus raw bytes. At ≤200 KB per image and ~40 entries,
 * total Dexie atlas storage is ~10 MB — within PWA IndexedDB budgets.
 * If the atlas grows beyond ~150 entries, migrate from base64 strings to
 * IndexedDB Blob storage (Dexie table with `Blob` column type).
 *
 * ADDING A NEW ENTRY
 * ------------------
 * 1. Add the entry definition to atlas-seed-data.ts (use PLACEHOLDER_JPEG constant).
 * 2. Name your source image <ENTRY_ID>.<ext> and place it in src/assets/atlas/.
 * 3. Run this script.
 * 4. Commit the updated atlas-seed-data.ts — CI will pick it up.
 *
 * AUTHOR CHECKLIST
 * ----------------
 * Before shipping real images, verify:
 *   [ ] Image is de-identified — no patient name, DOB, or MRN visible.
 *   [ ] Image copyright has been cleared by clinical partners.
 *   [ ] Author attribution (name, credentials, institution) is updated in seed data.
 *   [ ] lastReviewedAt is updated to today's date.
 *   [ ] placeholder flag is removed (this script does it automatically).
 */

import * as fs from 'node:fs/promises'
import * as path from 'node:path'

// sharp is a peer dependency — installed by contributor before running the script.
// We import dynamically so that the rest of the codebase does not require sharp at build time.
async function importSharp() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return (await import('sharp')).default
  } catch {
    console.error(
      '❌  sharp is not installed. Run: npm install -D sharp\n' +
        '   (Only needed for this build-time script — not a runtime dependency.)',
    )
    process.exit(1)
  }
}

const ASSETS_DIR = path.resolve(
  __dirname,
  '../apps/lab-lite/src/assets/atlas',
)
const SEED_FILE = path.resolve(
  __dirname,
  '../apps/lab-lite/src/lib/atlas-seed-data.ts',
)

const FULL_MAX_WIDTH = 800
const FULL_MAX_HEIGHT = 600
const FULL_QUALITY = 82
const FULL_MAX_BYTES = 200 * 1024  // 200 KB

const THUMB_WIDTH = 200
const THUMB_HEIGHT = 150
const THUMB_QUALITY = 75
const THUMB_MAX_BYTES = 20 * 1024  // 20 KB

interface ProcessResult {
  entryId: string
  fullBase64: string
  thumbBase64: string
  fullBytes: number
  thumbBytes: number
}

async function processImage(
  sharp: Awaited<ReturnType<typeof importSharp>>,
  imagePath: string,
  entryId: string,
): Promise<ProcessResult> {
  // Full image — resize to fit within 800×600, convert to WebP
  let fullBuffer = await sharp(imagePath)
    .resize(FULL_MAX_WIDTH, FULL_MAX_HEIGHT, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: FULL_QUALITY })
    .toBuffer()

  // If still over budget, reduce quality iteratively
  let quality = FULL_QUALITY
  while (fullBuffer.length > FULL_MAX_BYTES && quality > 50) {
    quality -= 5
    fullBuffer = await sharp(imagePath)
      .resize(FULL_MAX_WIDTH, FULL_MAX_HEIGHT, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality })
      .toBuffer()
  }

  if (fullBuffer.length > FULL_MAX_BYTES) {
    console.warn(
      `⚠️  ${entryId}: full image is ${(fullBuffer.length / 1024).toFixed(1)} KB ` +
        `(budget: ${FULL_MAX_BYTES / 1024} KB). Consider providing a smaller source image.`,
    )
  }

  // Thumbnail — fixed 200×150, cover crop, WebP
  let thumbBuffer = await sharp(imagePath)
    .resize(THUMB_WIDTH, THUMB_HEIGHT, { fit: 'cover' })
    .webp({ quality: THUMB_QUALITY })
    .toBuffer()

  // If thumbnail is over budget, reduce quality
  let thumbQuality = THUMB_QUALITY
  while (thumbBuffer.length > THUMB_MAX_BYTES && thumbQuality > 40) {
    thumbQuality -= 5
    thumbBuffer = await sharp(imagePath)
      .resize(THUMB_WIDTH, THUMB_HEIGHT, { fit: 'cover' })
      .webp({ quality: thumbQuality })
      .toBuffer()
  }

  return {
    entryId,
    fullBase64: fullBuffer.toString('base64'),
    thumbBase64: thumbBuffer.toString('base64'),
    fullBytes: fullBuffer.length,
    thumbBytes: thumbBuffer.length,
  }
}

async function main() {
  console.log('🔬  Atlas image optimization pipeline')
  console.log(`   Source dir:  ${ASSETS_DIR}`)
  console.log(`   Seed file:   ${SEED_FILE}`)
  console.log('')

  // Check assets directory exists
  try {
    await fs.access(ASSETS_DIR)
  } catch {
    console.error(`❌  Assets directory not found: ${ASSETS_DIR}`)
    console.error(
      '   Create the directory and place photomicrographs there before running.',
    )
    process.exit(1)
  }

  const sharp = await importSharp()

  // Discover source images
  const files = await fs.readdir(ASSETS_DIR)
  const imageFiles = files.filter((f) =>
    /\.(jpe?g|png|tiff?|webp)$/i.test(f),
  )

  if (imageFiles.length === 0) {
    console.log('ℹ️  No source images found in assets directory. Nothing to do.')
    return
  }

  console.log(`Found ${imageFiles.length} source image(s):\n`)

  // Process each image
  const results: ProcessResult[] = []
  for (const file of imageFiles) {
    const ext = path.extname(file)
    const entryId = path.basename(file, ext)
    const imagePath = path.join(ASSETS_DIR, file)

    process.stdout.write(`  Processing ${entryId}...`)
    try {
      const result = await processImage(sharp, imagePath, entryId)
      results.push(result)
      console.log(
        ` ✓  full ${(result.fullBytes / 1024).toFixed(1)} KB, thumb ${(result.thumbBytes / 1024).toFixed(1)} KB`,
      )
    } catch (err) {
      console.error(` ✗  failed: ${(err as Error).message}`)
    }
  }

  if (results.length === 0) {
    console.log('\nNo images processed successfully.')
    return
  }

  // Patch atlas-seed-data.ts
  let seedContent = await fs.readFile(SEED_FILE, 'utf-8')

  for (const result of results) {
    const { entryId, fullBase64, thumbBase64 } = result

    // Match the entry by its ID string, then replace image/thumbnail fields.
    // Strategy: locate the entry's id field and replace fields within the same entry block.
    // This is a conservative string-patch — not AST-based, but safe for the known file structure.

    const idPattern = new RegExp(
      `(id:\\s*'${escapeRegex(entryId)}'[\\s\\S]*?)(image:\\s*[^,\\n]+)`,
    )
    if (idPattern.test(seedContent)) {
      seedContent = seedContent.replace(
        idPattern,
        (match, before) =>
          `${before}image: '${fullBase64}'`,
      )
    } else {
      console.warn(`  ⚠️  Could not find entry with id '${entryId}' in seed data — skipping.`)
      continue
    }

    // Replace thumbnailImage
    const thumbPattern = new RegExp(
      `(id:\\s*'${escapeRegex(entryId)}'[\\s\\S]*?)(thumbnailImage:\\s*[^,\\n]+)`,
    )
    seedContent = seedContent.replace(
      thumbPattern,
      (match, before) =>
        `${before}thumbnailImage: '${thumbBase64}'`,
    )

    // Set imageMimeType to image/webp
    const mimePattern = new RegExp(
      `(id:\\s*'${escapeRegex(entryId)}'[\\s\\S]*?)(imageMimeType:\\s*'[^']+')`,
    )
    seedContent = seedContent.replace(
      mimePattern,
      (match, before) => `${before}imageMimeType: 'image/webp'`,
    )

    // Remove placeholder: true flag
    const placeholderPattern = new RegExp(
      `(id:\\s*'${escapeRegex(entryId)}'[\\s\\S]*?)(,?\\s*placeholder:\\s*true)`,
    )
    seedContent = seedContent.replace(placeholderPattern, '$1')
  }

  await fs.writeFile(SEED_FILE, seedContent, 'utf-8')
  console.log(`\n✅  atlas-seed-data.ts updated — ${results.length} image(s) embedded.`)
  console.log('   Commit the updated seed file and re-run `pnpm build` to bundle the atlas.')
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
