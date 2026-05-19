import { View, Text, Pressable, StyleSheet, StatusBar, I18nManager, ActivityIndicator } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useNavigation } from '@react-navigation/native'
import { PatientQRCode } from '@/components/PatientQRCode'
import { usePatientProfile } from '@/hooks/usePatientProfile'
import { consumerTypography, consumerSpacing } from '@/theme/consumer'
import { useTheme } from '@/theme/ThemeProvider'

export function QRFullScreen() {
  const { t } = useTranslation()
  const { colors } = useTheme()
  const navigation = useNavigation()
  const { patient, isLoading } = usePatientProfile()

  if (isLoading) {
    return (
      <View style={styles.container} testID="qr-full-screen-loading">
        <StatusBar barStyle="light-content" />
        <ActivityIndicator size="large" color="#FFFFFF" />
      </View>
    )
  }

  if (!patient) {
    return (
      <View style={styles.container} testID="qr-full-screen-empty">
        <StatusBar barStyle="light-content" />
        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
        >
          <Text style={styles.backText}>{I18nManager.isRTL ? '→' : '←'} {t('common.back')}</Text>
        </Pressable>
        <Text style={styles.hint}>{t('passport.profileUnavailable')}</Text>
      </View>
    )
  }

  return (
    <View style={styles.container} testID="qr-full-screen">
      <StatusBar barStyle="light-content" />
      <Pressable
        onPress={() => navigation.goBack()}
        style={styles.backButton}
        accessibilityRole="button"
        accessibilityLabel={t('common.back')}
        testID="qr-fullscreen-back"
      >
        <Text style={styles.backText}>{I18nManager.isRTL ? '→' : '←'} {t('common.back')}</Text>
      </Pressable>
      <View style={styles.qrContainer}>
        <PatientQRCode patientId={patient.id} />
      </View>
      <Text style={styles.hint}>
        {t('passport.qrSubtitle')}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1A1A1A',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: consumerSpacing.screenPadding,
  },
  backButton: {
    position: 'absolute',
    top: 60,
    ...(I18nManager.isRTL ? { right: consumerSpacing.screenPadding } : { left: consumerSpacing.screenPadding }),
    paddingVertical: 12,
    paddingHorizontal: 16,
    minWidth: consumerSpacing.touchTarget,
    minHeight: consumerSpacing.touchTarget,
  },
  backText: {
    color: '#FFFFFF',
    fontSize: consumerTypography.bodySize,
    fontWeight: '600',
  },
  qrContainer: {
    transform: [{ scale: 1.3 }],
    marginBottom: 40,
  },
  hint: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: consumerTypography.bodySize,
    textAlign: 'center',
  },
})
