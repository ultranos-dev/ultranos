import { SafeAreaView, StatusBar, StyleSheet, Text, View } from 'react-native'

export function App() {
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <View style={styles.content}>
        <Text style={styles.brand}>Ultranos</Text>
        <Text style={styles.title}>OPD Lite Mobile</Text>
        <View style={styles.divider} />
        <Text style={styles.subtitle}>Coming Soon — Mobile Clinician App</Text>
        <Text style={styles.description}>
          Offline-first clinical tools for field General Practitioners in
          rural and low-connectivity environments.
        </Text>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  brand: {
    fontSize: 32,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '500',
    color: '#475569',
    marginTop: 4,
  },
  divider: {
    width: 48,
    height: 2,
    backgroundColor: '#3B82F6',
    marginVertical: 24,
    borderRadius: 1,
  },
  subtitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E40AF',
    textAlign: 'center',
  },
  description: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 20,
  },
})
