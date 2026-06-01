/**
 * Digital Certificate Generator — Story 46.6
 *
 * Generates PDF certificates client-side using jsPDF (offline-capable).
 * QR codes embed a compact JSON payload — no PHI per CLAUDE.md.
 */

import { v4 as uuidv4 } from 'uuid'
import type { CertificationPathway, DigitalCertificate, CertificateQrPayload } from '@/lib/certification-types'

interface GenerateCertificateInput {
  technicianId: string
  technicianName: string
  pathway: CertificationPathway
  milestoneName: string
}

/**
 * Generate a QR code data URL from a compact payload string.
 * Uses the `qrcode` npm package — pure JS, offline-capable.
 */
async function generateQrDataUrl(payload: string): Promise<string> {
  const QRCode = (await import('qrcode')).default
  return QRCode.toDataURL(payload, {
    width: 200,
    margin: 2,
    color: { dark: '#000000', light: '#ffffff' },
  })
}

/**
 * Generate a PDF certificate using jsPDF and return as a Blob.
 * Includes technician name, pathway, milestone, issue date, and QR code.
 * No PHI — verificationCode maps to Hub registry without exposing clinical data.
 */
async function generatePdfBlob(
  technicianName: string,
  technicianId: string,
  pathwayName: string,
  milestoneName: string,
  issuedAt: string,
  verificationCode: string,
  qrDataUrl: string,
): Promise<Blob> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a5' })

  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()

  // Background color
  doc.setFillColor(248, 250, 252)
  doc.rect(0, 0, pageW, pageH, 'F')

  // Border
  doc.setDrawColor(59, 130, 246) // blue-500
  doc.setLineWidth(1.5)
  doc.rect(8, 8, pageW - 16, pageH - 16, 'S')

  // Header band
  doc.setFillColor(59, 130, 246)
  doc.rect(8, 8, pageW - 16, 20, 'F')

  // Header text
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text('ULTRANOS', pageW / 2, 20, { align: 'center' })
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.text('Certificate of Achievement', pageW / 2, 25, { align: 'center' })

  // Body
  doc.setTextColor(30, 41, 59) // slate-800

  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text('This certifies that', pageW / 2, 40, { align: 'center' })

  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text(technicianName, pageW / 2, 50, { align: 'center' })

  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text('has successfully completed', pageW / 2, 58, { align: 'center' })

  doc.setFontSize(13)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(59, 130, 246)
  doc.text(milestoneName, pageW / 2, 67, { align: 'center' })

  doc.setFontSize(9)
  doc.setFont('helvetica', 'italic')
  doc.setTextColor(100, 116, 139) // slate-500
  doc.text(`Pathway: ${pathwayName}`, pageW / 2, 74, { align: 'center' })

  // Divider
  doc.setDrawColor(226, 232, 240)
  doc.setLineWidth(0.5)
  doc.line(20, 79, pageW - 20, 79)

  // Issue date + verification code
  const issued = new Date(issuedAt).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  })
  doc.setTextColor(30, 41, 59)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.text(`Issued: ${issued}`, 20, 87)
  doc.text(`Verification: ${verificationCode}`, 20, 92)

  // QR code — added only when data URL is available
  if (qrDataUrl) {
    try {
      doc.addImage(qrDataUrl, 'PNG', pageW - 45, 78, 30, 30)
    } catch {
      // QR image unavailable — continue without it
    }
  }

  // Footer
  doc.setFontSize(7)
  doc.setTextColor(148, 163, 184) // slate-400
  doc.text('Scan QR code to verify this certificate at the Ultranos Hub', pageW / 2, pageH - 12, {
    align: 'center',
  })
  doc.text(`Tech ID: ${technicianId}`, pageW / 2, pageH - 8, { align: 'center' })

  return doc.output('blob')
}

/**
 * Generate a complete digital certificate: PDF blob + verification QR.
 * Returns a DigitalCertificate ready to be stored in Dexie.
 */
export async function generateCertificate(input: GenerateCertificateInput): Promise<DigitalCertificate> {
  const { technicianId, technicianName, pathway, milestoneName } = input

  const certId = uuidv4()
  const verificationCode = uuidv4()
  const issuedAt = new Date().toISOString()

  const qrPayload: CertificateQrPayload = {
    certId,
    techId: technicianId,
    milestone: milestoneName,
    issuedAt,
    verificationCode,
  }

  // Generate QR first, then embed into PDF
  const qrDataUrl = await generateQrDataUrl(JSON.stringify(qrPayload))
  const pdfBlob = await generatePdfBlob(
    technicianName,
    technicianId,
    pathway.name,
    milestoneName,
    issuedAt,
    verificationCode,
    qrDataUrl,
  )

  return {
    id: certId,
    technicianId,
    technicianName,
    pathwayId: pathway.id,
    milestoneName,
    issuedAt,
    verificationCode,
    pdfBlob,
    syncStatus: 'pending',
  }
}
