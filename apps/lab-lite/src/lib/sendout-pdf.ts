/**
 * Send-Out PDF Generation — Story 54.4 / Task 11
 *
 * Generates printable referral forms and shipping manifests as plain HTML blobs
 * (browser-printable via window.print()). A dedicated PDF library (jsPDF, react-pdf)
 * can be substituted later without API changes.
 *
 * Data minimization: referral forms contain ONLY patient first name + age (CLAUDE.md Rule #7).
 * No PHI beyond first name + age appears in any generated document.
 */

import type { ReferralForm, ShippingManifest } from '@/types/reference-lab'

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Generate a printable referral form as an HTML Blob.
 * Contains ONLY: patient first name + age, sample type, test requested,
 * clinical context, originating lab, reference lab, and date sent.
 * NO additional PHI (CLAUDE.md Rule #7).
 */
export function renderReferralFormPDF(referralForm: ReferralForm): Blob {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Referral Form — ${escapeHtml(referralForm.id)}</title>
  <style>
    body { font-family: Arial, sans-serif; font-size: 12pt; margin: 2cm; }
    h1 { font-size: 16pt; }
    table { width: 100%; border-collapse: collapse; margin-top: 1em; }
    td, th { border: 1px solid #000; padding: 6px 10px; text-align: left; }
    th { background: #eee; }
    .footer { margin-top: 2em; font-size: 9pt; color: #555; }
  </style>
</head>
<body>
  <h1>Laboratory Referral Form</h1>
  <p><strong>Referral ID:</strong> ${escapeHtml(referralForm.id)}</p>
  <p><strong>Date Sent:</strong> ${escapeHtml(new Date(referralForm.dateSent).toLocaleDateString())}</p>

  <h2>Patient Information</h2>
  <table>
    <tr><th>First Name</th><td>${escapeHtml(referralForm.patientFirstName)}</td></tr>
    <tr><th>Age</th><td>${referralForm.patientAge} years</td></tr>
    <tr><th>Sample Type</th><td>${escapeHtml(referralForm.sampleType)}</td></tr>
  </table>

  <h2>Test Requested</h2>
  <table>
    <tr><th>LOINC Code</th><td>${escapeHtml(referralForm.testRequested.loincCode)}</td></tr>
    <tr><th>Test Name</th><td>${escapeHtml(referralForm.testRequested.loincDisplay)}</td></tr>
  </table>

  <h2>Clinical Context</h2>
  <p>${escapeHtml(referralForm.clinicalContext)}</p>

  <h2>Lab Information</h2>
  <table>
    <tr><th>Sending Lab</th><td>${escapeHtml(referralForm.originatingLabName)}</td></tr>
    <tr><th>Reference Lab</th><td>${escapeHtml(referralForm.referenceLabName)}</td></tr>
    <tr><th>Accreditation #</th><td>${escapeHtml(referralForm.referenceLabAccreditationNumber)}</td></tr>
  </table>

  <div class="footer">
    This referral contains minimal patient data per data minimization policy.
    Patient first name and age only — no additional PHI.
  </div>
</body>
</html>`

  return new Blob([html], { type: 'text/html' })
}

/**
 * Generate a printable shipping manifest as an HTML Blob.
 * Lists all samples in the shipment with tracking (send-out) IDs and test names.
 * No PHI — sample IDs are opaque UUIDs, test names are LOINC display names.
 */
export function renderShippingManifestPDF(manifest: ShippingManifest): Blob {
  const rows = manifest.items
    .map(
      (item, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${escapeHtml(item.sendOutId)}</td>
      <td>${escapeHtml(item.sampleId)}</td>
      <td>${escapeHtml(item.loincCode)}</td>
      <td>${escapeHtml(item.loincDisplay)}</td>
    </tr>`,
    )
    .join('\n')

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Shipping Manifest — ${escapeHtml(manifest.id)}</title>
  <style>
    body { font-family: Arial, sans-serif; font-size: 12pt; margin: 2cm; }
    h1 { font-size: 16pt; }
    table { width: 100%; border-collapse: collapse; margin-top: 1em; }
    td, th { border: 1px solid #000; padding: 6px 10px; text-align: left; }
    th { background: #eee; }
  </style>
</head>
<body>
  <h1>Shipping Manifest</h1>
  <p><strong>Manifest ID:</strong> ${escapeHtml(manifest.id)}</p>
  <p><strong>Reference Lab:</strong> ${escapeHtml(manifest.referenceLabName)}</p>
  <p><strong>Date Created:</strong> ${escapeHtml(new Date(manifest.createdAt).toLocaleDateString())}</p>
  <p><strong>Total Samples:</strong> ${manifest.items.length}</p>

  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Send-Out ID</th>
        <th>Sample ID</th>
        <th>LOINC Code</th>
        <th>Test Name</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
</body>
</html>`

  return new Blob([html], { type: 'text/html' })
}
