import { useEffect, useRef } from 'react'
import { AppState, Platform, SafeAreaView, StatusBar, StyleSheet } from 'react-native'
import type { AppStateStatus } from 'react-native'
import { ProfileScreen } from '@/screens/ProfileScreen'
import { wipeMemoryStore } from '@/lib/offline-store'
import { checkDeviceIntegrity } from '@/lib/device-security'
import { useDeviceSecurityStore } from '@/stores/device-security-store'
import { emitDeviceIntegrityAudit } from '@/lib/device-integrity-audit'
import { CompromisedDeviceWarning } from '@/components/CompromisedDeviceWarning'
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider'
import { validatePins } from '@/config/certificate-pins'

// Validate certificate pins at module load — crashes on placeholder pins in production
validatePins()

function AppContent() {
  const { checked, isCompromised, setResult } = useDeviceSecurityStore()
  const { colors } = useTheme()

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

  // Re-check device integrity when app returns to foreground
  const appStateRef = useRef<AppStateStatus>(AppState.currentState)
  useEffect(() => {
    if (Platform.OS === 'web') return

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (appStateRef.current.match(/inactive|background/) && nextState === 'active') {
        checkDeviceIntegrity()
          .then((result) => {
            setResult(result)
            emitDeviceIntegrityAudit(result)
          })
          .catch(() => {
            const failResult = { isCompromised: true, reasons: ['detection-error'] }
            setResult(failResult)
            emitDeviceIntegrityAudit(failResult)
          })
      }
      appStateRef.current = nextState
    })

    return () => subscription.remove()
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
      <SafeAreaView style={[styles.container, { backgroundColor: colors.surface }]}>
        <StatusBar barStyle={colors.statusBarStyle} backgroundColor={colors.surface} />
      </SafeAreaView>
    )
  }

  // Show warning overlay for compromised devices
  if (isCompromised) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.surface }]}>
        <StatusBar barStyle={colors.statusBarStyle} backgroundColor={colors.surface} />
        <CompromisedDeviceWarning />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.surface }]}>
      <StatusBar barStyle={colors.statusBarStyle} backgroundColor={colors.surface} />
      <ProfileScreen />
    </SafeAreaView>
  )
}

export function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
})
