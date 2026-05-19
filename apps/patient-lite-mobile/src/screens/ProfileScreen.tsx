import { useState, useCallback, useMemo } from 'react'
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native'
import type { FhirPatient } from '@ultranos/shared-types'
import { PatientQRCode } from '@/components/PatientQRCode'
import { PremiumGate } from '@/components/PremiumGate'
import { usePatientTierStore } from '@/stores/patient-tier-store'
import {
  consumerSpacing,
  consumerBorderRadius,
  consumerTypography,
} from '@/theme/consumer'
import { useTheme } from '@/theme/ThemeProvider'
import { useTranslation } from 'react-i18next'
import { usePatientProfile } from '@/hooks/usePatientProfile'
import { useExportRecords } from '@/hooks/useExportRecords'
import { getEncryptedDbConnection } from '@/lib/encrypted-db'

/** Mask a national ID: show first 3 and last 2 chars */
function maskNationalId(value: string): string {
  if (value.length <= 5) return '***'
  return `${value.slice(0, 3)}${'*'.repeat(value.length - 5)}${value.slice(-2)}`
}

/** Calculate age from ISO date string or year-only string */
function calculateAge(birthDate: string, birthYearOnly: boolean): string {
  const now = new Date()
  if (birthYearOnly) {
    const year = parseInt(birthDate, 10)
    if (isNaN(year)) return '—'
    return `~${now.getFullYear() - year}`
  }
  const dob = new Date(birthDate)
  if (isNaN(dob.getTime())) return '—'
  let age = now.getFullYear() - dob.getFullYear()
  const monthDiff = now.getMonth() - dob.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) {
    age--
  }
  if (age < 0) return '—'
  return String(age)
}

/** Get display name from FHIR Patient name array */
function getDisplayName(patient: FhirPatient): string {
  const name = patient.name[0]
  if (!name) return patient._ultranos.nameLocal
  if (name.text) return name.text
  const parts: string[] = []
  if (name.given) parts.push(...name.given)
  if (name.family) parts.push(name.family)
  return parts.join(' ') || patient._ultranos.nameLocal
}

/** Find national ID from identifiers array */
function getNationalId(patient: FhirPatient): string | undefined {
  return patient.identifier?.find(
    (id) => id.system === 'UAE_NATIONAL_ID' || id.system === 'PASSPORT',
  )?.value
}

interface ProfileFieldProps {
  label: string
  value: string
  masked?: boolean
  onToggleMask?: () => void
  testID?: string
  colors: ReturnType<typeof useTheme>['colors']
}

