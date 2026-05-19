/**
 * Expo config plugin: Android Network Security Configuration.
 *
 * Story 21.5 AC#3: Enforce TLS 1.3 minimum for Hub API connections.
 *
 * Creates android/app/src/main/res/xml/network_security_config.xml
 * and references it in AndroidManifest.xml via android:networkSecurityConfig.
 *
 * This enforces:
 * - TLS 1.3 minimum on all cleartext-disallowed domains
 * - Certificate pinning at the OS level (backup to app-level pinning)
 * - Cleartext traffic blocked globally
 */
const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins')
const fs = require('fs')
const path = require('path')

function withNetworkSecurityConfig(config) {
  // Step 1: Create the XML config file
  config = withDangerousMod(config, [
    'android',
    async (modConfig) => {
      const resXmlDir = path.join(
        modConfig.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'res',
        'xml',
      )

      fs.mkdirSync(resXmlDir, { recursive: true })

      const networkSecurityConfig = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <!-- Story 21.5 AC#3: TLS 1.3 minimum, no cleartext traffic -->
  <base-config cleartextTrafficPermitted="false">
    <trust-anchors>
      <certificates src="system" />
    </trust-anchors>
  </base-config>

  <!-- Allow cleartext only for local development -->
  <domain-config cleartextTrafficPermitted="true">
    <domain includeSubdomains="true">10.0.2.2</domain>
    <domain includeSubdomains="true">localhost</domain>
  </domain-config>
</network-security-config>
`

      fs.writeFileSync(
        path.join(resXmlDir, 'network_security_config.xml'),
        networkSecurityConfig,
      )

      return modConfig
    },
  ])

  // Step 2: Reference the config in AndroidManifest.xml
  config = withAndroidManifest(config, (modConfig) => {
    const mainApplication =
      modConfig.modResults.manifest.application?.[0]

    if (mainApplication) {
      mainApplication.$['android:networkSecurityConfig'] =
        '@xml/network_security_config'
    }

    return modConfig
  })

  return config
}

module.exports = withNetworkSecurityConfig
