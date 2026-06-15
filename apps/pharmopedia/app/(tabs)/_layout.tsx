import { Tabs } from 'expo-router'
import { Search, Folder, Bookmark, User } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { useAutoSync } from '@/hooks/useAutoSync'
import { FontFamily, FontSize, Shadow } from '@ultranos/ui-kit/tokens.native'
import { useThemeColors } from '@/hooks/useThemeColors'

export default function TabsLayout() {
  const { t } = useTranslation()
  useAutoSync()
  const colors = useThemeColors()

  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: colors.primary500,
      tabBarInactiveTintColor: colors.textMuted,
      tabBarLabelStyle: {
        fontFamily: FontFamily.sansMedium,
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
          title: t('tabs.search'),
          tabBarIcon: ({ color, size }) => <Search color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="browse"
        options={{
          title: t('tabs.browse'),
          tabBarIcon: ({ color, size }) => <Folder color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="saved"
        options={{
          title: t('tabs.saved'),
          tabBarIcon: ({ color, size }) => <Bookmark color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('tabs.profile'),
          tabBarIcon: ({ color, size }) => <User color={color} size={size} />,
        }}
      />
    </Tabs>
  )
}
