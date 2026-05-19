/**
 * Hook for FHIR R4 Bundle export — Story 18.8.
 *
 * Orchestrates: bundle building → audit logging → file write → share sheet → cleanup.
 * AC #1: Export button integration
 * AC #5: Share sheet via expo-sharing
 * AC #6: Audit event with counts (no PHI)
 * AC #7: Progress indicator
 * AC #8: Filename ultranos-health-record-{date}.json
 * AC #9: Temp file deleted after sharing
 */
import { useState, useCallback, useRef } from 'react'
import * as FileSystem from 'expo-file-system'
import * as Sharing from 'expo-sharing'
import * as ExpoClipboard from 'expo-clipboard'
import { Alert } from 'react-native'
import type * as SQLite from 'expo-sqlite'
import { useTranslation } from 'react-i18next'
import { buildPatientBundle, countResourceTypes } from '@/data/fhir-bundle-builder'
import { emitAuditEvent } from '@/lib/audit'

export interface UseExportRecordsResult {
  isExporting: boolean
  progressText: string
  exportRecords: (db: SQLite.SQLiteDatabase, patientId: string) => Promise<void>
}

function formatDate(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function useExportRecords(): UseExportRecordsResult {
  const [isExporting, setIsExporting] = useState(false)
  const [progressText, setProgressText] = useState('')
  const exportingRef = useRef(false)
  const { t } = useTranslation()

  const exportRecords = useCallback(async (
    db: SQLite.SQLiteDatabase,
    patientId: string,
  ) => {
    if (exportingRef.current) return
    exportingRef.current = true

    setIsExporting(true)
    setProgressText(t('passport.exportPreparing'))

    let tempFilePath: string | null = null

    try {
      // Build the FHIR Bundle
      const bundle = await buildPatientBundle(db, (msg) => {
        setProgressText(msg)
      })

      // Block export if bundle is empty
      if (bundle.entry.length === 0) {
        Alert.alert(t('passport.exportNoRecords'), t('passport.exportNoRecordsMessage'))
        return
      }

      setProgressText(t('passport.exportPreparingCount', { count: bundle.entry.length }))

      // AC #8: Filename with date
      const filename = `ultranos-health-record-${formatDate()}.json`
      const jsonContent = JSON.stringify(bundle, null, 2)

      // AC #5: Write to temp cache dir, share, then delete
      const canShare = await Sharing.isAvailableAsync()

      if (canShare) {
        const cacheDir = FileSystem.cacheDirectory
        if (!cacheDir) {
          Alert.alert(t('passport.exportFailed'), t('passport.exportStorageError'))
          return
        }

        tempFilePath = `${cacheDir}${filename}`
        await FileSystem.writeAsStringAsync(tempFilePath, jsonContent, {
          encoding: FileSystem.EncodingType.UTF8,
        })

        setProgressText(t('passport.exportOpeningShare'))
        await Sharing.shareAsync(tempFilePath, {
          mimeType: 'application/json',
          dialogTitle: t('passport.exportShareTitle'),
          UTI: 'public.json',
        })
      } else {
        // Fallback: copy to clipboard on simulator/restricted devices
        await ExpoClipboard.setStringAsync(jsonContent)
        Alert.alert(
          t('passport.exportCopied'),
          t('passport.exportCopiedMessage', { count: bundle.entry.length }),
        )
      }

      // Audit logged AFTER share/clipboard completes — no PHI, just counts and types
      const resourceCounts = countResourceTypes(bundle)
      emitAuditEvent({
        action: 'PATIENT_DATA_EXPORT',
        resourceType: 'Bundle',
        resourceId: 'fhir-export',
        patientId,
        outcome: 'success',
        metadata: {
          resourceCount: String(bundle.entry.length),
          resourceTypes: Object.keys(resourceCounts).join(','),
        },
      })
    } catch {
      emitAuditEvent({
        action: 'PATIENT_DATA_EXPORT',
        resourceType: 'Bundle',
        resourceId: 'fhir-export',
        patientId,
        outcome: 'failure',
      })
      Alert.alert(t('passport.exportFailed'), t('passport.exportFailedMessage'))
    } finally {
      // AC #9: Clean up temp file — no persistent storage
      if (tempFilePath) {
        try {
          await FileSystem.deleteAsync(tempFilePath, { idempotent: true })
        } catch {
          // Best-effort cleanup
        }
      }
      exportingRef.current = false
      setIsExporting(false)
      setProgressText('')
    }
  }, [t])

  return { isExporting, progressText, exportRecords }
}
