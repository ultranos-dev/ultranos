import { useMemo } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { FhirPatient } from '@ultranos/shared-types'
import {
  consumerSpacing,
  consumerBorderRadius,
  consumerTypography,
} from '@/theme/consumer'
import { useTheme } from '@/theme/ThemeProvider'

interface PatientSummaryCardProps {
  patient: FhirPatient
}

function getDisplayName(patient: FhirPatient): string {
  const name = patient.name?.[0]
  if (!name) return patient._ultranos?.nameLocal ?? 'Unknown'
  if (name.text) return name.text
  const parts: string[] = []
  if (name.given) parts.push(...name.given)
  if (name.family) parts.push(name.family)
  return parts.join(' ') || patient._ultranos?.nameLocal || 'Unknown'
}

function getInitials(patient: FhirPatient): string {
  const name = patient.name?.[0]
  if (!name) return '?'
  const first = name.given?.[0]?.[0] ?? ''
  const last = name.family?.[0] ?? ''
  return (first + last).toUpperCase() || '?'
}

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

const GENDER_ICONS: Record<string, string> = {
  male: '♂',
  female: '♀',
  other: '⚧',
  unknown: '—',
}

export function PatientSummaryCard({ patient }: PatientSummaryCardProps) {
  const { t } = useTranslation()
  const { colors } = useTheme()

  const displayData = useMemo(() => ({
    name: getDisplayName(patient),
    initials: getInitials(patient),
    age: patient.birthDate ? calculateAge(patient.birthDate, patient.birthYearOnly) : '—',
    gender: patient.gender,
    genderIcon: GENDER_ICONS[patient.gender] ?? '—',
  }), [patient])

  return (
    <View style={[styles.card, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]} testID="patient-summary-card">
      <View style={[styles.avatarCircle, { backgroundColor: colors.primary[100] }]} accessibilityRole="image" accessibilityLabel={displayData.initials}>
        <Text style={[styles.avatarText, { color: colors.primary[700] }]}>{displayData.initials}</Text>
      </View>
      <View style={styles.info}>
        <Text style={[styles.name, { color: colors.textPrimary }]} testID="summary-patient-name" numberOfLines={2}>
          {displayData.name}
        </Text>
        <View style={styles.detailsRow}>
          <Text style={[styles.detail, { color: colors.textSecondary }]} testID="summary-patient-age">
            {t('dashboard.age', { age: displayData.age })}
          </Text>
          <Text style={[styles.detailSeparator, { color: colors.textMuted }]}>·</Text>
          <Text style={[styles.detail, { color: colors.textSecondary }]} testID="summary-patient-gender">
            {displayData.genderIcon} {displayData.gender}
          </Text>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  avatarCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 22,
    fontWeight: '700',
  },
  info: {
    flex: 1,
    gap: 4,
  },
  name: {
    fontSize: consumerTypography.subheaderSize,
    fontWeight: consumerTypography.fontWeightHeader,
  },
  detailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detail: {
    fontSize: consumerTypography.bodySize,
  },
  detailSeparator: {
    fontSize: consumerTypography.bodySize,
  },
})
