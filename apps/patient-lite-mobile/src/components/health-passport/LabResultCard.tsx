/**
 * Patient-Lite Lab Result Card — Health Passport Simplified View (Story 52.4 — Task 7)
 *
 * Simplified, plain-language result card using the Patient projection from Story 42.6.
 *
 * Data minimization (CLAUDE.md Rule #7 + AC #6 Story 52.4):
 *   ✅ Test name (human-readable)
 *   ✅ Result summary (plain language)
 *   ✅ Flag level with color indicator
 *   ✅ Date
 *   ✅ Lab name (facility only)
 *   ❌ NO performer identity
 *   ❌ NO annotations
 *   ❌ NO observation references
 *   ❌ NO raw numeric values beyond the summary
 *
 * Low-literacy design: large text, clear icons, color-coded status.
 * Story 11.7 icon-first precedent.
 *
 * AC: 6 (Story 52.4)
 * CLAUDE.md Rule #6: audit every PHI access.
 * CLAUDE.md Rule #7: data minimization.
 */

import React, { useCallback } from 'react'
import {
  View,
  Text,
  Pressable,
  StyleSheet,
} from 'react-native'
import { emitAuditEvent } from '@/lib/audit'
import { useTheme } from '@/theme/ThemeProvider'
import {
  consumerSpacing,
  consumerBorderRadius,
  consumerTypography,
} from '@/theme/consumer'

// ─── Patient projection type ─────────────────────────────────────────────────
// This is the minimal data available in the Patient projection from Story 42.6.
// NO performer, NO annotations, NO raw observation references.

export interface PatientLabResultProjection {
  /** Report UUID — opaque ID for audit logging */
  id: string
  /** Human-readable test name (LOINC display, not raw code) */
  testName: string
  /** Plain-language summary — e.g. "Normal" or "Your hemoglobin is 12.5 g/dL — Normal" */
  resultSummary: string
  /** Flag level from the distribution engine */
  flagLevel: 'normal' | 'abnormal' | 'critical'
  /** Collection or issued date */
  date: string
  /** Facility name only — no individual technician identity */
  labName: string
}

interface LabResultCardProps {
  result: PatientLabResultProjection
  /** Patient UUID — for audit logging only (opaque) */
  patientId: string
}

// ─── Flag-level presentation ─────────────────────────────────────────────────

const FLAG_EMOJI: Record<string, string> = {
  normal: '✅',
  abnormal: '⚠️',
  critical: '🔴',
}

const FLAG_LABEL_EN: Record<string, string> = {
  normal: 'Normal',
  abnormal: 'Needs Attention',
  critical: 'Urgent',
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-u-ca-gregory', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return iso
  }
}

export function LabResultCard({ result, patientId }: LabResultCardProps) {
  const { colors } = useTheme()

  const handlePress = useCallback(() => {
    // AC #10: PATIENT_LAB_RESULT_VIEWED audit event — CLAUDE.md Rule #6
    emitAuditEvent({
      action: 'PHI_READ',
      resourceType: 'DiagnosticReport',
      resourceId: result.id,
      patientId,
      outcome: 'success',
      metadata: { phiAccess: 'patient_lab_result_viewed' },
    })
  }, [result.id, patientId])

  const isCritical = result.flagLevel === 'critical'
  const isAbnormal = result.flagLevel === 'abnormal'
  const flagEmoji = FLAG_EMOJI[result.flagLevel] ?? '✅'
  const flagLabel = FLAG_LABEL_EN[result.flagLevel] ?? 'Normal'

  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.surfaceElevated,
          borderColor: isCritical
            ? colors.error
            : isAbnormal
            ? '#f59e0b' // amber-400
            : colors.border,
          shadowColor: colors.shadow,
          opacity: pressed ? 0.92 : 1,
        },
        isCritical && { borderStartWidth: 4, borderStartColor: colors.error },
        isAbnormal && { borderStartWidth: 4, borderStartColor: '#f59e0b' },
      ]}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`${result.testName}. ${flagLabel}. ${formatDate(result.date)}.`}
      testID={`lab-result-card-${result.id}`}
    >
      {/* Flag indicator row */}
      <View style={styles.flagRow}>
        <Text style={styles.flagEmoji} accessibilityElementsHidden>
          {flagEmoji}
        </Text>
        <Text
          style={[
            styles.flagLabel,
            {
              color: isCritical
                ? colors.error
                : isAbnormal
                ? '#d97706' // amber-600
                : 'hsl(160, 60%, 35%)', // green-700
            },
          ]}
        >
          {flagLabel}
        </Text>
      </View>

      {/* Test name — large, bold */}
      <Text
        style={[styles.testName, { color: colors.textPrimary }]}
        accessibilityRole="header"
      >
        {result.testName}
      </Text>

      {/* Plain-language result summary */}
      <Text style={[styles.resultSummary, { color: colors.textSecondary }]}>
        {result.resultSummary}
      </Text>

      {/* Date + lab name */}
      <View style={styles.metaRow}>
        <Text style={[styles.metaText, { color: colors.textMuted }]}>
          {formatDate(result.date)}
        </Text>
        <Text style={[styles.separator, { color: colors.textMuted }]}>·</Text>
        <Text style={[styles.metaText, { color: colors.textMuted }]}>
          {result.labName}
        </Text>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: consumerBorderRadius.card,
    borderWidth: 1,
    padding: consumerSpacing.cardPadding,
    marginBottom: 10,
    gap: 6,
    // Minimum touch target 44px
    minHeight: 80,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  flagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  flagEmoji: {
    fontSize: 18,
    lineHeight: 22,
  },
  flagLabel: {
    fontSize: consumerTypography.captionSize,
    fontWeight: consumerTypography.fontWeightHeader,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  testName: {
    fontSize: consumerTypography.subheaderSize,
    fontWeight: consumerTypography.fontWeightHeader,
    lineHeight: 24,
  },
  resultSummary: {
    fontSize: consumerTypography.bodySize,
    lineHeight: 22,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  metaText: {
    fontSize: consumerTypography.captionSize,
  },
  separator: {
    fontSize: consumerTypography.captionSize,
  },
})
