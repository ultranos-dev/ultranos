/**
 * Build a mailto: URI for issue reporting.
 * Includes ONLY sanitized, non-PHI diagnostic info:
 * app version, device model, OS version, error category, timestamp.
 * NEVER includes: patient name, patient ID, health data, raw error stack.
 */

import { Platform, Linking } from 'react-native'
import type { SafeError } from './error-sanitizer'
import appConfig from '../../app.json'

const SUPPORT_EMAIL = 'support@ultranos.com'
const SUBJECT = 'Patient App Issue Report'

interface DeviceInfo {
  appVersion: string
  deviceModel: string
  osVersion: string
}

function getDeviceInfo(): DeviceInfo {
  return {
    appVersion: appConfig.expo.version,
    deviceModel: Platform.OS === 'ios' ? 'iOS Device' : 'Android Device',
    osVersion: `${Platform.OS} ${Platform.Version}`,
  }
}

export function buildReportMailtoUrl(safeError: SafeError): string {
  const device = getDeviceInfo()
  const timestamp = new Date().toISOString()

  const body = [
    '--- Issue Report ---',
    `App Version: ${device.appVersion}`,
    `Device: ${device.deviceModel}`,
    `OS: ${device.osVersion}`,
    `Error Category: ${safeError.category}`,
    `Error Type: ${safeError.type}`,
    `Timestamp: ${timestamp}`,
    '',
    'Please describe what you were doing when the error occurred:',
    '',
  ].join('\r\n')

  const params = new URLSearchParams({
    subject: SUBJECT,
    body,
  })

  return `mailto:${SUPPORT_EMAIL}?${params.toString()}`
}

/**
 * Opens the device email client with a pre-filled issue report.
 * Returns true if the email client was opened, false if no mail client is available.
 */
export async function openReportIssue(safeError: SafeError): Promise<boolean> {
  const url = buildReportMailtoUrl(safeError)
  const canOpen = await Linking.canOpenURL(url)
  if (canOpen) {
    await Linking.openURL(url)
    return true
  }
  return false
}
