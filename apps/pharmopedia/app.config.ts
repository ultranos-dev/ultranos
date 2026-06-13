import type { ExpoConfig, ConfigContext } from 'expo/config'

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Pharmopedia',
  slug: 'pharmopedia',
  version: '0.1.0',
  scheme: 'pharmopedia',
  web: { bundler: 'metro', output: 'single' },
  plugins: [
    'expo-router',
    'expo-sqlite',
    'expo-secure-store',
    ['expo-location', { locationAlwaysAndWhenInUsePermission: 'Allow Pharmopedia to use your location to find nearby pharmacies.' }],
  ],
  experiments: { typedRoutes: true },
})
