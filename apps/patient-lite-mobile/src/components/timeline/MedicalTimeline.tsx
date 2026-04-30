import { useState, useCallback } from 'react'
import {
  View,
  Text,
  Pressable,
  FlatList,
  StyleSheet,
  ActivityIndicator,
} from 'react-native'
import { TimelineIcon } from './TimelineIcon'
import { ActiveMedications } from './ActiveMedications'
import type { TimelineEvent } from '@/hooks/useMedicalHistory'
import { emitAuditEvent } from '@/lib/audit'
import {
  consumerColors,
  consumerSpacing,
  consumerBorderRadius,
  consumerTypography,
  consumerStyles,
} from '@/theme/consumer'

interface MedicalTimelineProps {
  events: TimelineEvent[]
  activeMedications: TimelineEvent[]
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
function getStatusColor(status: string): string {
  switch (status) {
    case 'finished':
    case 'completed':
      return 'hsl(160, 60%, 35%)'
    case 'active':
    case 'in-progress':
    case 'arrived':
      return consumerColors.secondary[500]
    case 'cancelled':
    case 'stopped':
    case 'entered-in-error':
      return consumerColors.textMuted
    default:
      return consumerColors.textSecondary
  }
}

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

  const handlePress = useCallback(() => {
    if (event.isSensitive && !expanded) {
      // Block sensitive reveal without a patient context — audit is mandatory
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
    setExpanded((prev) => !prev)
  }, [event.id, event.isSensitive, event.type, expanded, patientId])

  return (
    <View style={styles.itemRow} testID={`timeline-item-${event.id}`}>
      {/* Connector line + icon column */}
      <View style={styles.iconColumn}>
        <TimelineIcon
          icon={event.icon}
          isActive={event.status === 'active'}
          testID={`timeline-icon-${event.id}`}
        />
        {!isLast && <View style={styles.connectorLine} />}
      </View>

      {/* Content */}
      <Pressable
        style={({ pressed }) => [
          styles.contentCard,
          pressed && styles.contentCardPressed,
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
        <Text style={styles.dateText}>{formatDate(event.date)}</Text>

        {/* Label — hide real label for sensitive entries */}
        <Text style={styles.labelText}>
          {event.isSensitive && !expanded
            ? 'Private Health Matter'
            : event.label}
        </Text>

        {/* Status badge */}
        <View style={styles.statusRow}>
          <View
            style={[
              styles.statusDot,
              { backgroundColor: getStatusColor(event.status) },
            ]}
          />
          <Text style={[styles.statusText, { color: getStatusColor(event.status) }]}>
            {event.status}
          </Text>
        </View>

        {/* Expanded simple view */}
        {expanded && (
          <View style={styles.detailSection} testID={`timeline-detail-${event.id}`}>
            <Text style={styles.detailLabel}>
              {event.type === 'encounter' ? 'Visit Details' : 'Medicine Details'}
            </Text>
            {event.isSensitive && (
              <Text style={styles.sensitiveNote}>
                Sensitive — shown only on your request
              </Text>
            )}
            <Text style={styles.detailText}>{event.label}</Text>
            <Text style={styles.detailDate}>Date: {formatDate(event.date)}</Text>
          </View>
        )}
      </Pressable>
    </View>
  )
}

export function MedicalTimeline({
  events,
  activeMedications,
  isLoading,
  error,
  patientId,
}: MedicalTimelineProps) {
  if (isLoading) {
    return (
      <View style={[consumerStyles.screen, styles.centered]} testID="timeline-loading">
        <ActivityIndicator size="large" color={consumerColors.primary[500]} />
        <Text style={[consumerStyles.bodyText, styles.loadingText]}>
          Loading your medical history...
        </Text>
      </View>
    )
  }

  if (error) {
    return (
      <View style={[consumerStyles.screen, styles.centered]} testID="timeline-error">
        <Text style={consumerStyles.subheaderText}>Unable to load history</Text>
        <Text style={consumerStyles.bodyText}>{error}</Text>
      </View>
    )
  }

  if (events.length === 0) {
    return (
      <View style={[consumerStyles.screen, styles.centered]} testID="timeline-empty">
        <Text style={styles.emptyEmoji}>📋</Text>
        <Text style={consumerStyles.subheaderText}>No medical history yet</Text>
        <Text style={consumerStyles.bodyText}>
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
          <Text style={consumerStyles.headerText}>My Health History</Text>
          <Text style={consumerStyles.captionText}>
            Your visits and medicines
          </Text>

          {activeMedications.length > 0 && (
            <View style={styles.activeMedsSection}>
              <ActiveMedications medications={activeMedications} />
            </View>
          )}

          <Text
            style={[consumerStyles.subheaderText, styles.timelineLabel]}
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
    backgroundColor: consumerColors.border,
    marginVertical: 4,
  },
  contentCard: {
    flex: 1,
    backgroundColor: consumerColors.surfaceElevated,
    borderRadius: consumerBorderRadius.card,
    padding: consumerSpacing.cardPadding,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: consumerColors.border,
    gap: 6,
    // Touch target >= 44px enforced by minHeight + padding
    minHeight: 48,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  contentCardPressed: {
    backgroundColor: consumerColors.primary[50],
    borderColor: consumerColors.primary[200],
  },
  dateText: {
    fontSize: consumerTypography.captionSize,
    color: consumerColors.textMuted,
    fontWeight: consumerTypography.fontWeightLabel,
  },
  labelText: {
    fontSize: consumerTypography.bodySize,
    fontWeight: consumerTypography.fontWeightHeader,
    color: consumerColors.textPrimary,
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
    borderTopColor: consumerColors.border,
    gap: 4,
  },
  detailLabel: {
    fontSize: consumerTypography.captionSize,
    fontWeight: consumerTypography.fontWeightLabel,
    color: consumerColors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sensitiveNote: {
    fontSize: consumerTypography.captionSize,
    color: 'hsl(30, 80%, 40%)',
    fontStyle: 'italic',
  },
  detailText: {
    fontSize: consumerTypography.bodySize,
    color: consumerColors.textPrimary,
    lineHeight: 22,
  },
  detailDate: {
    fontSize: consumerTypography.captionSize,
    color: consumerColors.textSecondary,
  },
})
