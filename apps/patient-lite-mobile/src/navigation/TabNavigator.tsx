import { Text, View, StyleSheet } from 'react-native'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { useTranslation } from 'react-i18next'
import { NAV_ICONS, TAB_DEFINITIONS } from '@/config/icon-vocabulary'
import { LongPressTooltip } from '@/components/LongPressTooltip'
import { consumerTypography } from '@/theme/consumer'
import { useTheme } from '@/theme/ThemeProvider'
import { useUnreadNotificationCount } from '@/hooks/useUnreadNotificationCount'
import { HomeStack } from './HomeStack'
import { TimelineStack } from './TimelineStack'
import { PrivacyStack } from './PrivacyStack'
import { NotificationsStack } from './NotificationsStack'
import type { RootTabParamList } from './types'

const Tab = createBottomTabNavigator<RootTabParamList>()

const TAB_BAR_HEIGHT = 64
const ICON_SIZE = 32

/** Map TabKey → Tab screen component */
const TAB_SCREENS: Record<string, { name: keyof RootTabParamList; component: React.ComponentType }> = {
  passport: { name: 'HomeTab', component: HomeStack },
  timeline: { name: 'TimelineTab', component: TimelineStack },
  privacy: { name: 'PrivacyTab', component: PrivacyStack },
  notifications: { name: 'NotificationsTab', component: NotificationsStack },
}

export function TabNavigator() {
  const { t } = useTranslation()
  const { colors } = useTheme()
  const unreadCount = useUnreadNotificationCount()

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: [styles.tabBar, { backgroundColor: colors.surfaceElevated, borderTopColor: colors.border }],
        tabBarActiveTintColor: colors.primary[600],
        tabBarInactiveTintColor: colors.textMuted,
        tabBarHideOnKeyboard: true,
        tabBarLabelStyle: styles.tabLabel,
      }}
    >
      {TAB_DEFINITIONS.map((tab) => {
        const screen = TAB_SCREENS[tab.key]
        if (!screen) return null

        const icon = NAV_ICONS[tab.icon]
        const isNotifications = tab.key === 'notifications'

        return (
          <Tab.Screen
            key={tab.key}
            name={screen.name}
            component={screen.component}
            options={{
              tabBarLabel: t(tab.labelKey),
              tabBarIcon: ({ focused }) => (
                <LongPressTooltip tooltip={t(tab.labelKey)}>
                  <View style={[styles.iconContainer, focused && [styles.iconContainerActive, { backgroundColor: colors.primary[50] }]]}>
                    <Text
                      style={[styles.icon, focused && styles.iconActive]}
                    >
                      {icon.emoji}
                    </Text>
                  </View>
                </LongPressTooltip>
              ),
              tabBarBadge: isNotifications && unreadCount > 0
                ? (unreadCount > 99 ? '99+' : unreadCount)
                : undefined,
              tabBarBadgeStyle: [styles.badge, { backgroundColor: colors.error }],
              tabBarAccessibilityLabel: t(tab.labelKey),
              tabBarTestID: `tab-${tab.key}`,
              tabBarIconStyle: styles.tabIconStyle,
            }}
          />
        )
      })}
    </Tab.Navigator>
  )
}

const styles = StyleSheet.create({
  tabBar: {
    height: TAB_BAR_HEIGHT,
    paddingBottom: 8,
    borderTopWidth: 1,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: consumerTypography.fontWeightBody,
  },
  tabIconStyle: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainer: {
    width: ICON_SIZE + 8,
    height: ICON_SIZE + 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  iconContainerActive: {},
  icon: {
    fontSize: ICON_SIZE,
    writingDirection: 'ltr',
    opacity: 0.5,
  },
  iconActive: {
    opacity: 1,
  },
  badge: {
    fontSize: 11,
    fontWeight: '700',
    minWidth: 20,
    height: 20,
  },
})
