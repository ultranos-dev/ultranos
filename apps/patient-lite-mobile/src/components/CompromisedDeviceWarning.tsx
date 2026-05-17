/**
 * CompromisedDeviceWarning — Full-screen warning overlay for compromised devices.
 *
 * Story 21.5 AC#2: When a rooted/jailbroken device is detected, display a warning
 * and disable clinical features. Users can view existing local data in read-only
 * mode but cannot perform clinical write operations.
 */
import { useState } from 'react'
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native'
import { useDeviceSecurityStore } from '@/stores/device-security-store'
import { consumerColors, consumerSpacing, consumerTypography } from '@/theme/consumer'

export function CompromisedDeviceWarning() {
  const { reasons } = useDeviceSecurityStore()
  const [viewingData, setViewingData] = useState(false)

  if (viewingData) {
    return (
      <View style={styles.container}>
        <View style={styles.banner}>
          <Text style={styles.bannerText}>
            Read-Only Mode — Device Compromised
          </Text>
        </View>
        <View style={styles.readOnlyContent}>
          <Text style={styles.readOnlyNotice}>
            Clinical write operations are disabled on this device. You can view
            existing local data only.
          </Text>
          <Pressable
            style={styles.backButton}
            onPress={() => setViewingData(false)}
            accessibilityRole="button"
            accessibilityLabel="Return to security warning"
          >
            <Text style={styles.backButtonText}>Back to Warning</Text>
          </Pressable>
        </View>
      </View>
    )
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
    >
      <View style={styles.warningCard}>
        <Text style={styles.icon}>⚠</Text>
        <Text style={styles.title}>Device Security Warning</Text>
        <Text style={styles.message}>
          This device has been identified as compromised. Clinical features have
          been disabled to protect patient data.
        </Text>

        <View style={styles.reasonsBox}>
          <Text style={styles.reasonsLabel}>Detection Details:</Text>
          {reasons.map((reason) => (
            <Text key={reason} style={styles.reasonItem}>
              • {formatReason(reason)}
            </Text>
          ))}
        </View>

        <Text style={styles.guidance}>
          To restore full access, please use an unmodified device with no
          root/jailbreak modifications.
        </Text>

        <Pressable
          style={styles.viewDataButton}
          onPress={() => setViewingData(true)}
          accessibilityRole="button"
          accessibilityLabel="View existing data in read-only mode"
        >
          <Text style={styles.viewDataButtonText}>
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
    backgroundColor: consumerColors.surface,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: consumerSpacing.screenPadding,
  },
  warningCard: {
    backgroundColor: '#FEF2F2',
    borderRadius: 16,
    padding: 24,
    borderWidth: 2,
    borderColor: '#DC2626',
    alignItems: 'center',
  },
  icon: {
    fontSize: 48,
    marginBottom: 16,
  },
  title: {
    fontSize: consumerTypography.headerSize,
    fontWeight: consumerTypography.fontWeightHeader,
    color: '#DC2626',
    textAlign: 'center',
    marginBottom: 12,
  },
  message: {
    fontSize: consumerTypography.bodySize,
    color: consumerColors.textPrimary,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 20,
  },
  reasonsBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 16,
    width: '100%',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  reasonsLabel: {
    fontSize: consumerTypography.captionSize,
    fontWeight: consumerTypography.fontWeightLabel,
    color: consumerColors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  reasonItem: {
    fontSize: consumerTypography.bodySize,
    color: consumerColors.textPrimary,
    lineHeight: 24,
    paddingStart: 4,
  },
  guidance: {
    fontSize: consumerTypography.captionSize,
    color: consumerColors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  viewDataButton: {
    backgroundColor: consumerColors.surface,
    borderWidth: 1,
    borderColor: consumerColors.border,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    width: '100%',
    alignItems: 'center',
  },
  viewDataButtonText: {
    fontSize: consumerTypography.bodySize,
    fontWeight: consumerTypography.fontWeightLabel,
    color: consumerColors.textSecondary,
  },
  banner: {
    backgroundColor: '#DC2626',
    paddingVertical: 10,
    paddingHorizontal: consumerSpacing.screenPadding,
    alignItems: 'center',
  },
  bannerText: {
    color: '#FFFFFF',
    fontSize: consumerTypography.captionSize,
    fontWeight: consumerTypography.fontWeightLabel,
  },
  readOnlyContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: consumerSpacing.screenPadding,
  },
  readOnlyNotice: {
    fontSize: consumerTypography.bodySize,
    color: consumerColors.textSecondary,
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
    color: consumerColors.textMuted,
    textDecorationLine: 'underline',
  },
})
