'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Award, Download, Share2, QrCode, CircleCheck } from '@ultranos/ui-kit/icons'
import type { DigitalCertificate } from '@/lib/certification-types'

interface CertificateViewerProps {
  certificate: DigitalCertificate
}

export function CertificateViewer({ certificate }: CertificateViewerProps) {
  const t = useTranslations('certification')
  const [downloading, setDownloading] = useState(false)
  const [copied, setCopied] = useState(false)

  async function handleDownload() {
    if (!certificate.pdfBlob) return
    setDownloading(true)
    try {
      const url = URL.createObjectURL(certificate.pdfBlob)
      const a = document.createElement('a')
      a.href = url
      a.download = `certificate-${certificate.verificationCode}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } finally {
      setDownloading(false)
    }
  }

  async function handleCopyVerificationCode() {
    try {
      await navigator.clipboard.writeText(certificate.verificationCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard unavailable — do nothing
    }
  }

  return (
    <div className="space-y-4">
      {/* Certificate preview card */}
      <div className="rounded-lg border-2 border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 p-6 text-center">
        <div className="flex justify-center mb-3">
          <Award size={40} className="text-yellow-500" />
        </div>
        <p className="text-xs font-medium text-blue-600 dark:text-blue-400 uppercase tracking-widest mb-1">
          {t('certificateOf')}
        </p>
        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">
          {certificate.technicianName}
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">
          {t('hasCompletedMilestone')}
        </p>
        <p className="text-base font-semibold text-blue-700 dark:text-blue-300 mb-3">
          {certificate.milestoneName}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {t('issuedOn')}: {new Date(certificate.issuedAt).toLocaleDateString('en-GB', {
            day: 'numeric', month: 'long', year: 'numeric',
          })}
        </p>
      </div>

      {/* Verification code */}
      <div className="flex items-center gap-3 rounded border border-gray-200 dark:border-gray-700 p-3 bg-gray-50 dark:bg-gray-800/50">
        <QrCode size={18} className="text-gray-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-500 dark:text-gray-400">{t('verificationCode')}</p>
          <p className="text-xs font-mono text-gray-700 dark:text-gray-300 truncate">
            {certificate.verificationCode}
          </p>
        </div>
        <button
          onClick={handleCopyVerificationCode}
          className="text-xs text-blue-600 dark:text-blue-400 hover:underline shrink-0"
        >
          {copied ? (
            <span className="flex items-center gap-1">
              <CircleCheck size={12} className="text-green-500" />
              {t('copied')}
            </span>
          ) : t('copy')}
        </button>
      </div>

      {/* Sync status */}
      <p className="text-xs text-gray-400 dark:text-gray-500 text-center">
        {certificate.syncStatus === 'synced'
          ? t('verifiableOnline')
          : t('pendingSync')}
      </p>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={handleDownload}
          disabled={downloading || !certificate.pdfBlob}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Download size={16} />
          {downloading ? t('downloading') : t('downloadPdf')}
        </button>
        <button
          onClick={handleCopyVerificationCode}
          className="flex items-center justify-center gap-2 px-4 py-2 rounded border border-gray-300 dark:border-gray-600 text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
          title={t('copyVerificationCode')}
        >
          <Share2 size={16} />
        </button>
      </div>
    </div>
  )
}
