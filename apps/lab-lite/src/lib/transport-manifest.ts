/**
 * Transport manifest generation for courier sample runs.
 *
 * Generates a manifest listing: transport session ID, courier ID, origin/destination
 * names, pickup timestamp, expected arrival, and sample label numbers + types.
 *
 * DATA MINIMIZATION (CLAUDE.md Rule #7):
 *   The manifest contains label numbers and sample types ONLY.
 *   NO patient names, IDs, diagnoses, or any other PHI.
 *   This is enforced by using FhirSpecimen._ultranos.labSampleId (a label number)
 *   and the sample type display string — not the patient reference.
 */

import type { FhirSpecimen } from '@ultranos/shared-types'
import type { TransportManifest, TransportSession } from '@/types/transport'
import type { LabLocation } from '@/types/lab-network'
import { reportTransportAuditEvent } from '@/lib/audit-client'

/**
 * Build a TransportManifest from a session, its specimen records, and location names.
 *
 * PHI guarantee: only labSampleId (label number) and sample type display string are
 * included per specimen — never patient references, demographics, or diagnoses.
 */
export function generateManifest(
  session: TransportSession,
  samples: FhirSpecimen[],
  locations: { origin: LabLocation; destination: LabLocation },
): TransportManifest {
  // Compute expected arrival: add estimatedTransitMinutes to the pickup timestamp.
  let expectedArrival: string | null = null
  if (session.estimatedTransitMinutes != null) {
    const pickupMs = new Date(session.pickupTimestamp).getTime()
    const arrivalMs = pickupMs + session.estimatedTransitMinutes * 60 * 1000
    expectedArrival = new Date(arrivalMs).toISOString()
  }

  // Map specimens to manifest entries — label + type ONLY, no PHI.
  const manifestSamples = samples.map((specimen) => ({
    labSampleId: specimen._ultranos.labSampleId,
    sampleType: specimen.type?.coding?.[0]?.display ?? 'Unknown',
  }))

  return {
    sessionId: session.id,
    courierId: session.courierId,
    originName: locations.origin.name,
    destinationName: locations.destination.name,
    pickupTimestamp: session.pickupTimestamp,
    expectedArrival,
    samples: manifestSamples,
    sampleCount: session.sampleCount,
  }
}

/**
 * Render a plain-text representation of the manifest for on-screen display.
 *
 * PDF generation is out of scope for this implementation.
 * No PHI is present in the manifest — the function is safe to call for display.
 */
export function renderManifestText(manifest: TransportManifest): string {
  const lines: string[] = [
    'SAMPLE TRANSPORT MANIFEST',
    '=========================',
    `Transport ID: ${manifest.sessionId}`,
    `Courier ID:   ${manifest.courierId}`,
    `From:         ${manifest.originName}`,
    `To:           ${manifest.destinationName}`,
    `Pickup:       ${manifest.pickupTimestamp}`,
    `Est. Arrival: ${manifest.expectedArrival ?? 'Unknown'}`,
    '',
    `SAMPLES (${manifest.sampleCount} total)`,
    '-----------------------------',
    ...manifest.samples.map((s) => `${s.labSampleId}  ${s.sampleType}`),
  ]

  return lines.join('\n')
}

/**
 * Emit a TRANSPORT_MANIFEST_GENERATED audit event.
 *
 * Never throws — manifest generation must not be blocked by audit failures.
 * No PHI in audit metadata — only opaque IDs and a count (CLAUDE.md Rule #6).
 */
export function reportManifestGenerated(
  sessionId: string,
  courierId: string,
  sampleCount: number,
): void {
  reportTransportAuditEvent({
    action: 'TRANSPORT_MANIFEST_GENERATED',
    transportSessionId: sessionId,
    courierId,
    sampleCount,
  })
}
