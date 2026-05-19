import { useState, useCallback, useRef, useEffect } from 'react'
import {
  View,
  Text,
  Pressable,
  FlatList,
  StyleSheet,
  ActivityIndicator,
} from 'react-native'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { TimelineIcon } from './TimelineIcon'
import { ActiveMedications } from './ActiveMedications'
import { AllergyBanner } from '@/components/AllergyBanner'
import type { TimelineEvent } from '@/hooks/useMedicalHistory'
import type { FhirAllergyIntolerance } from '@ultranos/shared-types'
import type { TimelineStackParamList } from '@/navigation/types'
import { emitAuditEvent } from '@/lib/audit'
import { unlockWithBiometrics } from '@/lib/mobile-key-service'
import { useTheme } from '@/theme/ThemeProvider'
import {
  consumerSpacing,
  consumerBorderRadius,
  consumerTypography,
} from '@/theme/consumer'

interface MedicalTimelineProps {
  events: TimelineEvent[]
  activeMedications: TimelineEvent[]
  activeAllergies?: FhirAllergyIntolerance[]
  isLoading: boolean
  error: string | null
  patientId?: string
}

/** Format a date string to a short, readable form using Gregorian calendar */
function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) return dateStr
    return date.toLocaleDateString('en-u-ca-gregory', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return dateStr
  }
}

/** Status color coding: green for completed, blue for active/in-progress */
function getStatusColor(status: string, colors: { secondary: { 500: string }; textMuted: string; textSecondary: string }): string {
  switch (status) {
    case 'finished':
    case 'completed':
      return 'hsl(160, 60%, 35%)'
    case 'active':
    case 'in-progress':
    case 'arrived':
      return colors.secondary[500]
    case 'cancelled':
    case 'stopped':
    case 'entered-in-error':
      return colors.textMuted
    default:
      return colors.textSecondary
  }
}

const MEDICATION_AUTO_HIDE_MS = 30_000

