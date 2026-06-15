import { View, Text, Pressable, StyleSheet } from 'react-native'
import Animated, { FadeInUp } from 'react-native-reanimated'
import {
  Heart, Pill, Shield, Brain, Bone, Eye, Baby, Droplets, Flame, Activity, ChevronRight,
} from 'lucide-react-native'
import { FontFamily, FontSize, Spacing, Radius } from '@ultranos/ui-kit/tokens.native'
import { useThemeColors } from '@/hooks/useThemeColors'

const CLASS_ICONS: Record<string, React.ComponentType<{ size: number; color: string }>> = {
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
  const colors = useThemeColors()
  const enterDelay = Math.min((index ?? 0) * 50, 500)
  const Icon = getClassIcon(name)

  return (
    <Animated.View entering={FadeInUp.delay(enterDelay).duration(300)}>
      <Pressable
        testID={`class-card-${name}`}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.card,
          { backgroundColor: pressed ? colors.surfaceSubtle : colors.surface, borderBottomColor: colors.borderSubtle },
        ]}
        onPress={onPress}
      >
        <View style={[styles.iconCircle, { backgroundColor: colors.surfaceSubtle }]}>
          <Icon size={20} color={colors.primary500} />
        </View>
        <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={2}>
          {name}
        </Text>
        <View style={[styles.countBadge, { backgroundColor: colors.primary50 }]}>
          <Text style={[styles.countText, { color: colors.primary600 }]}>{count}</Text>
        </View>
        <ChevronRight size={16} color={colors.textMuted} />
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[3],
    borderBottomWidth: 1,
    gap: Spacing[3],
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  name: {
    fontSize: FontSize.base,
    fontFamily: FontFamily.sansMedium,
    flex: 1,
  },
  countBadge: {
    paddingHorizontal: Spacing[2],
    paddingVertical: Spacing[1],
    borderRadius: Radius.full,
    minWidth: 28,
    alignItems: 'center',
  },
  countText: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.sansSemibold,
  },
})
