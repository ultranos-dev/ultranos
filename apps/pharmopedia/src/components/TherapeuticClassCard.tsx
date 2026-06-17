import { View, Text, StyleSheet } from 'react-native'
import Animated, { FadeInUp } from 'react-native-reanimated'
import type { LucideIcon } from 'lucide-react-native'
import { ChevronRight, Heart, Pill, Shield, Brain, Bone, Eye, Baby, Droplets, Flame, Activity } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { FontFamily, FontSize, Spacing, Radius } from '@ultranos/ui-kit/tokens.native'
import { ListRow, useReducedMotion } from '@ultranos/ui-kit/native'
import { useThemeColors } from '@/hooks/useThemeColors'

const CLASS_ICONS: Record<string, LucideIcon> = {
  cardiovascular: Heart,
  analgesic: Pill,
  'anti-infective': Shield,
  neurological: Brain,
  musculoskeletal: Bone,
  ophthalmic: Eye,
  pediatric: Baby,
  renal: Droplets,
  'anti-inflammatory': Flame,
}

function getClassIcon(name: string) {
  const key = name.toLowerCase()
  for (const [k, Icon] of Object.entries(CLASS_ICONS)) {
    if (key.includes(k)) return Icon
  }
  return Activity
}

interface Props {
  name: string
  count: number
  onPress: () => void
  index?: number
}

export function TherapeuticClassCard({ name, count, onPress, index }: Props) {
  const { t } = useTranslation()
  const colors = useThemeColors()
  const reduced = useReducedMotion()
  const Icon = getClassIcon(name)
  const enterDelay = Math.min((index ?? 0) * 50, 500)

  const row = (
    <ListRow
      testID={`class-card-${name}`}
      icon={Icon}
      label={name}
      accessibilityLabel={`${name}, ${count} ${t('browse.drugsCountLabel')}`}
      onPress={onPress}
      trailing={
        <View style={styles.trailing}>
          <View style={[styles.countBadge, { backgroundColor: colors.primary50 }]}>
            <Text style={[styles.countText, { color: colors.primary600 }]}>{count}</Text>
          </View>
          <ChevronRight size={16} color={colors.textMuted} />
        </View>
      }
    />
  )

  if (reduced) return row
  return <Animated.View entering={FadeInUp.delay(enterDelay).duration(300)}>{row}</Animated.View>
}

const styles = StyleSheet.create({
  trailing: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  countBadge: { paddingHorizontal: Spacing[2], paddingVertical: Spacing[1], borderRadius: Radius.full, minWidth: 28, alignItems: 'center' },
  countText: { fontSize: FontSize.sm, fontFamily: FontFamily.sansSemibold },
})
