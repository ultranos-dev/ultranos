import { useEffect } from 'react'
import { Platform, SafeAreaView, StatusBar, StyleSheet } from 'react-native'
import { ProfileScreen } from '@/screens/ProfileScreen'
import { consumerColors } from '@/theme/consumer'
import { wipeMemoryStore } from '@/lib/offline-store'
import { checkDeviceIntegrity } from '@/lib/device-security'
import { useDeviceSecurityStore } from '@/stores/device-security-store'
import { emitDeviceIntegrityAudit } from '@/lib/device-integrity-audit'
import { CompromisedDeviceWarning } from '@/components/CompromisedDeviceWarning'

export function App() {
  const { checked, isCompromised, setResult } = useDeviceSecurityStore()

  // Run device integrity check on launch (before rendering clinical views)
  useEffect(() => {
    checkDeviceIntegrity()
      .then((result) => {
        setResult(result)
        emitDeviceIntegrityAudit(result)
      })
      .catch(() => {
        // Fail-closed: treat unexpected errors as compromised
        const failResult = { isCompromised: true, reasons: ['detection-error'] }
        setResult(failResult)
        emitDeviceIntegrityAudit(failResult)
      })
  }, [setResult])

  // Wire PWA Key-in-Memory enforcement: wipe on tab close
  useEffect(() => {
    if (Platform.OS !== 'web') return

    const handleUnload = () => wipeMemoryStore()
    window.addEventListener('beforeunload', handleUnload)
    return () => window.removeEventListener('beforeunload', handleUnload)
  }, [])

  // Block rendering until integrity check completes
  if (!checked) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor={consumerColors.surface} />
      </SafeAreaView>
    )
  }

  // Show warning overlay for compromised devices
  if (isCompromised) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor={consumerColors.surface} />
        <CompromisedDeviceWarning />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={consumerColors.surface} />
      <ProfileScreen />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: consumerColors.surface,
  },
})