function TimelineItem({
  event,
  isLast,
  patientId,
}: {
  event: TimelineEvent
  isLast: boolean
  patientId?: string
}) {
  const [expanded, setExpanded] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [authenticating, setAuthenticating] = useState(false)
  const autoHideRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { colors } = useTheme()
  const navigation = useNavigation<NativeStackNavigationProp<TimelineStackParamList>>()

  // Clean up auto-hide timer on unmount
  useEffect(() => {
    return () => {
      if (autoHideRef.current) clearTimeout(autoHideRef.current)
    }
  }, [])

  const handlePress = useCallback(async () => {
    if (authenticating) return

    // Allergy items navigate to detail screen
    if (event.type === 'allergy') {
      navigation.navigate('AllergyDetailScreen', { allergyId: event.id })
      return
    }

    // Sensitive medications require biometric confirmation (Story 18.9)
    if (event.isSensitive && event.type === 'medication' && !expanded) {
      if (!patientId) return
      setAuthError(null)
      setAuthenticating(true)

      try {
        const result = await unlockWithBiometrics()
        if (!result.success) {
          setAuthError('Authentication failed')
          setAuthenticating(false)
          return
        }

        // AC #4: Emit PHI_UNMASK audit event
        emitAuditEvent({
          action: 'PHI_UNMASK',
          resourceType: 'MedicationRequest',
          resourceId: event.id,
          patientId,
          outcome: 'success',
          metadata: { unmaskedBy: patientId },
        })

        setExpanded(true)
        setAuthenticating(false)

        // AC #5: Auto-hide after 30 seconds
        if (autoHideRef.current) clearTimeout(autoHideRef.current)
        autoHideRef.current = setTimeout(() => {
          setExpanded(false)
          autoHideRef.current = null
        }, MEDICATION_AUTO_HIDE_MS)
      } catch {
        setAuthError('Authentication failed')
        setAuthenticating(false)
      }
      return
    }

    // Non-medication sensitive items: simple tap-to-reveal (encounters)
    if (event.isSensitive && !expanded) {
      if (!patientId) return
      emitAuditEvent({
        action: 'PHI_DISPLAY',
        resourceType: event.type === 'encounter' ? 'Encounter' : 'MedicationRequest',
        resourceId: event.id,
        patientId,
        outcome: 'success',
        metadata: { sensitive: 'true' },
      })
    }

    // Collapsing a sensitive medication clears the auto-hide timer
    if (event.isSensitive && event.type === 'medication' && expanded) {
      if (autoHideRef.current) {
        clearTimeout(autoHideRef.current)
        autoHideRef.current = null
      }
    }

    setExpanded((prev) => !prev)
  }, [event.id, event.isSensitive, event.type, expanded, patientId, navigation, authenticating])

  return (
    <View style={styles.itemRow} testID={`timeline-item-${event.id}`}>
      {/* Connector line + icon column */}
      <View style={styles.iconColumn}>
        <TimelineIcon
          icon={event.icon}
          isActive={event.status === 'active'}
          testID={`timeline-icon-${event.id}`}
        />
        {!isLast && <View style={[styles.connectorLine, { backgroundColor: colors.border }]} />}
      </View>

      {/* Content */}
      <Pressable
        style={({ pressed }) => [
          styles.contentCard,
          {
            backgroundColor: colors.surfaceElevated,
            borderColor: colors.border,
            shadowColor: colors.shadow,
          },
          event.type === 'allergy' && [styles.allergyCard, { borderStartColor: colors.error, backgroundColor: colors.dangerBg ?? '#FEF2F2' }],
          pressed && {
            backgroundColor: colors.primary[50],
            borderColor: colors.primary[200],
          },
        ]}
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityLabel={
          event.isSensitive && !expanded
            ? 'Private health matter. Tap to view details.'
            : `${event.label}. ${formatDate(event.date)}. Tap for details.`
        }
        accessibilityHint="Double-tap to view details"
        testID={`timeline-card-${event.id}`}
      >
        {/* Date marker */}
        <Text style={[styles.dateText, { color: colors.textMuted }]}>{formatDate(event.date)}</Text>

        {/* Label — hide real label for sensitive entries */}
        <Text style={[styles.labelText, { color: colors.textPrimary }]}>
          {event.isSensitive && !expanded
            ? '\uD83D\uDD12 Private Health Matter'
            : event.label}
        </Text>

        {/* Status badge */}
        <View style={styles.statusRow}>
          <View
            style={[
              styles.statusDot,
              { backgroundColor: getStatusColor(event.status, colors) },
            ]}
          />
          <Text style={[styles.statusText, { color: getStatusColor(event.status, colors) }]}>
            {event.status}
          </Text>
        </View>

        {/* Auth error for sensitive medication biometric failure */}
        {authError && (
          <Text style={[styles.authErrorText, { color: colors.error }]} testID={`auth-error-${event.id}`}>
            {authError}
          </Text>
        )}

        {/* Expanded simple view */}
        {expanded && (
          <View style={[styles.detailSection, { borderTopColor: colors.border }]} testID={`timeline-detail-${event.id}`}>
            <Text style={[styles.detailLabel, { color: colors.textMuted }]}>
              {event.type === 'encounter' ? 'Visit Details' : event.type === 'allergy' ? 'Allergy Recorded' : 'Medicine Details'}
            </Text>
            {event.isSensitive && (
              <Text style={[styles.sensitiveNote, { color: colors.sensitiveText }]}>
                Sensitive — shown only on your request
              </Text>
            )}
            <Text style={[styles.detailText, { color: colors.textPrimary }]}>{event.label}</Text>
            <Text style={[styles.detailDate, { color: colors.textSecondary }]}>Date: {formatDate(event.date)}</Text>
          </View>
        )}
      </Pressable>
    </View>
  )
}

