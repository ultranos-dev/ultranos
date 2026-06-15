/**
 * Certification Pathway Sync — Story 46.6
 *
 * Pull pathway definitions from Hub (pathways are Hub-managed).
 * Push progress records and certificate metadata (not PDF blob) to Hub.
 *
 * Follows the existing sync cycle pattern used by other sync modules.
 * All operations are best-effort; offline gracefully does nothing.
 */

import { getDb } from '@/lib/db'
import type { CertificationPathway, TechnicianProgress, DigitalCertificate } from '@/lib/certification-types'

// ---------------------------------------------------------------------------
// Pull: pathway definitions from Hub
// ---------------------------------------------------------------------------

/**
 * Fetch certification pathway definitions from the Hub API and upsert locally.
 * Hub endpoint: GET /api/certification/pathways
 */
export async function syncCertificationPathways(): Promise<void> {
  let response: Response
  try {
    response = await fetch('/api/certification/pathways', {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    // Network unavailable — skip silently (offline-first)
    return
  }

  if (!response.ok) return

  const pathways: CertificationPathway[] = await response.json()
  if (!Array.isArray(pathways) || pathways.length === 0) return

  const db = getDb()
  await db.certification_pathways.bulkPut(pathways)
}

// ---------------------------------------------------------------------------
// Push: progress records to Hub
// ---------------------------------------------------------------------------

/**
 * Push pending TechnicianProgress records to Hub.
 * Hub endpoint: PUT /api/certification/progress/:id
 */
async function pushPendingProgress(): Promise<void> {
  const db = getDb()
  const pending = await db.technician_progress
    .where('syncStatus')
    .equals('pending')
    .toArray()

  if (pending.length === 0) return

  await Promise.allSettled(
    pending.map(async (progress) => {
      try {
        const res = await fetch(`/api/certification/progress/${progress.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(progressForSync(progress)),
          signal: AbortSignal.timeout(8_000),
        })
        if (res.ok) {
          await db.technician_progress.update(progress.id, { syncStatus: 'synced' })
        }
      } catch {
        // Leave as pending — will retry next sync cycle
      }
    }),
  )
}

/** Strip non-serialisable fields before sending to Hub. */
function progressForSync(p: TechnicianProgress) {
  return {
    id: p.id,
    technicianId: p.technicianId,
    pathwayId: p.pathwayId,
    milestoneProgress: p.milestoneProgress,
    overallPercent: p.overallPercent,
    currentLevel: p.currentLevel,
    updatedAt: p.updatedAt,
  }
}

// ---------------------------------------------------------------------------
// Push: certificate metadata (not PDF blob) to Hub verification registry
// ---------------------------------------------------------------------------

/**
 * Push pending certificate metadata to Hub.
 * Hub endpoint: POST /api/certification/certificates
 * The PDF blob is NEVER sent — only the metadata for the verification registry.
 */
async function pushPendingCertificates(): Promise<void> {
  const db = getDb()
  const pending = await db.digital_certificates
    .where('syncStatus')
    .equals('pending')
    .toArray()

  if (pending.length === 0) return

  await Promise.allSettled(
    pending.map(async (cert) => {
      try {
        const res = await fetch('/api/certification/certificates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(certMetadataForSync(cert)),
          signal: AbortSignal.timeout(8_000),
        })
        if (res.ok) {
          await db.digital_certificates.update(cert.id, { syncStatus: 'synced' })
        }
      } catch {
        // Leave as pending — will retry next sync cycle
      }
    }),
  )
}

/** Serialize certificate metadata for sync — PDF blob explicitly excluded. */
function certMetadataForSync(cert: DigitalCertificate) {
  return {
    id: cert.id,
    technicianId: cert.technicianId,
    technicianName: cert.technicianName,
    pathwayId: cert.pathwayId,
    milestoneName: cert.milestoneName,
    issuedAt: cert.issuedAt,
    verificationCode: cert.verificationCode,
    // pdfBlob intentionally omitted
  }
}

// ---------------------------------------------------------------------------
// Public entry point — called from the main sync cycle
// ---------------------------------------------------------------------------

export async function runCertificationSync(): Promise<void> {
  await syncCertificationPathways()
  await pushPendingProgress()
  await pushPendingCertificates()
}
