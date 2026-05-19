/**
 * CompromisedDeviceWarning — Full-screen warning overlay for compromised devices.
 *
 * Story 21.5 AC#2: When a rooted/jailbroken device is detected, display a warning
 * and disable clinical features. Users can view existing local data in read-only
 * mode but cannot perform clinical write operations.
 */
import { useState, useEffect } from 'react'
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native'
import { useDeviceSecurityStore } from '@/stores/device-security-store'
import { consumerSpacing, consumerTypography } from '@/theme/consumer'
import { useTheme } from '@/theme/ThemeProvider'
import { SAFETY_COLORS } from '@/theme/colors'
import { loadPatientProfile, loadMedicalHistory } from '@/lib/offline-store'
import type { FhirPatient } from '@ultranos/shared-types'
import type { StoredMedicalHistory } from '@/lib/offline-store'

export function CompromisedDeviceWarning() {
  const { reasons } = useDeviceSecurityStore()
  const [viewingData, setViewingData] = useState(false)
  const [profile, setProfile] = useState<FhirPatient | null>(null)
  const [history, setHistory] = useState<StoredMedicalHistory | null>(null)
  const { theme, colors } = useTheme()

  // Load local data when user enters read-only mode
  useEffect(() => {
    if (!viewingData) return
    void (async () => {
      const p = await loadPatientProfile()
      setProfile(p)
      if (p?.id) {
        const h = await loadMedicalHistory(p.id)
        setHistory(h)
      }
    })().catch(() => {
      // Corrupted storage — show "no data" rather than crash
      setProfile(null)
      setHistory(null)
    })
  }, [viewingData])

  const warningCardBg = theme === 'dark' ? SAFETY_COLORS.warningCardBgDark : SAFETY_COLORS.warningCardBg
  const warningCardBorder = theme === 'dark' ? SAFETY_COLORS.warningCardBorderDark : SAFETY_COLORS.warningCardBorder
  const warningReasonsBg = theme === 'dark' ? SAFETY_COLORS.warningReasonsBgDark : SAFETY_COLORS.warningReasonsBg
  const warningReasonsBorder = theme === 'dark' ? SAFETY_COLORS.warningReasonsBorderDark : SAFETY_COLORS.warningReasonsBorder

  if (viewingData) {
    return (
      <View style={[styles.container, { backgroundColor: colors.surface }]}>
        <View style={[styles.banner, { backgroundColor: SAFETY_COLORS.bannerBg }]}>
          <Text style={styles.bannerText}>
            Read-Only Mode — Device Compromised
          </Text>
        </View>
        <ScrollView style={styles.readOnlyScroll} contentContainerStyle={styles.readOnlyScrollContent}>
          <Text style={[styles.readOnlyNotice, { color: colors.textSecondary }]}>
            Clinical write operations are disabled on this device. You can view
            existing local data only.
          </Text>

          {profile && (
            <View style={[styles.dataSection, { borderColor: colors.border }]}>
              <Text style={[styles.dataSectionTitle, { color: colors.textPrimary }]}>Patient Profile</Text>
              <Text style={[styles.dataItem, { color: colors.textPrimary }]}>
                {profile.name?.[0]?.given?.join(' ')} {profile.name?.[0]?.family}
              </Text>
              {profile.birthDate && (
                <Text style={[styles.dataItemMuted, { color: colors.textMuted }]}>DOB: {profile.birthDate}</Text>
              )}
            </View>
          )}

          {history?.allergies && history.allergies.length > 0 && (
            <View style={[styles.dataSection, styles.allergySection]}>
              <Text style={styles.allergyTitle}>Allergies</Text>
              {history.allergies.map((a) => (
                <Text key={a.id} style={styles.allergyItem}>
                  • {a.code?.coding?.[0]?.display ?? a._ultranos?.substanceFreeText ?? 'Unknown'}
                </Text>
              ))}
            </View>
          )}

          {history?.medications && history.medications.length > 0 && (
            <View style={[styles.dataSection, { borderColor: colors.border }]}>
              <Text style={[styles.dataSectionTitle, { color: colors.textPrimary }]}>Medications</Text>
              {history.medications.map((m) => (
                <Text key={m.id} style={[styles.dataItem, { color: colors.textPrimary }]}>
                  • {m.medicationCodeableConcept?.coding?.[0]?.display ?? 'Medication'}
                </Text>
              ))}
            </View>
          )}

          {history?.encounters && history.encounters.length > 0 && (
            <View style={[styles.dataSection, { borderColor: colors.border }]}>
              <Text style={[styles.dataSectionTitle, { color: colors.textPrimary }]}>Recent Encounters</Text>
              {history.encounters.slice(0, 10).map((e) => (
                <Text key={e.id} style={[styles.dataItem, { color: colors.textPrimary }]}>
                  • {e.period?.start ? new Date(e.period.start).toLocaleDateString() : 'Unknown date'} — {e.reasonCode?.[0]?.coding?.[0]?.display ?? e.class?.display ?? 'Encounter'}
                </Text>
              ))}
            </View>
          )}

          {!profile && !history && (
            <Text style={[styles.dataItemMuted, { color: colors.textMuted }]}>No local data available.</Text>
          )}

          <Pressable
            style={styles.backButton}
            onPress={() => setViewingData(false)}
            accessibilityRole="button"
            accessibilityLabel="Return to security warning"
          >
            <Text style={[styles.backButtonText, { color: colors.textMuted }]}>Back to Warning</Text>
          </Pressable>
        </ScrollView>
      </View>
    )
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.surface }]}
      contentContainerStyle={styles.scrollContent}
    >
      <View style={[styles.warningCard, { backgroundColor: warningCardBg, borderColor: warningCardBorder }]}>
        <Text style={styles.icon}>⚠</Text>
        <Text style={[styles.title, { color: warningCardBorder }]}>Device Security Warning</Text>
        <Text style={[styles.message, { color: colors.textPrimary }]}>
          This device has been identified as compromised. Clinical features have
          been disabled to protect patient data.
        </Text>

        <View style={[styles.reasonsBox, { backgroundColor: warningReasonsBg, borderColor: warningReasonsBorder }]}>
          <Text style={[styles.reasonsLabel, { color: colors.textMuted }]}>Detection Details:</Text>
          {reasons.map((reason) => (
            <Text key={reason} style={[styles.reasonItem, { color: colors.textPrimary }]}>
              • {formatReason(reason)}
            </Text>
          ))}
        </View>

        <Text style={[styles.guidance, { color: colors.textSecondary }]}>
          To restore full access, please use an unmodified device with no
          root/jailbreak modifications.
        </Text>

        <Pressable
          style={[styles.viewDataButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={() => setViewingData(true)}
          accessibilityRole="button"
          accessibilityLabel="View existing data in read-only mode"
        >
          <Text style={[styles.viewDataButtonText, { color: colors.textSecondary }]}>
            View Existing Data (Read-Only)
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  )
}