export function MedicalTimeline({
  events,
  activeMedications,
  activeAllergies = [],
  isLoading,
  error,
  patientId,
}: MedicalTimelineProps) {
  const { colors } = useTheme()

  if (isLoading) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.surface }, styles.centered]} testID="timeline-loading">
        <ActivityIndicator size="large" color={colors.primary[500]} />
        <Text style={[styles.bodyText, { color: colors.textSecondary }, styles.loadingText]}>
          Loading your medical history...
        </Text>
      </View>
    )
  }

  if (error) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.surface }, styles.centered]} testID="timeline-error">
        <Text style={[styles.subheaderText, { color: colors.textPrimary }]}>Unable to load history</Text>
        <Text style={[styles.bodyText, { color: colors.textSecondary }]}>{error}</Text>
      </View>
    )
  }

  if (events.length === 0) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.surface }, styles.centered]} testID="timeline-empty">
        {/* AC #6: Show allergy indicator even when no timeline events */}
        <View style={styles.allergySection}>
          <AllergyBanner allergies={activeAllergies} />
        </View>
        <Text style={styles.emptyEmoji}>📋</Text>
        <Text style={[styles.subheaderText, { color: colors.textPrimary }]}>No medical history yet</Text>
        <Text style={[styles.bodyText, { color: colors.textSecondary }]}>
          Your visits and medicines will appear here
        </Text>
      </View>
    )
  }

  return (
    <FlatList
      data={events}
      keyExtractor={(item) => item.id}
      renderItem={({ item, index }) => (
        <TimelineItem
          event={item}
          isLast={index === events.length - 1}
          patientId={patientId}
        />
      )}
      ListHeaderComponent={
        <View style={styles.header}>
          <Text style={[styles.headerText, { color: colors.textPrimary }]}>My Health History</Text>
          <Text style={[styles.captionText, { color: colors.textMuted }]}>
            Your visits and medicines
          </Text>

          {/* ALLERGY BANNER — ALWAYS FIRST per CLAUDE.md rule #4 */}
          <View style={styles.allergySection}>
            <AllergyBanner allergies={activeAllergies} />
          </View>

          {activeMedications.length > 0 && (
            <View style={styles.activeMedsSection}>
              <ActiveMedications medications={activeMedications} patientId={patientId} />
            </View>
          )}

          <Text
            style={[styles.subheaderText, { color: colors.textPrimary }, styles.timelineLabel]}
            accessibilityRole="header"
          >
            Timeline
          </Text>
        </View>
      }
      contentContainerStyle={styles.listContent}
      testID="medical-timeline"
    />
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: consumerSpacing.screenPadding,
    paddingVertical: consumerSpacing.sectionGap,
  },
  bodyText: {
    fontSize: consumerTypography.bodySize,
    lineHeight: 22,
  },
  subheaderText: {
    fontSize: consumerTypography.subheaderSize,
    fontWeight: consumerTypography.fontWeightHeader,
  },
  headerText: {
    fontSize: consumerTypography.headerSize,
    fontWeight: consumerTypography.fontWeightHeader,
  },
  captionText: {
    fontSize: consumerTypography.captionSize,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: consumerSpacing.cardPadding,
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  header: {
    gap: 4,
    marginBottom: 16,
  },
  allergySection: {
    marginTop: 12,
  },
  activeMedsSection: {
    marginTop: 16,
  },
  timelineLabel: {
    marginTop: 20,
  },
  listContent: {
    paddingHorizontal: consumerSpacing.screenPadding,
    paddingVertical: consumerSpacing.sectionGap,
  },
  itemRow: {
    flexDirection: 'row',
    gap: 12,
    minHeight: 80,
  },
  iconColumn: {
    alignItems: 'center',
    width: 48,
  },
  connectorLine: {
    flex: 1,
    width: 2,
    marginVertical: 4,
  },
  contentCard: {
    flex: 1,
    borderRadius: consumerBorderRadius.card,
    padding: consumerSpacing.cardPadding,
    marginBottom: 12,
    borderWidth: 1,
    gap: 6,
    // Touch target >= 44px enforced by minHeight + padding
    minHeight: 48,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  allergyCard: {
    borderStartWidth: 4,
  },
  dateText: {
    fontSize: consumerTypography.captionSize,
    fontWeight: consumerTypography.fontWeightLabel,
  },
  labelText: {
    fontSize: consumerTypography.bodySize,
    fontWeight: consumerTypography.fontWeightHeader,
    lineHeight: 24,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: consumerTypography.captionSize,
    fontWeight: consumerTypography.fontWeightLabel,
    textTransform: 'capitalize',
  },
  detailSection: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    gap: 4,
  },
  detailLabel: {
    fontSize: consumerTypography.captionSize,
    fontWeight: consumerTypography.fontWeightLabel,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sensitiveNote: {
    fontSize: consumerTypography.captionSize,
    fontStyle: 'italic',
  },
  authErrorText: {
    fontSize: consumerTypography.captionSize,
    textAlign: 'center',
  },
  detailText: {
    fontSize: consumerTypography.bodySize,
    lineHeight: 22,
  },
  detailDate: {
    fontSize: consumerTypography.captionSize,
  },
})