function ProfileField({ label, value, masked, onToggleMask, testID, colors }: ProfileFieldProps) {
  return (
    <View style={styles.fieldContainer}>
      <Text
        style={[styles.label, { color: colors.textMuted }]}
        accessibilityRole="text"
      >
        {label}
      </Text>
      <View style={styles.fieldValueRow}>
        <Text
          style={[styles.bodyText, { color: colors.textSecondary }]}
          testID={testID}
          accessibilityLabel={`${label}: ${masked ? 'hidden' : (onToggleMask != null ? 'shown on screen' : value)}`}
        >
          {value}
        </Text>
        {onToggleMask != null && (
          <Pressable
            onPress={onToggleMask}
            style={[styles.toggleButton, { backgroundColor: colors.primary[50] }]}
            accessibilityRole="button"
            accessibilityLabel={masked ? 'Show ID' : 'Hide ID'}
            testID="toggle-national-id"
          >
            <Text style={[styles.toggleText, { color: colors.primary[600] }]}>
              {masked ? 'Show' : 'Hide'}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  )
}

export function ProfileScreen() {
  const { patient, isLoading, error } = usePatientProfile()
  const { colors } = useTheme()
  const { t } = useTranslation()
  const [idMasked, setIdMasked] = useState(true)
  const { isExporting, progressText, exportRecords } = useExportRecords()

  const toggleIdMask = useCallback(() => {
    setIdMasked((prev) => !prev)
  }, [])

  const handleExport = useCallback(async () => {
    if (!patient) return
    try {
      const db = await getEncryptedDbConnection()
      await exportRecords(db, patient.id)
    } catch {
      Alert.alert(t('passport.exportFailed'), t('passport.exportFailedMessage'))
    }
  }, [patient, exportRecords])

  const displayData = useMemo(() => {
    if (!patient) return null
    const nationalId = getNationalId(patient)
    return {
      name: getDisplayName(patient),
      localName: patient._ultranos.nameLocal,
      age: patient.birthDate ? calculateAge(patient.birthDate, patient.birthYearOnly) : '—',
      gender: patient.gender,
      nationalId,
      maskedNationalId: nationalId ? maskNationalId(nationalId) : undefined,
    }
  }, [patient])

  if (isLoading) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.surface }, styles.centered]} testID="profile-loading">
        <ActivityIndicator size="large" color={colors.primary[500]} />
        <Text style={[styles.bodyText, { color: colors.textSecondary }, styles.loadingText]}>
          {t('passport.loadingProfile')}
        </Text>
      </View>
    )
  }

  if (error || !patient || !displayData) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.surface }, styles.centered]} testID="profile-error">
        <Text style={[styles.subheaderText, { color: colors.textPrimary }]}>
          {t('passport.unableToLoad')}
        </Text>
        <Text style={[styles.bodyText, { color: colors.textSecondary }]}>
          {error ?? t('passport.profileUnavailable')}
        </Text>
      </View>
    )
  }

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: colors.surface }]}
      contentContainerStyle={styles.scrollContent}
      testID="profile-screen"
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.headerText, { color: colors.textPrimary }]}>{t('passport.title')}</Text>
        <Text style={[styles.captionText, { color: colors.textMuted }]}>{t('passport.subtitle')}</Text>
      </View>

      {/* Demographics Card */}
      <View
        style={[styles.card, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }, styles.demographicsCard]}
        testID="demographics-card"
      >
        <ProfileField label={t('passport.fieldName')} value={displayData.name} testID="patient-name" colors={colors} />
        {displayData.localName !== displayData.name && (
          <ProfileField label={t('passport.fieldNameLocal')} value={displayData.localName} testID="patient-name-local" colors={colors} />
        )}
        <ProfileField label={t('passport.fieldAge')} value={displayData.age} testID="patient-age" colors={colors} />
        <ProfileField label={t('passport.fieldGender')} value={displayData.gender} testID="patient-gender" colors={colors} />
        {displayData.nationalId && (
          <ProfileField
            label={t('passport.fieldNationalId')}
            value={idMasked ? (displayData.maskedNationalId ?? '***') : displayData.nationalId}
            masked={idMasked}
            onToggleMask={toggleIdMask}
            testID="patient-national-id"
            colors={colors}
          />
        )}
      </View>

      {/* QR Identity Card */}
      <View
        style={[styles.card, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }, styles.qrCard]}
        testID="qr-card"
      >
        <Text style={[styles.subheaderText, { color: colors.textPrimary }, styles.qrTitle]}>
          {t('passport.qrTitle')}
        </Text>
        <Text style={[styles.captionText, { color: colors.textMuted }, styles.qrSubtitle]}>
          {t('passport.qrSubtitle')}
        </Text>
        <PatientQRCode patientId={patient.id} />
      </View>

      {/* Export My Records — Premium feature (Story 27.11) */}
      <PremiumGate
        featureId="MEDICAL_HISTORY_EXPORT"
        featureTitle={t('premium.exportTitle', 'Medical History Export')}
        featureDescription={t('premium.exportDescription', 'Download your complete medical history as a FHIR-standard health record bundle.')}
      >
        <Pressable
          style={[
            styles.card,
            styles.exportButton,
            { backgroundColor: colors.primary[500], borderColor: colors.primary[600] },
            isExporting && styles.exportButtonDisabled,
          ]}
          onPress={handleExport}
          disabled={isExporting}
          accessibilityRole="button"
          accessibilityLabel={t('passport.exportButton')}
          accessibilityState={{ disabled: isExporting }}
          testID="export-records-button"
        >
          {isExporting ? (
            <View style={styles.exportLoadingRow}>
              <ActivityIndicator size="small" color="#FFFFFF" />
              <Text style={styles.exportButtonText} testID="export-progress-text">
                {progressText}
              </Text>
            </View>
          ) : (
            <Text style={styles.exportButtonText}>
              {t('passport.exportButton')}
            </Text>
          )}
        </Pressable>
      </PremiumGate>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: consumerSpacing.screenPadding,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: consumerSpacing.cardPadding,
  },
  scrollContent: {
    paddingVertical: consumerSpacing.sectionGap,
    gap: consumerSpacing.sectionGap,
  },
  header: {
    gap: 4,
    marginBottom: 4,
  },
  headerText: {
    fontSize: consumerTypography.headerSize,
    fontWeight: consumerTypography.fontWeightHeader,
  },
  subheaderText: {
    fontSize: consumerTypography.subheaderSize,
    fontWeight: consumerTypography.fontWeightHeader,
  },
  bodyText: {
    fontSize: consumerTypography.bodySize,
  },
  captionText: {
    fontSize: consumerTypography.captionSize,
  },
  label: {
    fontSize: consumerTypography.captionSize,
    fontWeight: consumerTypography.fontWeightLabel,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  card: {
    borderRadius: consumerBorderRadius.card,
    padding: consumerSpacing.cardPadding,
    borderWidth: 1,
  },
  demographicsCard: {
    gap: consumerSpacing.cardPadding,
  },
  fieldContainer: {
    gap: 2,
  },
  fieldValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: consumerBorderRadius.badge,
    minWidth: consumerSpacing.touchTarget,
    alignItems: 'center',
  },
  toggleText: {
    fontSize: consumerTypography.captionSize,
    fontWeight: consumerTypography.fontWeightLabel,
  },
  qrCard: {
    alignItems: 'center',
    gap: 8,
  },
  qrTitle: {
    textAlign: 'center',
  },
  qrSubtitle: {
    textAlign: 'center',
    marginBottom: 8,
  },
  exportButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: consumerSpacing.touchTarget,
  },
  exportButtonDisabled: {
    opacity: 0.7,
  },
  exportButtonText: {
    color: '#FFFFFF',
    fontSize: consumerTypography.bodySize,
    fontWeight: consumerTypography.fontWeightHeader,
    textAlign: 'center',
  },
  exportLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
})
