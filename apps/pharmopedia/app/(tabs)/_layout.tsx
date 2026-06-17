import { Tabs } from 'expo-router'
import { Home, Folder, Bookmark, User } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { useAutoSync } from '@/hooks/useAutoSync'
import { FontFamily, FontSize, Shadow } from '@ultranos/ui-kit/tokens.native'
import { useThemeColors } from '@/hooks/useThemeColors'
import { useLangStore, isRtlLang } from '@/store/lang-store'
import { AnimatedTabIcon } from '@/components/AnimatedTabIcon'
import { TabBarButton } from '@/components/TabBarButton'

export default function TabsLayout() {
  const { t } = useTranslation()
  useAutoSync()
  const colors = useThemeColors()
  const rtl = isRtlLang(useLangStore((s) => s.lang))

  return (
    <Tabs screenOptions={{
      headerShown: false,
      // Instant tab switching (native iOS behavior). A fade/shift would animate
      // scene opacity, which makes shadowed Cards flash a gray box mid-transition.
      animation: 'none',
      tabBarActiveTintColor: colors.primary500,
      tabBarInactiveTintColor: colors.textMuted,
      tabBarButton: (props) => <TabBarButton {...props} />,
      tabBarLabelStyle: {
        fontFamily: rtl ? FontFamily.arabic : FontFamily.sansMedium,
        fontSize: FontSize.xs,
      },
      tabBarStyle: {
        backgroundColor: colors.surfaceElevated,
        borderTopColor: colors.borderSubtle,
        ...Shadow.sm,
      },
    }}>
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.home'),
          tabBarIcon: ({ color, size, focused }) => <AnimatedTabIcon icon={Home} color={color} size={size} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="browse"
        options={{
          title: t('tabs.browse'),
          tabBarIcon: ({ color, size, focused }) => <AnimatedTabIcon icon={Folder} color={color} size={size} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="saved"
        options={{
          title: t('tabs.saved'),
          tabBarIcon: ({ color, size, focused }) => <AnimatedTabIcon icon={Bookmark} color={color} size={size} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('tabs.profile'),
          tabBarIcon: ({ color, size, focused }) => <AnimatedTabIcon icon={User} color={color} size={size} focused={focused} />,
        }}
      />
    </Tabs>
  )
}
