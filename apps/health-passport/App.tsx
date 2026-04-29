import { useEffect } from 'react'
import { Platform, SafeAreaView, StatusBar, StyleSheet } from 'react-native'
import { ProfileScreen } from '@/screens/ProfileScreen'
import { consumerColors } from '@/theme/consumer'
import { wipeMemoryStore } from '@/lib/offline-store'

export function App() {
  // Wire PWA Key-in-Memory enforcement: wipe on tab close
  useEffect(() => {
    if (Platform.OS !== 'web') return

    const handleUnload = () => wipeMemoryStore()
    window.addEventListener('beforeunload', handleUnload)
    return () => window.removeEventListener('beforeunload', handleUnload)
  }, [])

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
