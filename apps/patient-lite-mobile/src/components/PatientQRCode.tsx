import { useState, useEffect, useCallback } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import QRCode from 'react-native-qrcode-svg'
import { consumerBorderRadius, consumerTypography } from '@/theme/consumer'
import { useTheme } from '@/theme/ThemeProvider'
import { QR_COLORS } from '@/theme/colors'

/**
 * Identity QR payload — per CLAUDE.md:
 * "QR codes — Identity (Health Passport): Contain { patient_id, issued_at, expiry, ECDSA-P256 signature } — never raw PHI."
 *
 * Field mapping (JWT-standard short names for QR compactness):
 *   pid = patient_id, iat = issued_at, exp = expiry
 *
 * The signature is generated server-side during profile sync. For offline display,
 * we encode the patient_id, issued_at, and expiry. The clinician's scanner app
 * looks up full demographics from the Hub using patient_id.
 */
export interface IdentityQRPayload {
  /** FHIR Patient UUID */
  pid: string
  /** ISO 8601 instant — when the QR was issued */
  iat: string
  /** ISO 8601 instant — when the QR expires (24h from issue) */
  exp: string
  /** Version marker for forward compatibility */
  v: 1
}

const QR_EXPIRY_HOURS = 24
const QR_SIZE = 220
const QR_REFRESH_MS = QR_EXPIRY_HOURS * 60 * 60 * 1000

interface PatientQRCodeProps {
  patientId: string
  /** Pre-computed signature from server (base64). Optional until @ultranos/crypto supports mobile ECDSA-P256. */
  signature?: string
}

function generatePayload(patientId: string, signature?: string): string {
  const now = new Date()
  const expiry = new Date(now.getTime() + QR_REFRESH_MS)

  const qrPayload: IdentityQRPayload = {
    pid: patientId,
    iat: now.toISOString(),
    exp: expiry.toISOString(),
    v: 1,
  }

  const data = signature
    ? { ...qrPayload, sig: signature }
    : qrPayload

  return JSON.stringify(data)
}

export function PatientQRCode({ patientId, signature }: PatientQRCodeProps) {
  const { theme, colors } = useTheme()
  const [payload, setPayload] = useState(() => generatePayload(patientId, signature))

  const refresh = useCallback(() => {
    setPayload(generatePayload(patientId, signature))
  }, [patientId, signature])

  // Regenerate payload when props change
  useEffect(() => {
    refresh()
  }, [refresh])

  // Auto-refresh before expiry
  useEffect(() => {
    const timer = setInterval(refresh, QR_REFRESH_MS)
    return () => clearInterval(timer)
  }, [refresh])

  if (!patientId) {
    return null
  }

  const isUnsigned = !signature

  return (
    <View style={styles.container} testID="patient-qr-code">
      {/* AC #10: QR always renders black-on-white, never inverted */}
      <View style={[styles.qrWrapper, { borderColor: theme === 'dark' ? QR_COLORS.wrapperBorderDark : QR_COLORS.wrapperBorderLight }]}>
        <QRCode
          value={payload}
          size={QR_SIZE}
          color={QR_COLORS.foreground}
          backgroundColor={QR_COLORS.background}
          ecl="M"
        />
      </View>
      {isUnsigned && (
        <View style={[styles.unverifiedBadge, { backgroundColor: colors.warningBg, borderColor: colors.warningBorder }]} testID="qr-unverified-badge">
          <Text style={[styles.unverifiedText, { color: colors.warningText }]}>Unverified</Text>
        </View>
      )}
      <Text style={[styles.hint, { color: colors.textMuted }]} accessibilityRole="text">
        Valid for {QR_EXPIRY_HOURS} hours
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  qrWrapper: {
    // AC #10: White background always — QR scannability requirement
    backgroundColor: QR_COLORS.background,
    padding: 16,
    borderRadius: consumerBorderRadius.qrContainer,
    borderWidth: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  unverifiedBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  unverifiedText: {
    fontSize: consumerTypography.captionSize,
    fontWeight: '600',
  },
  hint: {
    fontSize: consumerTypography.captionSize,
    textAlign: 'center',
  },
})
