/**
 * Notification bell indicator for Patient Lite Mobile.
 * Story 12.4 / 18.6: Now backed by notification store.
 *
 * Displays the bell icon with unread badge. Tapping navigates
 * to the Notifications tab instead of opening a modal.
 */
import { Pressable, View, Text, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useNavigation } from '@react-navigation/native'
import { useUnreadNotificationCount } from '@/hooks/useUnreadNotificationCount'
import { consumerSpacing } from '@/theme/consumer'
import { useTheme } from '@/theme/ThemeProvider'

export function NotificationIndicator() {
  const { t } = useTranslation()
  const { colors } = useTheme()
  const navigation = useNavigation()
  const unreadCount = useUnreadNotificationCount()

  return (
    <Pressable
      onPress={() => {
        // Navigate to the Notifications tab via parent (tab navigator)
        const parent = navigation.getParent()
        if (parent) {
          parent.navigate('NotificationsTab')
        } else {
          // Fallback: try direct navigation if no parent navigator
          (navigation as any).navigate?.('NotificationsTab')
        }
      }}
      style={styles.bellButton}
      accessibilityLabel={
        unreadCount > 0
          ? t('notifications.bellUnreadAccessibility', { count: unreadCount })
          : t('notifications.bellAccessibility')
      }
      accessibilityRole="button"
    >
      <Text style={styles.bellIcon}>{'\u{1F514}'}</Text>
      {unreadCount > 0 && (
        <View style={[styles.badge, { backgroundColor: colors.error }]}>
          <Text style={styles.badgeText}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </Text>
        </View>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  bellButton: {
    position: 'relative',
    padding: consumerSpacing.sm,
  },
  bellIcon: {
    fontSize: 24,
  },
  badge: {
    position: 'absolute',
    top: 0,
    end: 0,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
})
