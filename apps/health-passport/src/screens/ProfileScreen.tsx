import { useState, useCallback, useMemo } from 'react'
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from 'react-native'
import type { FhirPatient } from '@ultranos/shared-types'
import { PatientQRCode } from '@/components/PatientQRCode'
import {
  consumerColors,
  consumerSpacing,
  consumerBorderRadius,
  consumerTypography,
  consumerStyles,
} from '@/theme/consumer'
import { usePatientProfile } from '@/hooks/usePatientProfile'

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
}

function ProfileField({ label, value, masked, onToggleMask, testID }: ProfileFieldProps) {
  return (
    <View style={styles.fieldContainer}>
      <Text
        style={consumerStyles.label}
        accessibilityRole="text"
      >
        {label}
      </Text>
      <View style={styles.fieldValueRow}>
        <Text
          style={consumerStyles.bodyText}
          testID={testID}
          accessibilityLabel={`${label}: ${masked ? 'hidden' : (onToggleMask != null ? 'shown on screen' : value)}`}
        >
          {value}
        </Text>
        {onToggleMask != null && (
          <Pressable
            onPress={onToggleMask}
            style={styles.toggleButton}
            accessibilityRole="button"
            accessibilityLabel={masked ? 'Show ID' : 'Hide ID'}
            testID="toggle-national-id"
          >
            <Text style={styles.toggleText}>
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
  const [idMasked, setIdMasked] = useState(true)

  const toggleIdMask = useCallback(() => {
    setIdMasked((prev) => !prev)
  }, [])

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
      <View style={[consumerStyles.screen, styles.centered]} testID="profile-loading">
        <ActivityIndicator size="large" color={consumerColors.primary[500]} />
        <Text style={[consumerStyles.bodyText, styles.loadingText]}>
          Loading your profile...
        </Text>
      </View>
    )
  }

  if (error || !patient || !displayData) {
    return (
      <View style={[consumerStyles.screen, styles.centered]} testID="profile-error">
        <Text style={consumerStyles.subheaderText}>
          Unable to load profile
        </Text>
        <Text style={consumerStyles.bodyText}>
          {error ?? 'Profile data is not available.'}
        </Text>
      </View>
    )
  }

  return (
    <ScrollView
      style={consumerStyles.screen}
      contentContainerStyle={styles.scrollContent}
      testID="profile-screen"
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={consumerStyles.headerText}>My Passport</Text>
        <Text style={consumerStyles.captionText}>Your health identity card</Text>
      </View>

      {/* Demographics Card */}
      <View style={[consumerStyles.card, styles.demographicsCard]} testID="demographics-card">
        <ProfileField
          label="Name"
          value={displayData.name}
          testID="patient-name"
        />
        {displayData.localName !== displayData.name && (
          <ProfileField
            label="Name (Local)"
            value={displayData.localName}
            testID="patient-name-local"
          />
        )}
        <ProfileField
          label="Age"
          value={displayData.age}
          testID="patient-age"
        />
        <ProfileField
          label="Gender"
          value={displayData.gender}
          testID="patient-gender"
        />
        {displayData.nationalId && (
          <ProfileField
            label="National ID"
            value={idMasked ? (displayData.maskedNationalId ?? '***') : displayData.nationalId}
            masked={idMasked}
            onToggleMask={toggleIdMask}
            testID="patient-national-id"
          />
        )}
      </View>

      {/* QR Identity Card */}
      <View style={[consumerStyles.card, styles.qrCard]} testID="qr-card">
        <Text style={[consumerStyles.subheaderText, styles.qrTitle]}>
          Your Medical ID
        </Text>
        <Text style={[consumerStyles.captionText, styles.qrSubtitle]}>
          Show this QR code to your healthcare provider
        </Text>
        <PatientQRCode patientId={patient.id} />
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
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
    backgroundColor: consumerColors.primary[50],
    minWidth: consumerSpacing.touchTarget,
    alignItems: 'center',
  },
  toggleText: {
    fontSize: consumerTypography.captionSize,
    fontWeight: consumerTypography.fontWeightLabel,
    color: consumerColors.primary[600],
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
})