function formatReason(reason: string): string {
  switch (reason) {
    case 'rooted':
      return 'Device is rooted or jailbroken'
    case 'mock-location':
      return 'Mock location provider detected'
    case 'debug-mode':
      return 'Debug mode is active'
    case 'external-storage':
      return 'App installed on external storage'
    case 'detection-unavailable':
      return 'Security check could not complete'
    default:
      return reason
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: consumerSpacing.screenPadding,
  },
  warningCard: {
    borderRadius: 16,
    padding: 24,
    borderWidth: 2,
    alignItems: 'center',
  },
  icon: {
    fontSize: 48,
    marginBottom: 16,
  },
  title: {
    fontSize: consumerTypography.headerSize,
    fontWeight: consumerTypography.fontWeightHeader,
    textAlign: 'center',
    marginBottom: 12,
  },
  message: {
    fontSize: consumerTypography.bodySize,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 20,
  },
  reasonsBox: {
    borderRadius: 8,
    padding: 16,
    width: '100%',
    marginBottom: 20,
    borderWidth: 1,
  },
  reasonsLabel: {
    fontSize: consumerTypography.captionSize,
    fontWeight: consumerTypography.fontWeightLabel,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  reasonItem: {
    fontSize: consumerTypography.bodySize,
    lineHeight: 24,
    paddingStart: 4,
  },
  guidance: {
    fontSize: consumerTypography.captionSize,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  viewDataButton: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    width: '100%',
    alignItems: 'center',
  },
  viewDataButtonText: {
    fontSize: consumerTypography.bodySize,
    fontWeight: consumerTypography.fontWeightLabel,
  },
  banner: {
    paddingVertical: 10,
    paddingHorizontal: consumerSpacing.screenPadding,
    alignItems: 'center',
  },
  bannerText: {
    color: '#FFFFFF',
    fontSize: consumerTypography.captionSize,
    fontWeight: consumerTypography.fontWeightLabel,
  },
  readOnlyScroll: {
    flex: 1,
  },
  readOnlyScrollContent: {
    padding: consumerSpacing.screenPadding,
  },
  readOnlyContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: consumerSpacing.screenPadding,
  },
  dataSection: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  dataSectionTitle: {
    fontSize: consumerTypography.captionSize,
    fontWeight: consumerTypography.fontWeightLabel,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  dataItem: {
    fontSize: consumerTypography.bodySize,
    lineHeight: 22,
    paddingStart: 4,
  },
  dataItemMuted: {
    fontSize: consumerTypography.captionSize,
    paddingStart: 4,
    marginTop: 2,
  },
  allergySection: {
    borderWidth: 2,
    borderColor: '#DC2626',
    backgroundColor: '#FEF2F2',
  },
  allergyTitle: {
    fontSize: consumerTypography.captionSize,
    fontWeight: consumerTypography.fontWeightLabel,
    color: '#DC2626',
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  allergyItem: {
    fontSize: consumerTypography.bodySize,
    color: '#DC2626',
    lineHeight: 22,
    paddingStart: 4,
  },
  readOnlyNotice: {
    fontSize: consumerTypography.bodySize,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 20,
  },
  backButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  backButtonText: {
    fontSize: consumerTypography.bodySize,
    textDecorationLine: 'underline',
  },
})
